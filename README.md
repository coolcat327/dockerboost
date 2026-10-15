# DockerBoost

部署在 Cloudflare Workers 上的 Docker Hub 镜像代理，提供 Docker 安装、加速配置、拉取命令和浏览器/终端下载。自动选源会按延迟逐批并发查询已配置镜像源，并使用第一个成功响应；未缓存的镜像可能不可用，不绕过上游鉴权或限流。

## 页面功能

### 安装

在线安装使用 LinuxMirrors 脚本；离线安装选择 Docker 版本和 Linux 架构，通过官方 Releases latest 获取 Compose 最新正式版，并检查所选架构资产；不使用 GitHub API。可在浏览器下载完整 TAR 包，进度显示两个文件的累计下载量与当前文件名；下载和打包期间可点击“停止下载”取消并清理暂存文件，或复制命令在联网机器下载后带到离线机器。

包名为 `docker-offline-<架构>-docker-<版本>-compose-<版本>.tar`，包内说明统一命名为 `readme.md`，内容注明架构、Docker/Compose 版本、本站网址和作者 coolcat。下载命令保存为 `.download-docker.sh`，通过 `sh .download-docker.sh` 运行；下载脚本兼容 sh，不设置过期时间。脚本成功、失败或收到可捕获的中断信号时均删除自身和临时打包文件，成功时保留最终 TAR 包。浏览器与终端脚本均通过本站 `/api/install/asset` 下载 Docker 和 Compose，由 Worker 请求官方文件并流式转发；下载机器无需直连 Docker 或 GitHub。默认镜像源为空，安装时回车不启用加速，也可手动填写地址。包内提供程序、默认配置、systemd 服务、校验文件及交互安装脚本；具体手动步骤见包内 README。目标需要 systemd Linux 和 iptables/ip6tables 等系统依赖；脚本在安装前检查防火墙工具，静态包不包含发行版依赖，仅支持全新安装。包内安装脚本兼容 POSIX sh，也可使用 Bash 执行。脚本在临时目录校验配置，正式配置的 `userland-proxy-path` 指向 `/usr/local/bin/docker-proxy`。

### 配置

生成本站镜像加速配置命令。仅修改已有 daemon.json，写入前备份，并提供恢复命令；自动命令无法使用时，可手动合并页面展示的 registry-mirrors 字段。

### 拉取

输入镜像名或粘贴 docker pull 命令，选择镜像源与目标架构，生成拉取和标签命令。拉取与下载页共享镜像选择；分享链接可恢复页面参数。

### 下载

- 浏览器：读取 manifest/config → 分批并发下载镜像层到浏览器 OPFS → 本地组装 tar → 保存文件。选定架构后以“n 层 共 x MB”显示层数和镜像大小（配置文件与压缩镜像层总量）；启动前检查下载 Worker 资源；页面跨部署后旧资源失效时，自动读取当前页面的 Worker 地址重试。下载期间按钮可停止任务，停止后可重新下载。需要支持 OPFS 的浏览器和足够本地空间。
- 终端：复制页面命令，保存为 `.download-image.sh`，通过 `sh .download-image.sh` 运行；成功、失败或收到可捕获的中断信号时均删除自身和临时打包文件，成功时保留最终 TAR 包。curl 下载镜像层，本机 tar 打包。不需要 Docker、jq 或 Skopeo，仍需常见 shell 工具（如 mktemp、wc）。仅执行可信站点生成的脚本。
- Worker：解析元数据、生成脚本、流式转发 blob，不在服务端缓存整份镜像或组装 tar。仍然受上游限流、网络和平台资源限制影响。

文件名包含标签和架构，例如 nginx_latest_linux_amd64.tar。仅在导入 Docker 时需要 Docker：

```sh
docker load -i nginx_latest_linux_amd64.tar
```

## 下载任务与缓存

安装包与镜像的浏览器下载共用 `src/client/common/browser-download-task.js`，没有固定文件大小上限，受浏览器存储配额与磁盘空间限制。下载完成后本地打包，再自动触发保存。

| 类型 | 策略 |
| --- | --- |
| HTTP 缓存 | 安装二进制和成功的 sha256 镜像 blob 允许缓存一天；镜像 blob 使用私有缓存，并尊重上游 no-store/no-cache。到期需要重新验证，实际回收由浏览器管理 |
| OPFS 暂存 | 每次任务在 `dockerboost-downloads/<类型>-<任务ID>/` 创建独立目录；失败或停止后清理，触发保存后保留 60 秒再释放文件引用并清理 |
| 遗留目录 | 页面初始化、刷新安装版本、新下载前清理；兼容旧安装目录和旧镜像会话目录，支持 Web Locks 时跳过其他标签页正在使用的任务 |

