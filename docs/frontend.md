# 前端开发

本文维护页面构建、标签接入、共享选择与请求时机。依赖方向遵循[系统架构](architecture.md)，控件与布局遵循[视觉规范](ui.md)。

## 页面与构建

公共默认配置集中在根目录 `config.js`：`site.author` 为页脚作者署名，`site.links` 包含 GitHub 仓库、在线安装脚本及安装区相关资源链接，`imageSources` 为默认镜像源列表。修改后重新构建或部署生效，Wrangler 开发模式监听该文件；构建校验页面链接使用 HTTPS 并转义后注入静态 HTML，无需运行时接口。Worker 优先使用 `IMAGE_SOURCES` 覆盖默认源，格式见 [接口参考](api.md#镜像源配置)。`config.js` 内通过 JSDoc 声明配置类型，并使用 `// @ts-check` 纳入类型检查；新增配置字段时同步维护文件内的类型标注；功能机制常量保留在所属模块。

页面模板位于 `src/client/index.html`，构建时注入配置和版本化资源路径并输出到 `dist/index.html`；`public/` 保留静态资源和托管配置。修改源码或静态资源，不要编辑生成的 `dist/`。CSS 由 `styles/index.css` 构建为一个文件；基础、全站滚动条、页面共用、标签专属样式依次导入。滚动条的颜色、尺寸和平台兼容统一在 `styles/scrollbars.css` 维护，规则见 [视觉规范](ui.md#滚动条)。共用表单通过工具面板的 CSS 容器查询切换一列、两列及宽屏布局；断点依据面板可用宽度而非整个视口。断点、任务表重排与验收矩阵统一遵循[响应式布局标准](ui.md#响应式布局标准)。

Hero 入场由 `hero-intro.js` 管理，指针视差、工具区柔光及背景暂停由 `page-motion.js` 管理；均使用原生 JavaScript 与 CSS。具体动画参数以源码为准，视觉约束见 [视觉与交互规范](ui.md)。

构建只复制选中的 Hero，将 public 中非控制文件、非 HTML 资源复制到 `/assets/<发布标识>/`，并在该目录生成 JS 和 CSS；页面中的现有资源引用及下载命令使用版本路径。新增普通资源的文件和目录名不得以 `_` 开头，并需使用对应版本路径引用；HTML 和平台要求的 `_` 开头控制文件保留固定路径。发布标识与下载请求的隔离机制见 [下载任务与缓存](downloads.md#发布标识与请求隔离)。`public/_headers` 和 `edgeone.json` 为版本资源目录统一设置一年不可变缓存。首页保留 `index.html`，使用 `no-cache`，由 Cloudflare Workers Assets 提供默认首页及原生 SPA 回退，不生成重写规则。

## 新增标签

新增标签按以下步骤进行：

1. 在 `src/client/index.html` 增加按钮和面板，分别使用相同且唯一的 `data-tab`、`data-panel` 值；保留现有 `role="tab"`、`role="tabpanel"` 结构。标签内元素由该标签模块查询和管理。
2. 在 `src/client/features/<名称>/index.js` 导出 `feature`，包含与 HTML 一致的 `id`、`zh-CN` 和 `en` 文案，以及 `init({ panel, locale, messages, flash, selectionStore })`。需要更新模块私有文案时，从 `init` 返回 `setLanguage(message)`。通用语言渲染和标签切换由页面入口处理，无需在 `app.js` 或语言模块添加该标签的分支。
3. 在 `src/client/features/index.js` 导入并注册 `feature`。需要镜像输入、源和架构时，在标签内部创建自己的 `createImageSelection` 实例；通过 `current()`、`resolve()` 和 `onPlatformChange()` 使用选择结果，不直接操作其内部控件。
4. 按需要选择共享方式：不声明 `selectionGroup` 即独立；声明相同组名并将 `selectionStore` 作为 `store` 传给 `createImageSelection`，则共享镜像名和所选源；同一镜像与源的平台查询只发送一次。源列表请求的复用规则见下方 [数据加载](#数据加载)。架构、请求结果的应用状态及 `auto` 解析结果由各标签独立管理。目前拉取与下载使用同一个 `image` 组；输入停止 1 秒后查询平台。
5. 新增专属 CSS 放在对应功能目录，并由 `src/client/styles/index.css` 导入；页面及共用规则留在 `styles/`。专属选择器应限定在自己的 `[data-panel="<名称>"]` 内。安装、配置、拉取与下载各有专属 CSS；拉取与下载共用的表单规则留在 `workspace.css`。

视觉与状态验收遵循[视觉与交互规范](ui.md#适配与验收)。新增下载能力参照 [下载任务与缓存](downloads.md)，需要服务端能力时同步 [接口参考](api.md)。按根目录 AGENTS.md 的改动范围执行验证。

## 数据加载

- 安装页首次打开时不请求 catalog；选择 CPU 架构后读取版本列表，再次选择同一架构或点击刷新时重新请求并绕过浏览器缓存。版本列表使用返回的 Compose 版本，确保后续命令与包内容一致。
- 拉取与下载页通过同一个选择组共享镜像源列表请求；同组的进行中请求与成功结果复用，失败后允许后续重试。更换镜像或镜像源不会清除源列表。
- 配置页直接在浏览器生成配置和恢复命令，无独立写配置接口。分享链接恢复表单后重新查询架构。

接口参数与响应缓存策略统一见 [接口参考](api.md)，不在本文重复维护。

## 批量输入与镜像选择

批量拉取与下载共用 `batch-images.js` 解析、`compose-input.js` 输入绑定及 `batch-input-issue.js` 错误翻译。粘贴或编辑后自动解析，选择或拖入文件后立即解析；仅在浏览器本地读取，输入上限 1 MiB，支持 .yaml、.yml、.txt。先尝试 Compose，失败时按逐行镜像列表解析；忽略空行，按镜像与显式平台合并重复项并保留解析问题。

Compose 提取 `services.*.image` 与 `platform`。不执行 build；缺少 image、未展开变量、无效平台或 extends 显示问题，include 无法作为 Compose 解析。复杂配置先用 `docker compose config` 展开。解析不会自动入队；用户逐项或全部加入，后续编辑输入不会清空已有队列。

每个队列项独立创建 `createImageSelection`，通过共享 store 复用源目录，自动选源并查询实际架构，不单独展示镜像源设置区。表头统一架构提供 amd64、arm64，优先于 Compose 平台并应用于未运行和后续入队任务；每项仍可选择解析出的全部平台与变体。优先精确匹配，否则匹配同一 OS / 架构的实际变体；指定变体必须精确匹配，不支持时清空选择并提示，禁止静默切换。

重新解析调用 `reloadSources()`，强制刷新平台查询，保留源目录缓存与架构偏好；移除调用 `dispose()` 取消查询和监听。只有解析成功且架构有效的任务进入可复制命令或可下载状态；解析错误显示在对应任务，独立于 Compose 输入问题。下载调度、停止和清理由[下载任务机制](downloads.md#批量镜像)负责。

## 分享恢复

单镜像分享通过 `/api/share` 生成片段参数，入口恢复表单后重新查询架构。队列分享通过下载功能内的 `queue-share.js` 编解码与校验，入口传入 `sharedBatchHash` 并恢复队列；格式与限制见[队列分享](downloads.md#队列分享)。两类分享复用 `share-link.js` 的复制及手动回退。命令复制沿用页面入口的 `.copy-all[data-copy]` 事件，`data-copy` 指向命令元素 ID，复用成功勾选与 toast 反馈。
