# 系统架构与模块边界

本文维护系统组成、源码目录职责与依赖方向。模块接入步骤由前端、后端开发专题维护；此处不重复操作流程。

## 系统组成

- 页面使用原生 JavaScript 与 CSS，提供安装、配置、拉取、下载、转换、手册六个功能标签；页面共享能力位于前端 common。
- 共用 Hono 应用处理 API 与 Registry 请求，由 Cloudflare Workers 和 EdgeOne Edge Functions 的薄入口适配平台。
- 服务端解析元数据并流式转发二进制；浏览器或终端负责暂存、校验与 TAR 组装，服务端不组装归档。
- 构建将页面与版本化静态资源输出到 `dist/`；Cloudflare Assets 或 EdgeOne Pages 分发资源。

## 项目结构

| 位置 | 职责 |
| --- | --- |
| `src/client/index.html` | 页面模板，构建时注入配置及版本化资源路径 |
| `src/client/bootstrap.js` | 轻量启动入口，优先准备 Hero 入场首帧，再动态加载工具区入口 |
| `src/client/app.js` | 原生 JavaScript 页面入口，管理初始化、语言与标签切换 |
| `src/client/features/` | 页面功能：install（安装）、setup（配置）、pull（拉取）、download（下载）、convert（转换）、manual（手册） |
| `src/client/common/` | 前端复用能力，例如镜像选择、语言、浏览器下载任务与文件写入 |
| `src/client/styles/` | 页面与共用样式，由 index.css 统一导入；功能专属样式留在 features 对应目录 |
| `src/api/app.ts` | 共用 Hono 应用，挂载业务路由并统一处理错误 |
| `src/api/platforms/` | Cloudflare 与 EdgeOne 平台入口 |
| `edge-functions/` | EdgeOne 的 `/api` 与 `/v2` 文件路由 |
| `src/api/routes/` | 业务路由：install、images、download、registry、share、status；各目录 index.ts 注册子路由 |
| `src/api/common/` | 跨业务复用能力，例如镜像源配置与选择、Registry 请求、镜像解析及 HTTP 适配 |
| `src/common/` | 前端和 API 共同使用的纯逻辑，例如镜像引用解析与镜像归档命名 |
| `public/` | 静态资源与托管配置 |
| `scripts/` | 构建、发布标识和架构检查 |
| `tools/workflow-demos/` | 独立 Remotion 工程，预览与渲染 README 的架构与流程对比动画，使用自己的依赖和锁文件 |
| `tests/` | 接口、安装脚本、归档及浏览器下载等回归测试 |
| `docs/` | 当前架构、开发、接口、下载与视觉专题 |
| `docs/assets/workflow-demos/` | 中英文 README 引用的 GIF，由动画工程导出并随仓库版本管理 |
| `docs/decisions/` | 选型与决策依据 |
| `docs/archive/` | 已完成计划与历史验证 |
| `docs/plans/` | 待执行或仍在验收的计划；完成记录移至 docs/archive/plans |
| `config.js` | 页面公开配置与默认镜像源 |
| `wrangler.jsonc`、`edgeone.json` | 两个平台的构建与部署配置 |
| `.github/workflows/` | 持续验证与部署 |

## 依赖方向

- 前端：`bootstrap.js` → `hero-intro.js`，入场首帧就绪或跳过后动态加载 `app.js`；`app.js` → `features/index.js` → 各功能入口使用静态依赖，合并工具界面，首次激活才初始化。转换引擎在输入时动态加载，功能模块复用 `client/common`。分包和请求预算见[前端构建规则](frontend.md#分包与加载顺序)。专属实现和样式留在功能目录，共用样式由 `styles/index.css` 按级联顺序导入。
- 后端：平台入口 → `api/app.ts` → 各业务 `index.ts` → 本业务处理函数；业务复用 `api/common`。应用入口负责挂载、全局错误与未命中回退，业务入口只注册子路由。
- 后端业务目录不互相引用，common 不依赖 routes，业务与 common 不反向依赖应用或平台入口，平台入口不互相依赖。
- 前后端都使用的纯逻辑放在 `src/common/`，由 `src/client/` 和 `src/api/` 共同依赖。`src/common/` 不依赖前端或 API 模块。仅在一侧复用的能力留在 `src/client/common/` 或 `src/api/common/`。
- `edge-functions/` 只保留平台要求的文件路由重导出，不承载业务逻辑。

`pnpm run check:architecture` 自动检查 API 依赖边界；它不检查前端依赖，也不替代 TypeScript 和接口测试。

## 主站与流程演示

DockerBoost 主站定义实际操作、功能契约和使用条件。`tools/workflow-demos/` 使用独立的依赖、示意画面和示例数据还原这些流程，渲染独立于主站运行、构建和部署。导出的 `docs/assets/workflow-demos/` GIF 供两份根 README 展示。画面可以压缩等待时间、简化界面细节，实际的操作顺序、前置条件和结果应表达准确。

| 演示场景 | 对应的主站流程 | 优先核对的内容 |
| --- | --- | --- |
| `architecture` | [系统组成](#系统组成)、[本地归档](downloads.md#哈希与归档实现)与[镜像终端下载](downloads.md#镜像终端下载) | 平台部署、Registry 请求与流式返回方向、下载端组装 TAR、目标机导入条件 |
| `offline` | [安装页版本选择](frontend.md#数据加载)与[离线安装包](api.md#安装) | 架构和版本选择、Compose 匹配规则、包内文件、解包及安装步骤 |
| `browser` | [浏览器镜像下载](downloads.md#任务生命周期)与[本地归档](downloads.md#哈希与归档实现) | 镜像和平台选择、校验、TAR 生成及目标机导入 |
| `share` | [队列分享](downloads.md#队列分享)与[分享恢复](frontend.md#分享恢复) | 链接携带的参数、接收方恢复的内容、开始下载的时机 |
| `batch` | [Compose 批量输入](frontend.md#批量输入与镜像选择)与[镜像终端下载](downloads.md#镜像终端下载) | 镜像提取、平台选择、复制的命令、终端依赖及每镜像归档 |

修改这些流程时，用上表检查所有受影响的场景。用户操作、前置条件、命令或产出发生变化，导致动画画面或字幕过时，就在同一变更中更新相关动画源码，重新导出受影响的中英文 GIF，并核对两份根 README 的场景说明、图片链接和替代文本。仅调整内部实现或画面未呈现的细节时，核对现有演示仍准确即可。