浏览器无法通知网页文件已保存完毕，60 秒为保存交接缓冲。关闭页面可能中断定时清理，遗留目录由下次访问清理。OPFS 不保留长期复用缓存，重复下载加速依赖 HTTP 缓存。构建按源码、静态资源及配置内容生成 8 位 URL 安全字符的发布标识，写入 `version.json`（no-store）；每次浏览器下载先读取当前标识，安装文件和镜像请求携带 `version` 参数。同版本可复用一天缓存，新版本使用不同地址，不再复用旧版下载响应；旧 HTTP 缓存由浏览器回收，OPFS 仍按任务清理。相同源码重复部署保持相同标识。

新增下载功能使用 `createDownloadTask(kind)` 获取 `id` 和 `directory`，下载与打包完成后调用 `save(archive, filename)`，在 finally 调用 `finish()`。使用后台 Worker 时，将任务 ID 传给 Worker；失败或停止后先终止 Worker，再结束任务。功能模块不自行维护目录命名、锁和清理定时器。文件写入共用 `opfs-file-writer.js`：流式下载使用 `writeOpfsStream`，打包使用 `writeOpfsFile`；公共函数负责关闭、异常中止和读取流释放，校验与进度由功能回调提供。

## 项目结构

```text
src/
  client/                    浏览器源码
    app.js                   页面初始化与标签切换
    hero-intro.js            GSAP 首屏动画
    features/
      index.js               标签注册入口
      install/               安装标签、离线打包与专属 CSS
      setup/                 配置标签、命令生成与专属 CSS
      pull/                  拉取标签
      download/              下载标签、专属 CSS 与归档格式
        image-export-client.js   导出 Worker 通信、进度和取消
        image-export-worker.js   镜像读取、流式暂存与 TAR 导出
    common/                  镜像解析、选择、语言等共用模块
      download-cache-policy.js   发布标识与下载请求缓存地址
      browser-download-task.js   下载任务、OPFS 生命周期及自动保存
      opfs-file-writer.js        分块写入、关闭与异常中止
      transfer-progress.js       传输速度、大小和耗时格式化
    styles/                  页面基础、Hero 与工具区共用样式
      index.css              全部样式的导入入口与级联顺序
      foundation.css         页面基础与导航、页脚样式
      hero.css               Hero 视觉样式
      workspace.css          标签、面板、命令框与共用表单规则
  api/                       Cloudflare Worker 服务端入口、路由与共享逻辑
    index.ts                 HTTP 路由分发与静态资源入口
    common/                  跨路由共享的服务、工具与类型
      sources.ts             镜像源配置、选择与路径约定
      registry.ts            上游请求、匿名认证、回退与流式透传
      images.ts              镜像引用与平台解析
      errors.ts              错误类型及上游错误转换
      types.ts               服务端类型
    routes/                  路由响应和路由专属依赖
      install/               安装接口与专属模块
        releases.ts          官方版本及架构资产查询
        bundle.ts            组织包内文件
        readme.ts            包内安装指南模板
        installer.ts         离线交互安装脚本模板
        offline-bundle-script.ts  联网下载与打包脚本
      download/              镜像下载接口；image-archive-script.ts 生成镜像归档脚本
      images.ts              镜像元数据接口
      registry-proxy.ts      Registry 流式代理
      share.ts               分享接口
      status.ts              健康检查及镜像源列表
public/                      页面及静态资源（index.html、hero-surf-speed.svg 等）
scripts/build.mjs            前端构建入口
tests/                       接口、脚本、归档、下载生命周期、语言及动画等回归测试
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
npm test          # 回归测试，需要 sh、bash、tar、sha256sum 等工具
npm run build     # 生成 dist 下的 JS、CSS、HTML 和静态资源
npm run validate  # 类型检查、测试和前端构建
```

修改 `src/client/` 或 `public/`，不要编辑生成的 `dist/`。CSS 由 `styles/index.css` 构建为一个文件；基础、页面共用、标签专属样式依次导入。共用表单在 1160px 和 960px 切换布局，调整规则时应检查各断点及中英文内容。

