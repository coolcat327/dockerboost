# 接口参考

本文维护当前 HTTP 契约与镜像源配置。前端请求时机见 [前端开发](frontend.md#数据加载)，服务端注册步骤见 [后端开发](backend.md)，本地下载与暂存机制见 [下载任务与缓存](downloads.md)。

以下 `/api/*` 有效接口使用 GET；`/api/save` 为停用接口，始终返回 410。接口按页面功能排列。

### 安装

| 路径 | 参数 | 返回与用途 |
| --- | --- | --- |
| `/api/install/catalog` | `arch` | JSON `{ docker: string[], compose: string }`：Docker 版本列表和匹配架构的 Compose 最新正式版；缓存 5 分钟 |
| `/api/install/plan` | `arch`、`docker`、`compose` | JSON `{ files: { 文件名: 内容 } }`：包内 README、配置、服务及成对的安装/卸载脚本；不包含二进制 |
| `/api/install/asset` | `arch`、`docker`、`compose`、`kind` | 流式返回官方二进制；`kind` 为 `docker` 或 `compose`；缓存 1 天 |
| `/api/install/script` | `arch`、`docker`、`compose` | 兼容旧命令的 Shell 脚本：联网下载所需文件并在本机打包；TAR 内包含与包名同名的顶层目录；不设置过期时间 |

`arch` 默认 `x86_64`，支持 `x86_64`、`aarch64`、`armhf`、`ppc64le`、`s390x`。除 catalog 外，`docker` 和 `compose` 必填，格式为 `主版本.次版本.补丁版本`。plan 和 script 返回 `Cache-Control: no-store`。

### 配置

| 路径 | 参数 | 返回与用途 |
| --- | --- | --- |
| `/api/sources` | 无 | JSON `{ sources: [...] }`：源 ID、名称、域名、仓库命名规则及示例；浏览器缓存 5 分钟，边缘缓存 1 小时 |

### 拉取

| 路径 | 参数 | 返回与用途 |
| --- | --- | --- |
| `/api/platforms` | `image`、`source` | 返回 Registry manifest/index；单架构镜像尽可能附加 `platforms` 字段 |
| `/api/share` | `tab`、`image`、`source`、`platform` | JSON `{ url }`：本站分享链接；`tab` 为 `pull` 或 `download`，参数均必填，`platform` 可为空 |
| `/v2/*` | 可选 `source` | Registry 请求与 blob 流式透传，保留上游状态与响应；普通路径保留完整仓库名，`/v2/r/<source-id>/*` 明确指定源。旧的 `/v2/dkbst/` 前缀不再指定源 |

`image` 必填，可用 `nginx:latest`、`owner/image:tag` 或已配置源的域名引用（如 `ghcr.io/owner/image:tag`）。带域名的引用固定对应源，不可与其他 `source` 混用；`docker.io/...` 固定 `mirror-gcr`。元数据接口的 `source` 默认 `auto`，并发选择首个成功源；Docker Hub 简写补全 `library/`，其他源保留原生路径。路径中的源与查询参数必须一致。

Registry 只读请求返回成功的 sha256 blob（200 或 206）时，浏览器缓存策略为 `private, max-age=86400`；上游明确设置 `no-store` 或 `no-cache` 时不覆盖。其他 Registry 响应沿用上游缓存策略。

分享链接如 `/#download?image=nginx&source=auto&platform=linux/amd64`，参数存于 URL 片段，不保存到服务端。`/v2/*` 按 Registry 请求方法透传，不受 API 的 GET 限制；不绕过上游鉴权。

### 下载

| 路径 | 参数 | 返回与用途 |
| --- | --- | --- |
| `/api/inspect` | `image`、`source`、`platform` | JSON：`image`、`layers`、`sizeBytes`、`platform`、`source`；大小为配置与压缩镜像层总字节数，未知时为 null |
| `/api/download-plan` | `image`、`source`、`platform` | JSON `{ image, repository, source, config, layers }`：镜像显示名、实际仓库和镜像源，以及配置与各层的 blob 描述信息；不缓存 |
| `/api/download-script` | `image`、`source`、`platform` | 兼容旧命令的镜像终端下载脚本，返回纯文本；不缓存 |
| `/api/save` | 无 | 已停用，返回 410；使用浏览器或终端下载 |

inspect、download-plan 和 download-script 的 `image`、`source` 规则同拉取接口；`platform` 默认 `linux/amd64`，也可指定 `linux/arm64/v8` 等平台。

### 通用

| 路径 | 返回与用途 |
| --- | --- |
| `/api/health` | JSON `{ ok, registry, sources }`：健康检查和默认源信息 |

GET 接口使用其他方法返回 405（`Allow: GET`），未知 `/api/*` 返回 JSON 404。错误使用 `{ error: string }`，无效参数、镜像不存在和上游不可用通常分别为 400、404、502/504；安装上游错误区分 Docker 与 GitHub 来源。Worker 不在服务端组装安装包或镜像 TAR。

## 镜像源配置

默认镜像源集中在根目录 `config.js` 的 `imageSources`。部署时可通过 `IMAGE_SOURCES` 完整覆盖列表，支持 JSON 类型的数组或包含数组的 JSON 字符串；未设置时使用默认配置，空数组或无效值会报错。每个源包含 `id`、`label` 和 HTTPS `url`，并可设置 `naming`（`docker-hub` 或 `native`）、`requiresNamespace`（是否要求 `owner/image`）及 `example`（输入框示例）。这些规则由 `/api/sources` 提供给前端，Worker 也按 `naming` 解析仓库路径。未设置时，`mirror-gcr` 使用 Docker Hub 命名，其余源使用原生路径，`requiresNamespace` 默认为 `false`。默认包含 `mirror.gcr.io`、`ghcr.io`、`quay.io`、`registry.k8s.io`、`registry.gitlab.com`、`mcr.microsoft.com` 与 `public.ecr.aws`。新增镜像源只需更新默认配置或覆盖变量，无需改 Worker 路由或前端源 ID 列表。`UPSTREAM_REGISTRY` 已移除，避免与源列表产生两个默认上游。

EdgeOne 使用同名运行时变量，填写上述列表的 JSON 字符串；开发与部署见 [README](../README.md#edgeone-开发与部署)。

在 Cloudflare 控制台的 Worker → Settings → Variables and Secrets 中添加名为 `IMAGE_SOURCES`、类型为 JSON 的变量，值直接填写数组：

```json
[
  {
    "id": "my-mirror",
    "label": "My Mirror",
    "url": "https://registry.example.com",
    "naming": "docker-hub",
    "requiresNamespace": false,
    "example": "nginx:latest"
  }
]
```

也可以在 `wrangler.jsonc` 的 `vars.IMAGE_SOURCES` 中直接使用该数组，无需转义成字符串。本项目启用 `keep_vars`，部署时保留控制台设置的非密钥变量；若 Wrangler 显式配置同名变量，则以 Wrangler 值为准。覆盖列表不会与默认源合并，前端通过 `/api/sources` 获取实际生效的名称与规则。
