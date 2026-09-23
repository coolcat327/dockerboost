# DockerBoost

部署在 Cloudflare Workers 上的 Docker Hub 镜像代理，提供命令生成、浏览器下载和终端下载。默认会并发查询已配置镜像源，并使用第一个成功响应；未缓存的镜像可能不可用，不绕过上游鉴权或限流。

## 项目结构

```text
src/
  client/                    浏览器源码
    app.js                   页面初始化与标签切换
    hero-intro.js            GSAP 首屏动画
    features/
      index.js               标签注册入口
      setup/                 配置标签、命令生成与专属 CSS
      pull/                  拉取标签
      download/              下载标签、专属 CSS、导出 Worker 与归档格式
    shared/                  镜像解析、选择逻辑、可选共享状态与语言渲染
    styles/                  页面基础、Hero 与工具区共用样式
      index.css              全部样式的导入入口与级联顺序
      foundation.css         页面基础与导航、页脚样式
      hero.css               Hero 视觉样式
      workspace.css          标签、面板、命令框与共用表单规则
  worker/                    Cloudflare 服务端
    index.ts                 HTTP 路由分发与静态资源入口
    routes/                  状态、镜像元数据、下载脚本和 Registry 代理路由
    sources.ts               镜像源配置、选择与路径约定
    registry.ts              上游请求、匿名认证、回退与流式透传
    images.ts                镜像引用与平台解析
    download-script.ts       curl + tar 脚本生成
    types.ts                 服务端类型
public/                      页面及静态资源（index.html、hero-surf-speed.svg 等）
scripts/build.mjs            前端构建入口
tests/                       回归测试，含浏览器归档格式与首屏动画布局、滚动行为验证
dist/                        自动生成的部署资源，不提交、不手改
wrangler.jsonc               Worker 和构建配置
```

## 本地开发

使用 Node.js 22 或更新版本：

```sh
npm ci
npm run dev
```

Wrangler 启动时自动构建；修改前端源码、静态资源或构建脚本会触发重新构建。服务端源码由 Wrangler 处理。

```sh
npm run check     # TypeScript 类型检查
npm test          # 回归测试，需要本地 sh、tar
npm run build     # 生成 dist 下的 JS、CSS、HTML 和静态资源
npm run validate  # 类型检查、测试和前端构建
```

修改 `src/client/` 或 `public/`，不要编辑生成的 `dist/`。CSS 由 `styles/index.css` 构建为一个文件；基础、页面共用、标签专属样式依次导入。共用表单在 1160px 和 960px 切换布局，调整规则时应检查各断点及中英文内容。

当前 Hero 插画和海浪动画在 `public/hero-surf-speed.svg` 中，页面通过一张 `<img>` 引用它。首次从页面顶部进入时，`src/client/hero-intro.js` 用 GSAP 将插画从屏幕中央移动到 Hero 的原位，再显示页面内容；动画期间保留 Hero 图片区域的高度，避免中屏和手机布局中的标题上移。若动画期间开始滚动，会立即结束入场并将插画放回 Hero。减少动态效果、锚点进入或页面已滚动时直接显示页面。以后可直接修改该 SVG，或把 `public/index.html` 中的图片路径切换到其他候选文件；SVG 内含动画和减少动态效果时的静态画面。构建只复制页面引用的 Hero SVG，其他 `public/hero-*.svg` 候选不会进入 `dist/`；选中的文件会加内容哈希，并通过 `public/_headers` 设置一年不可变缓存。更新 SVG 内容后，文件名随哈希变化。

## 新增标签

新增标签按以下步骤进行：

1. 在 `public/index.html` 增加按钮和面板，分别使用相同且唯一的 `data-tab`、`data-panel` 值；保留现有 `role="tab"`、`role="tabpanel"` 结构。标签内元素由该标签模块查询和管理。
2. 在 `src/client/features/<名称>/index.js` 导出 `feature`，包含与 HTML 一致的 `id`、`zh-CN` 和 `en` 文案，以及 `init({ panel, locale, messages, flash, selectionStore })`。需要更新模块私有文案时，从 `init` 返回 `setLanguage(message)`。通用语言渲染和标签切换由页面入口处理，无需在 `app.js` 或语言模块添加该标签的分支。
3. 在 `src/client/features/index.js` 导入并注册 `feature`。需要镜像输入、源和架构时，在标签内部创建自己的 `createImageSelection` 实例；通过 `current()`、`resolve()` 和 `onPlatformChange()` 使用选择结果，不直接操作其内部控件。
4. 按需要选择共享方式：不声明 `selectionGroup` 即独立；声明相同组名并把 `selectionStore` 传给 `createImageSelection`，则共享镜像名和所选源。架构、请求取消状态及 `auto` 解析结果始终由各标签独立管理。目前拉取与下载使用同一个 `image` 组。
5. 新增专属 CSS 放在对应功能目录，并由 `src/client/styles/index.css` 导入；页面及共用规则留在 `styles/`。专属选择器应限定在自己的 `[data-panel="<名称>"]` 内。配置与下载已有专属 CSS；拉取与下载共用的表单规则留在 `workspace.css`，拉取标签暂不需要独立 CSS。

