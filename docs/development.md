# 开发参考

本文按修改范围查阅，不要求每次开发通读。启动、验证命令和部署入口见 [README](../README.md)；仓库约束见 [AGENTS.md](../AGENTS.md)。

项目目录概览见 [README 的项目结构](../README.md#项目结构)。以下只描述接入规则和需要定位的具体实现。

## 模块边界与实现约定

- 前端入口 app.js 管理页面初始化、语言和标签切换；功能入口通过 features/index.js 注册。专属实现和样式留在功能目录，页面共用样式放 styles，保持 styles/index.css 的级联顺序。
- 后端入口只创建 Hono 应用、挂载子路由、处理全局错误与未命中回退。业务目录的 index.ts 只注册并导出具名子路由；业务不互相引用，不反向引用入口，common 不依赖 routes。
- 前后端确实共用的纯逻辑放 src/shared/；仅一侧复用的能力留在对应 common，不为未来可能复用提前建模块。
- 保持导入、构建入口、缓存规则、测试与文档引用一致。专属实现避免使用缺少领域含义的 download/script 等泛用文件名。
- 不手工修改或提交 dist/、node_modules/、.wrangler/；不提交密钥、令牌、.env* 或 .dev.vars*。这些是构建产物、依赖、本地运行状态或敏感配置。

## 新增服务端接口

服务端使用 Hono，目录采用 routes + common。routes 按安装、镜像元数据、下载、Registry、分享、状态等业务划分，不为没有服务端能力的标签创建空目录；一个业务可以拥有多个历史 URL。具体路径、响应和限制在 [接口参考](api.md) 维护。

1. **确定归属**：已有业务就在对应目录新增处理函数；新业务创建 `src/api/routes/<业务>/index.ts`。index 只注册路由、进行上下文薄适配并导出具名 `<业务>Routes`，具体处理和专属依赖放本目录，较小功能无需逐接口建文件。
2. **编写处理函数**：优先保持原生 Request/Response 与明确参数，依赖环境通过参数传入。校验路径、查询、正文及默认值，无效输入使用公共 HttpError；保留取消信号。大文件只读写流，不先转 arrayBuffer/text/json 再转发。
3. **注册方法**：GET API 用 common/http.ts 的 getRoute；它处理 Hono 默认 HEAD→GET 映射，HEAD 和其他非 GET 返回 405、Allow: GET，且不执行业务函数。非 GET 接口显式使用 Hono post/on/all 等方法，明确鉴权、响应与不支持方法策略。Registry 等协议路由直接传 c.req.raw，不能改写仓库路径、方法、正文、Range 或上游状态。
4. **挂载模块**：新增业务由 api/index.ts 从业务 index 导入并 app.route 挂载前缀；已有业务不需修改根入口。根入口负责 onError 和 notFound：未知 `/api`、`/api/*` 返回 JSON 404，其他未命中交给 ASSETS；不要在业务目录重复定义全局错误或 SPA 回退。
5. **复用边界**：模块只引用本模块和 api/common；真实跨业务复用再下沉 common。common 不引用 routes。前后端共用的纯逻辑遵循上文模块边界；业务间不要通过另一个路由 handler 复用实现。需要 waitUntil 时从 c.executionCtx 获取，处理函数只声明实际使用的上下文能力，避免框架类型与 Workers 新增成员产生不必要耦合。
6. **验证与文档**：给真实行为增加接口测试，包括成功、无效参数、已知路径的不支持方法、未知路径、错误映射；流式接口验证正文/状态/头及取消。执行 npm run check（含依赖边界检查），行为变更执行相关测试，按根 AGENTS.md 决定 build/validate。更新 api.md 中方法、路径、参数默认值、响应和重要限制；内部重构只修正失效引用，不增加功能交付说明。

模块 index 示例（对应 `/api/example/preview`）：

```ts
import { Hono } from 'hono';
import type { ApiEnv } from '../../common/types';
import { getRoute } from '../../common/http';
import { previewResponse } from './preview';

export const exampleRoutes = new Hono<ApiEnv>();
getRoute(exampleRoutes, '/preview', c => previewResponse(c.req.raw, c.env));
```

根入口只增加 `import { exampleRoutes } from './routes/example/index'` 与 `app.route('/api/example', exampleRoutes)`。已有外部 URL 不因目录调整而改名，例如 download 模块仍注册 /api/download-script 与已停用的 /api/save。

`npm run check:architecture` 可单独检查静态依赖：禁止 routes 下平铺源码、缺失业务 index、common→routes、业务间引用，以及入口引用业务内部文件；包含静态 import/export、类型导入和字面量动态导入。它与 TypeScript 一同接入 check，现有 CI 的 validate 会自动执行。该检查不代替 HTTP 契约测试，不解析运行时拼接的模块路径。

## 必备开发工具：React Bits MCP

本项目将 React Bits MCP 作为必备开发工具，用于组件浏览和搜索。React Bits 通过 shadcn MCP 接入，支持 Claude Code、Codex、Cursor 等 MCP 客户端。请按照所用客户端的 [shadcn MCP 配置说明](https://ui.shadcn.com/docs/mcp) 添加一个名为 `shadcn` 的 STDIO 服务，启动命令与参数为：

```sh
npx -y shadcn@latest mcp
```

在客户端配置中，`command` 为 `npx`，`args` 为 `["-y", "shadcn@latest", "mcp"]`。可选择仅对本项目生效，或使用已有的全局配置；配置文件位置及格式以客户端文档为准。确保服务工作目录为本项目根目录，以读取注册表。

项目根目录的 [`components.json`](../components.json) 已配置 `@react-bits` 注册表，无需重复添加；配置方式见 [React Bits 官方说明](https://reactbits.dev/get-started/mcp)。

在客户端中重新加载 MCP 服务或重启客户端后，在该项目中请求浏览或搜索 `@react-bits` 组件。首次启动时 `npx` 会联网下载 shadcn CLI；克隆项目或运行 `npm ci` 不会自动注册 MCP，每位开发者需在所用客户端中完成配置。普通网站用户无需安装。当前前端使用原生 JavaScript，采用 React 组件前需评估框架与依赖适配。

## 前端与构建

修改 `src/client/` 或 `public/`，不要编辑生成的 `dist/`。CSS 由 `styles/index.css` 构建为一个文件；基础、页面共用、标签专属样式依次导入。共用表单在 1160px 和 960px 切换布局，调整规则时应检查各断点及中英文内容。

Hero 入场由 `hero-intro.js` 管理，指针视差、工具区柔光及背景暂停由 `page-motion.js` 管理；均使用原生 JavaScript 与 CSS。具体动画参数以源码为准，视觉约束见 [视觉与交互规范](design/visual-style.md)。

构建只复制选中的 Hero，并给 JS、CSS 和图标添加内容哈希；`public/_headers` 为这些静态资源设置一年不可变缓存。更新产物名称时同步缓存匹配规则。

## 新增标签

新增标签按以下步骤进行：

1. 在 `public/index.html` 增加按钮和面板，分别使用相同且唯一的 `data-tab`、`data-panel` 值；保留现有 `role="tab"`、`role="tabpanel"` 结构。标签内元素由该标签模块查询和管理。
2. 在 `src/client/features/<名称>/index.js` 导出 `feature`，包含与 HTML 一致的 `id`、`zh-CN` 和 `en` 文案，以及 `init({ panel, locale, messages, flash, selectionStore })`。需要更新模块私有文案时，从 `init` 返回 `setLanguage(message)`。通用语言渲染和标签切换由页面入口处理，无需在 `app.js` 或语言模块添加该标签的分支。
3. 在 `src/client/features/index.js` 导入并注册 `feature`。需要镜像输入、源和架构时，在标签内部创建自己的 `createImageSelection` 实例；通过 `current()`、`resolve()` 和 `onPlatformChange()` 使用选择结果，不直接操作其内部控件。
4. 按需要选择共享方式：不声明 `selectionGroup` 即独立；声明相同组名并把 `selectionStore` 传给 `createImageSelection`，则共享镜像名和所选源，同一镜像与源的平台查询只发送一次。架构、请求结果的应用状态及 `auto` 解析结果由各标签独立管理。目前拉取与下载使用同一个 `image` 组；输入停止 1 秒后查询平台。
5. 新增专属 CSS 放在对应功能目录，并由 `src/client/styles/index.css` 导入；页面及共用规则留在 `styles/`。专属选择器应限定在自己的 `[data-panel="<名称>"]` 内。安装、配置与下载已有专属 CSS；拉取与下载共用的表单规则留在 `workspace.css`，拉取标签暂不需要独立 CSS。

视觉与状态验收遵循 [视觉与交互规范](design/visual-style.md)；设计变更的选型、计划和归档见 [设计与实现流程](design/workflow.md)。新增下载能力参照 [下载任务与缓存](downloads.md)，需要服务端能力时同步 [接口参考](api.md)。按根目录 AGENTS.md 的改动范围执行验证。