Hero 使用 `public/index.html` 引用的 `hero-*.svg`，入场由 `hero-intro.js` 管理；滚动和减少动态效果时可直接显示。构建只复制选中的 Hero，并给 JS、CSS 和图标添加内容哈希；`public/_headers` 为这些静态资源设置一年不可变缓存。更新构建产物名称时同步缓存匹配规则。
## 新增标签

新增标签按以下步骤进行：

1. 在 `public/index.html` 增加按钮和面板，分别使用相同且唯一的 `data-tab`、`data-panel` 值；保留现有 `role="tab"`、`role="tabpanel"` 结构。标签内元素由该标签模块查询和管理。
2. 在 `src/client/features/<名称>/index.js` 导出 `feature`，包含与 HTML 一致的 `id`、`zh-CN` 和 `en` 文案，以及 `init({ panel, locale, messages, flash, selectionStore })`。需要更新模块私有文案时，从 `init` 返回 `setLanguage(message)`。通用语言渲染和标签切换由页面入口处理，无需在 `app.js` 或语言模块添加该标签的分支。
3. 在 `src/client/features/index.js` 导入并注册 `feature`。需要镜像输入、源和架构时，在标签内部创建自己的 `createImageSelection` 实例；通过 `current()`、`resolve()` 和 `onPlatformChange()` 使用选择结果，不直接操作其内部控件。
4. 按需要选择共享方式：不声明 `selectionGroup` 即独立；声明相同组名并把 `selectionStore` 传给 `createImageSelection`，则共享镜像名和所选源，同一镜像与源的平台查询只发送一次。架构、请求结果的应用状态及 `auto` 解析结果由各标签独立管理。目前拉取与下载使用同一个 `image` 组；输入停止 1 秒后查询平台。
5. 新增专属 CSS 放在对应功能目录，并由 `src/client/styles/index.css` 导入；页面及共用规则留在 `styles/`。专属选择器应限定在自己的 `[data-panel="<名称>"]` 内。安装、配置与下载已有专属 CSS；拉取与下载共用的表单规则留在 `workspace.css`，拉取标签暂不需要独立 CSS。

新增页面或标签须沿用现有页面风格，以 `styles/foundation.css` 和 `styles/workspace.css` 为基准：

- 使用现有颜色变量和字体层级；正文、标题与按钮沿用 Manrope 及中文回退字体，命令和下载数据沿用 DM Mono。字体大小、行高、间距、边框与圆角参照同类现有控件。
- 复用面板标题、表单、按钮、命令块及复制操作的公共结构和样式；已有同类交互时沿用其状态反馈，例如下载进度、速度、停止与完成提示。多个功能实际共用的样式放入 `styles/`，专属 CSS 只处理功能差异。
- 检查中英文切换、宽屏和窄屏布局，以及正常、禁用、加载、进行中、成功和错误状态；长文件名、命令与提示不得造成页面横向溢出或遮挡操作，按内容选择缩放、换行或局部滚动。动态效果遵循现有减少动态效果设置。

新增浏览器下载能力沿用公共下载任务入口；新增服务端模块按路由职责放在 routes/，实际跨路由共用的代码放 common/。

补充相关回归测试并运行 `npm run validate`；若职责或测试范围改变，按 `AGENTS.md` 同步项目说明。只有新标签需要新的服务端能力时才增加 Worker 路由。

## 接口

以下 `/api/*` 有效接口使用 GET；`/api/save` 为停用接口，始终返回 410。接口按页面功能排列。

### 安装

| 路径 | 参数 | 返回与用途 |
| --- | --- | --- |
| `/api/install/catalog` | `arch` | JSON `{ docker: string[], compose: string }`：Docker 版本列表和匹配架构的 Compose 最新正式版；缓存 5 分钟 |
| `/api/install/plan` | `arch`、`docker`、`compose` | JSON `{ files: { 文件名: 内容 } }`：包内 README、配置、服务和安装脚本；不包含二进制 |
| `/api/install/asset` | `arch`、`docker`、`compose`、`kind` | 流式返回官方二进制；`kind` 为 `docker` 或 `compose`；缓存 1 天 |
| `/api/install/script` | `arch`、`docker`、`compose` | Bash 脚本：联网下载所需文件并在本机打包；不设置过期时间 |

`arch` 默认 `x86_64`，支持 `x86_64`、`aarch64`、`armhf`、`ppc64le`、`s390x`。除 catalog 外，`docker` 和 `compose` 必填，格式为 `主版本.次版本.补丁版本`。前端使用 catalog 返回的 Compose 版本，确保包内容与下载命令一致。plan 和 script 返回 `Cache-Control: no-store`。