补充相关回归测试并运行 `npm run validate`；若职责或测试范围改变，按 `AGENTS.md` 同步项目说明。只有新标签需要新的服务端能力时才增加 Worker 路由。

## 下载方式

- 浏览器：读取 manifest/config → 逐个下载镜像层到浏览器 OPFS → 本地组装 tar → 保存文件。需要支持 OPFS 的浏览器和足够本地空间。
- 终端：复制页面命令，获取脚本后用 sh 执行；curl 下载镜像层，本机 tar 打包。不需要 Docker、jq 或 Skopeo，仍需常见 shell 工具（如 mktemp、wc）。仅执行可信站点生成的脚本。
- Worker：解析元数据、生成脚本、流式转发 blob，不在服务端缓存整份镜像或组装 tar。仍然受上游限流、网络和平台资源限制影响。

文件名包含标签和架构，例如 nginx_latest_linux_amd64.tar。仅在导入 Docker 时需要 Docker：

```sh
docker load -i nginx_latest_linux_amd64.tar
```

## 接口

| 路径 | 用途 |
| --- | --- |
| /api/health | 健康检查和默认源信息 |
| /api/sources | 可供手动选择的镜像源及仓库命名规则 |
| /api/platforms?image=...&source=auto | 返回 manifest/index；单架构镜像会附加 `platforms` 字段；`auto` 并发选择首个成功源 |
| /api/inspect?image=...&platform=...&source=... | 镜像层数和目标架构，保留兼容 |
| /api/download-script?image=...&platform=...&source=... | 生成终端下载脚本 |
| /v2/* | Registry 请求与 blob 流式透传；普通路径保留完整仓库名，`/v2/dkbst/<source-id>/*` 可明确指定源 |
| /api/save | 已停用，返回 410；改用浏览器或终端下载 |

`image` 可使用 `nginx:latest`、`owner/image:tag` 或已配置的源域名（如 `ghcr.io/owner/image:tag`）；带域名的引用会固定到对应源，不能与 `source` 参数指定的其他源混用。`docker.io/...` 固定使用 `mirror-gcr`。`auto` 在各元数据接口中对 Docker Hub 镜像使用 `library/` 简写规则，对其他源使用原生仓库路径。显式源拉取地址使用 `dkbst/<source-id>/...`；旧的 `/<source-id>/...` 地址现在按普通仓库名解释，需要重新复制页面生成的命令。有效 API 仅接受 GET，未知 `/api/*` 返回 JSON 404；请求无效、镜像不存在和上游不可用分别返回 400、404、502/504。

## 部署

```sh
npx wrangler login
npm run deploy
```

部署会自动构建。`IMAGE_SOURCES` 在 `wrangler.jsonc` 中配置为 JSON 数组；每个源包含 `id`、`label` 和 HTTPS `url`，并可设置 `naming`（`docker-hub` 或 `native`）、`requiresNamespace`（是否要求 `owner/image`）及 `example`（输入框示例）。这些规则由 `/api/sources` 提供给前端，Worker 也按 `naming` 解析仓库路径。未设置时，`mirror-gcr` 使用 Docker Hub 命名，其余源使用原生路径，`requiresNamespace` 默认为 `false`。默认包含 `mirror.gcr.io`、`ghcr.io`、`quay.io`、`registry.k8s.io`、`registry.gitlab.com`、`mcr.microsoft.com` 与 `public.ecr.aws`。新增镜像源只需更新该配置，无需改 Worker 路由或前端源 ID 列表。`UPSTREAM_REGISTRY` 已移除，避免与源列表产生两个默认上游。GitHub Actions 会在 PR、推送到 `main` 或手动触发时执行 `npm run validate`；非 PR 触发会在校验通过后部署。需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` secrets。

将站点 HTTPS 地址加入 /etc/docker/daemon.json 的 registry-mirrors 时，保留其他现有配置，并重启 Docker。使用 systemd 的 Linux 执行 sudo systemctl restart docker；Docker Desktop 在设置界面应用并重启。
