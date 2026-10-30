# 后端开发

本文维护服务端模块接入与路由注册。依赖方向见[系统架构](architecture.md)，HTTP 契约与镜像源配置见 [接口参考](api.md)，下载生命周期见 [下载任务与缓存](downloads.md)。

## 新增服务端接口

服务端使用 Hono，目录采用 routes + common。routes 按安装、镜像元数据、下载、Registry、分享、状态等业务划分，不为没有服务端能力的标签创建空目录；一个业务可以拥有多个历史 URL。具体路径、响应和限制在 [接口参考](api.md) 维护。

1. **确定归属**：已有业务就在对应目录新增处理函数；新业务创建 `src/api/routes/<业务>/index.ts`。index 只注册路由、进行上下文薄适配并导出具名 `<业务>Routes`，具体处理和专属依赖放本目录，较小功能无需逐接口建文件。
2. **编写处理函数**：优先保持原生 Request/Response 与明确参数，依赖环境通过参数传入。校验路径、查询、正文及默认值，无效输入使用公共 HttpError；保留取消信号。大文件只读写流，不先转 arrayBuffer/text/json 再转发。
3. **注册方法**：GET API 用 common/http.ts 的 getRoute；它处理 Hono 默认 HEAD→GET 映射，HEAD 和其他非 GET 返回 405、Allow: GET，且不执行业务函数。非 GET 接口显式使用 Hono post/on/all 等方法，明确鉴权、响应与不支持方法策略。Registry 等协议路由直接传 c.req.raw，不能改写仓库路径、方法、正文、Range 或上游状态。
4. **挂载模块**：新增业务由 api/app.ts 从业务 index 导入并 app.route 挂载前缀；已有业务不需修改根入口。根入口负责 onError 和 notFound：未知 `/api`、`/api/*` 返回 JSON 404，Cloudflare 其他未命中交给 ASSETS；EdgeOne 静态资源由 Pages 提供，函数内其他未命中返回 404；不要在业务目录重复定义全局错误或 SPA 回退。
5. **复用边界**：模块只引用本模块和 api/common；真实跨业务复用再下沉 common。common 不引用 routes。前后端共用的纯逻辑遵循上文模块边界；业务间不要通过另一个路由 handler 复用实现。需要 waitUntil 时从 c.executionCtx 获取，处理函数只声明实际使用的上下文能力，避免框架类型与 Workers 新增成员产生不必要耦合。
6. **验证与文档**：给真实行为增加接口测试，包括成功、无效参数、已知路径的不支持方法、未知路径、错误映射；流式接口验证正文/状态/头及取消。执行 pnpm run check（含依赖边界检查），行为变更执行相关测试，按根 AGENTS.md 决定 build/validate。更新 [接口参考](api.md) 中的方法、路径、参数默认值、响应和重要限制；内部重构只修正失效引用，不增加功能交付说明。

模块 index 示例（对应 `/api/example/preview`）：

```ts
import { Hono } from 'hono';
import type { ApiEnv } from '../../common/types';
import { getRoute } from '../../common/http';
import { previewResponse } from './preview';

export const exampleRoutes = new Hono<ApiEnv>();
getRoute(exampleRoutes, '/preview', c => previewResponse(c.req.raw, c.env));
```

共用应用 app.ts 只增加 `import { exampleRoutes } from './routes/example/index'` 与 `app.route('/api/example', exampleRoutes)`。已有外部 URL 不因目录调整而改名，例如 download 模块仍注册 /api/download-script 与已停用的 /api/save。

`pnpm run check:architecture` 可单独检查静态依赖：禁止 routes 下平铺源码、缺失业务 index、common→routes、业务间引用，以及入口引用业务内部文件；包含静态 import/export、类型导入和字面量动态导入。它与 TypeScript 一同接入 check，现有 CI 的 validate 会自动执行。该检查不代替 HTTP 契约测试，不解析运行时拼接的模块路径。


## 平台入口

`app.ts` 的 createApiApp 统一注册业务、错误映射与未知 API 404，接收可选静态回退函数。`platforms/cloudflare.ts` 注入 Cloudflare ASSETS 回退；`platforms/edgeone.ts` 将 EdgeOne context.request/context.env 传给共用应用。JSON 响应统一使用 common/http.ts 的 jsonResponse，避免依赖 EdgeOne 缺少的静态 Response.json；响应实例的 json() 解析仍可使用。安装上游请求使用 AbortController 与可清理定时器限制响应头等待时间，不依赖静态 AbortSignal.timeout，也不对后续二进制响应流施加该时限。公共 Env 只声明业务配置，CloudflareEnv 在 Cloudflare 平台入口声明资源绑定。业务代码不得反向依赖这些入口；app.ts 不依赖 platforms，平台入口只能通过 app.ts 使用业务路由，两个平台入口不互相依赖。

EdgeOne 按项目根目录 edge-functions 发现文件路由，因此该目录保留为平台约定的薄入口，不承载业务或完整适配逻辑；api、v2 目录的文件只重导出 src/api/platforms/edgeone.ts，分别显式覆盖根路径与多级路径；使用通用 onRequest 保留 Registry 方法透传及 API 方法检查。新增既有前缀下的接口只修改业务路由，无需增加平台入口。
