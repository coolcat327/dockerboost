# 开发参考

本文按修改范围查阅，不要求每次开发通读。启动、验证命令和部署入口见 [README](../README.md)；仓库约束见 [AGENTS.md](../AGENTS.md)。

## 项目结构

| 位置 | 职责与主要入口 |
| --- | --- |
| `src/client/app.js` | 页面初始化、语言和标签切换 |
| `src/client/hero-intro.js`、`page-motion.js` | 插画入场、指针交互和背景暂停 |
| `src/client/features/` | `index.js` 注册安装、配置、拉取、下载标签；各目录保留专属实现和样式 |
| `src/client/features/download/` | `image-export-client.js` 管理 Worker 通信，`image-export-worker.js` 处理暂存与归档 |
| `src/client/common/` | 镜像解析、选择、语言及下载公共能力；下载入口见 [下载机制](downloads.md) |
| `src/client/styles/` | `index.css` 统一导入基础、背景、Hero、工具区和功能样式 |
| `src/api/index.ts` | HTTP 路由分发与静态资源入口 |
| `src/api/routes/` | 路由及其专属依赖；安装、下载各自成目录，其余简单路由可用单文件 |
| `src/api/common/` | 源配置与选择、Registry 请求、镜像解析、错误和类型 |
| `public/` | 页面及静态资源 |
| `scripts/build.mjs` | 构建与发布标识生成 |
| `tests/` | 接口、脚本、归档、下载生命周期、语言及动画回归测试 |
| `wrangler.jsonc`、`.github/workflows/` | Worker 配置与 CI 部署 |
| `components.json` | React Bits MCP 注册表 |

具体文件以实际目录为准；新增模块不必在此逐项登记。

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
