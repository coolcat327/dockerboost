# 系统架构与模块边界

本文维护系统组成、源码目录职责与依赖方向。模块接入步骤由前端、后端开发专题维护；此处不重复操作流程。

## 系统组成

- 页面使用原生 JavaScript 与 CSS，提供安装、配置、拉取、下载四个功能标签；页面共享能力位于前端 common。
- 共用 Hono 应用处理 API 与 Registry 请求，由 Cloudflare Workers 和 EdgeOne Edge Functions 的薄入口适配平台。
- 服务端解析元数据并流式转发二进制；浏览器或终端负责暂存、校验与 TAR 组装，服务端不组装归档。
- 构建将页面与版本化静态资源输出到 `dist/`；Cloudflare Assets 或 EdgeOne Pages 分发资源。

## 项目结构

| 位置 | 职责 |
| --- | --- |
| `src/client/index.html` | 页面模板，构建时注入配置及版本化资源路径 |
| `src/client/app.js` | 原生 JavaScript 页面入口，管理初始化、语言与标签切换 |
| `src/client/features/` | 页面功能：install（安装）、setup（配置）、pull（拉取）、download（下载） |
| `src/client/common/` | 前端复用能力，例如镜像选择、语言、浏览器下载任务与文件写入 |
| `src/client/styles/` | 页面与共用样式，由 index.css 统一导入；功能专属样式留在 features 对应目录 |
| `src/api/app.ts` | 共用 Hono 应用，挂载业务路由并统一处理错误 |
| `src/api/platforms/` | Cloudflare 与 EdgeOne 平台入口 |
| `edge-functions/` | EdgeOne 的 `/api` 与 `/v2` 文件路由 |
| `src/api/routes/` | 业务路由：install、images、download、registry、share、status；各目录 index.ts 注册子路由 |
| `src/api/common/` | 跨业务复用能力，例如镜像源配置与选择、Registry 请求、镜像解析及 HTTP 适配 |
| `public/` | 静态资源与托管配置 |
| `scripts/` | 构建、发布标识和架构检查 |
| `tests/` | 接口、安装脚本、归档及浏览器下载等回归测试 |
| `docs/` | 当前架构、开发、接口、下载与视觉专题 |
| `docs/decisions/` | 选型与决策依据 |
| `docs/archive/` | 已完成计划与历史验证 |
| `docs/plans/` | 待执行或仍在验收的计划；完成记录移至 docs/archive/plans |
| `config.js` | 页面公开配置与默认镜像源 |
| `wrangler.jsonc`、`edgeone.json` | 两个平台的构建与部署配置 |
| `.github/workflows/` | 持续验证与部署 |

## 依赖方向

- 前端：`app.js` → `features/index.js` → 各功能入口；功能模块复用 `client/common`。专属实现和样式留在功能目录，共用样式由 `styles/index.css` 按级联顺序导入。
- 后端：平台入口 → `api/app.ts` → 各业务 `index.ts` → 本业务处理函数；业务复用 `api/common`。应用入口负责挂载、全局错误与未命中回退，业务入口只注册子路由。
- 业务目录不互相引用，common 不依赖 routes，业务与 common 不反向依赖应用或平台入口，平台入口不互相依赖。
- 仅一侧复用的能力留在对应 common；确有前后端共用的纯逻辑时再建立 `src/shared/`，当前无需预建目录。
- `edge-functions/` 只保留平台要求的文件路由重导出，不承载业务逻辑。

`pnpm run check:architecture` 自动检查 API 依赖边界；它不检查前端依赖，也不替代 TypeScript 和接口测试。