### 配置

| 路径 | 参数 | 返回与用途 |
| --- | --- | --- |
| `/api/sources` | 无 | JSON `{ sources: [...] }`：源 ID、名称、域名、仓库命名规则及示例；浏览器缓存 5 分钟，边缘缓存 1 小时 |

配置页直接在浏览器生成配置和恢复命令，无独立写配置接口。

### 拉取

| 路径 | 参数 | 返回与用途 |
| --- | --- | --- |
| `/api/platforms` | `image`、`source` | 返回 Registry manifest/index；单架构镜像尽可能附加 `platforms` 字段 |
| `/api/share` | `tab`、`image`、`source`、`platform` | JSON `{ url }`：本站分享链接；`tab` 为 `pull` 或 `download`，参数均必填，`platform` 可为空 |
| `/v2/*` | 可选 `source` | Registry 请求与 blob 流式透传，保留上游状态与响应；普通路径保留完整仓库名，`/v2/dkbst/<source-id>/*` 明确指定源 |

`image` 必填，可用 `nginx:latest`、`owner/image:tag` 或已配置源的域名引用（如 `ghcr.io/owner/image:tag`）。带域名的引用固定对应源，不可与其他 `source` 混用；`docker.io/...` 固定 `mirror-gcr`。元数据接口的 `source` 默认 `auto`，并发选择首个成功源；Docker Hub 简写补全 `library/`，其他源保留原生路径。路径中的源与查询参数必须一致。

分享链接如 `/#download?image=nginx&source=auto&platform=linux/amd64`，参数存于 URL 片段，不保存到服务端；打开时恢复表单并重新查询架构。`/v2/*` 按 Registry 请求方法透传，不受 API 的 GET 限制；不绕过上游鉴权。

### 下载

| 路径 | 参数 | 返回与用途 |
| --- | --- | --- |
| `/api/inspect` | `image`、`source`、`platform` | JSON：`image`、`layers`、`sizeBytes`、`platform`、`source`；大小为配置与压缩镜像层总字节数，未知时为 null |
| `/api/download-script` | `image`、`source`、`platform` | 生成镜像终端下载脚本，返回纯文本；不缓存 |
| `/api/save` | 无 | 已停用，返回 410；使用浏览器或终端下载 |

inspect 和 download-script 的 `image`、`source` 规则同拉取接口；`platform` 默认 `linux/amd64`，也可指定 `linux/arm64/v8` 等平台。

### 通用

| 路径 | 返回与用途 |
| --- | --- |
| `/api/health` | JSON `{ ok, registry, sources }`：健康检查和默认源信息 |

GET 接口使用其他方法返回 405（`Allow: GET`），未知 `/api/*` 返回 JSON 404。错误使用 `{ error: string }`，无效参数、镜像不存在和上游不可用通常分别为 400、404、502/504；安装上游错误区分 Docker 与 GitHub 来源。Worker 不在服务端组装安装包或镜像 TAR。

## 部署

```sh
npx wrangler login
npm run deploy
```

部署会自动构建。`IMAGE_SOURCES` 在 `wrangler.jsonc` 中配置为 JSON 数组；每个源包含 `id`、`label` 和 HTTPS `url`，并可设置 `naming`（`docker-hub` 或 `native`）、`requiresNamespace`（是否要求 `owner/image`）及 `example`（输入框示例）。这些规则由 `/api/sources` 提供给前端，Worker 也按 `naming` 解析仓库路径。未设置时，`mirror-gcr` 使用 Docker Hub 命名，其余源使用原生路径，`requiresNamespace` 默认为 `false`。默认包含 `mirror.gcr.io`、`ghcr.io`、`quay.io`、`registry.k8s.io`、`registry.gitlab.com`、`mcr.microsoft.com` 与 `public.ecr.aws`。新增镜像源只需更新该配置，无需改 Worker 路由或前端源 ID 列表。`UPSTREAM_REGISTRY` 已移除，避免与源列表产生两个默认上游。GitHub Actions 会在 PR、推送到 `main` 或手动触发时执行 `npm run validate`；非 PR 触发会在校验通过后部署。需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` secrets。

将站点 HTTPS 地址加入 /etc/docker/daemon.json 的 registry-mirrors 时，保留其他现有配置，并重启 Docker。使用 systemd 的 Linux 执行 sudo systemctl restart docker；Docker Desktop 在设置界面应用并重启。
