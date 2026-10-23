# 前端开发

本文维护页面源码、构建与标签接入。共用边界见 [开发参考](architecture.md)，服务端注册见 [后端开发](backend.md)，视觉约束见 [视觉规范](ui.md)。

## 页面与构建

公共默认配置集中在根目录 `config.js`：`site.author` 为页脚作者署名，`site.links` 包含 GitHub 仓库、在线安装脚本及安装区相关资源链接，`imageSources` 为默认镜像源列表。修改后重新构建或部署生效，Wrangler 开发模式监听该文件；构建校验页面链接使用 HTTPS 并转义后注入静态 HTML，无需运行时接口。Worker 优先使用 `IMAGE_SOURCES` 覆盖默认源，格式见 [接口参考](api.md#镜像源配置)。`config.js` 内通过 JSDoc 声明配置类型，并使用 `// @ts-check` 纳入类型检查；新增配置字段时同步维护文件内的类型标注；功能机制常量保留在所属模块。

页面模板位于 `src/client/index.html`，构建时注入配置和版本化资源路径并输出到 `dist/index.html`；`public/` 保留静态资源和托管配置。修改源码或静态资源，不要编辑生成的 `dist/`。CSS 由 `styles/index.css` 构建为一个文件；基础、全站滚动条、页面共用、标签专属样式依次导入。滚动条的颜色、尺寸和平台兼容统一在 `styles/scrollbars.css` 维护，规则见 [视觉规范](ui.md#滚动条)。共用表单通过工具面板的 CSS 容器查询切换一列、两列及宽屏布局；断点依据面板可用宽度而非整个视口。断点、任务表重排与验收矩阵统一遵循[响应式布局标准](ui.md#响应式布局标准)。

Hero 入场由 `hero-intro.js` 管理，指针视差、工具区柔光及背景暂停由 `page-motion.js` 管理；均使用原生 JavaScript 与 CSS。具体动画参数以源码为准，视觉约束见 [视觉与交互规范](ui.md)。

构建只复制选中的 Hero，并给 JS、CSS、图标与 Hero 添加统一发布标识后缀；发布标识与下载请求的隔离机制见 [下载任务与缓存](downloads.md#发布标识与请求隔离)。`public/_headers` 为版本化静态资源设置一年不可变缓存，更新产物名称时同步匹配规则。首页保留 `index.html`，使用 `no-cache`，由 Cloudflare Workers Assets 提供默认首页及原生 SPA 回退，不生成重写规则。

## 新增标签

新增标签按以下步骤进行：

1. 在 `src/client/index.html` 增加按钮和面板，分别使用相同且唯一的 `data-tab`、`data-panel` 值；保留现有 `role="tab"`、`role="tabpanel"` 结构。标签内元素由该标签模块查询和管理。
2. 在 `src/client/features/<名称>/index.js` 导出 `feature`，包含与 HTML 一致的 `id`、`zh-CN` 和 `en` 文案，以及 `init({ panel, locale, messages, flash, selectionStore })`。需要更新模块私有文案时，从 `init` 返回 `setLanguage(message)`。通用语言渲染和标签切换由页面入口处理，无需在 `app.js` 或语言模块添加该标签的分支。
3. 在 `src/client/features/index.js` 导入并注册 `feature`。需要镜像输入、源和架构时，在标签内部创建自己的 `createImageSelection` 实例；通过 `current()`、`resolve()` 和 `onPlatformChange()` 使用选择结果，不直接操作其内部控件。
4. 按需要选择共享方式：不声明 `selectionGroup` 即独立；声明相同组名并将 `selectionStore` 作为 `store` 传给 `createImageSelection`，则共享镜像名和所选源；同一镜像与源的平台查询只发送一次。源列表请求的复用规则见下方 [数据加载](#数据加载)。架构、请求结果的应用状态及 `auto` 解析结果由各标签独立管理。目前拉取与下载使用同一个 `image` 组；输入停止 1 秒后查询平台。
5. 新增专属 CSS 放在对应功能目录，并由 `src/client/styles/index.css` 导入；页面及共用规则留在 `styles/`。专属选择器应限定在自己的 `[data-panel="<名称>"]` 内。安装、配置与下载已有专属 CSS；拉取与下载共用的表单规则留在 `workspace.css`，拉取标签暂不需要独立 CSS。

视觉与状态验收遵循 [视觉与交互规范](ui.md)；设计变更的选型、计划和归档见 [设计与实现流程](design-workflow.md)。新增下载能力参照 [下载任务与缓存](downloads.md)，需要服务端能力时同步 [接口参考](api.md)。按根目录 AGENTS.md 的改动范围执行验证。

## 数据加载

- 安装页首次打开时不请求 catalog；选择 CPU 架构后读取版本列表，再次选择同一架构或点击刷新时重新请求并绕过浏览器缓存。版本列表使用返回的 Compose 版本，确保后续命令与包内容一致。
- 拉取与下载页通过同一个选择组共享镜像源列表请求；同组的进行中请求与成功结果复用，失败后允许后续重试。更换镜像或镜像源不会清除源列表。
- 配置页直接在浏览器生成配置和恢复命令，无独立写配置接口。分享链接恢复表单后重新查询架构。

接口参数与响应缓存策略统一见 [接口参考](api.md)，不在本文重复维护。

批量队列不单独加载或展示镜像源列表；每项通过共享 store 复用源目录，并使用 createImageSelection 自动选源与查询实际架构。表头统一架构提供 amd64、arm64；单项保留解析出的全部平台（含变体），可独立选择。统一架构优先精确匹配，否则匹配同一 OS / 架构的实际变体，并以完整平台参数下载；指定变体必须精确匹配，不支持时禁止下载。Compose 解析问题使用独立提示区。表头支持开始下载 / 停止全部切换及全部重新解析；任务通过 reloadSources() 强制刷新架构查询，保留共享源目录缓存，移除时调用 dispose() 取消查询与监听。

队列分享使用下载功能内的 `queue-share.js` 编解码与校验，通过页面入口传递的 `sharedBatchHash` 恢复。单镜像分享仍使用现有 `/api/share`；两类分享复用 `share-link.js` 的复制和手动回退。链接格式与限制见 [队列分享](downloads.md#队列分享)。
