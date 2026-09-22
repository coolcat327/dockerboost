# DockerBoost

部署在 Cloudflare Workers 上的 Docker Hub 镜像代理，提供命令生成、浏览器下载和终端下载。默认会并发查询已配置镜像源，并使用第一个成功响应；未缓存的镜像可能不可用，不绕过上游鉴权或限流。

## 项目结构

```text
src/
  client/                    浏览器源码
    app.js                   页面交互与状态编排
    image-reference.js       镜像引用、源路径规则与命令目标生成
    image-input.js           粘贴 docker pull 命令解析
    export-client.js         下载 Worker 消息协议
    browser-export-worker.js 浏览器本地下载与 tar 打包
    styles/                  样式源码，index.css 定义级联顺序
  worker/                    Cloudflare 服务端
    index.ts                 HTTP 路由与静态资源入口
    sources.ts               镜像源配置、选择与路径约定
    registry.ts              上游请求、匿名认证、回退与流式透传
    images.ts                镜像引用与平台解析
    download-script.ts       curl + tar 脚本生成
    types.ts                 服务端类型
public/                      原样复制的静态资源（index.html）
scripts/build.mjs            前端构建入口
tests/                       回归测试
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
npm run build     # 生成 dist 下的 JS、CSS 和 HTML
npm run validate  # 类型检查、测试和前端构建
```

修改 src/client 或 public/index.html，不要编辑生成的 dist/app.bundle.js。CSS 保留现有级联顺序，构建为一个 app.css，不改变原有布局。

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
| /api/sources | 可供手动选择的镜像源 |
| /api/platforms?image=...&source=auto | 原样返回 manifest/index，由前端解析架构；`auto` 并发选择首个成功源 |
| /api/inspect?image=...&platform=...&source=... | 镜像层数和目标架构，保留兼容 |
| /api/download-script?image=...&platform=...&source=... | 生成终端下载脚本 |
| /v2/* | Registry 请求与 blob 流式透传；`/v2/<source-id>/*` 可明确指定源 |
| /api/save | 已停用，返回 410；改用浏览器或终端下载 |

## 部署

```sh
npx wrangler login
npm run deploy
```

部署会自动构建。`IMAGE_SOURCES` 在 `wrangler.jsonc` 中配置为 JSON 数组；每个源包含 `id`、`label` 和 HTTPS `url`。默认包含 `mirror.gcr.io`、`ghcr.io`、`quay.io`、`registry.k8s.io`、`registry.gitlab.com`、`mcr.microsoft.com` 与 `public.ecr.aws`。以后新增镜像源只需更新该配置，无需改 Worker 路由。`UPSTREAM_REGISTRY` 已移除，避免与源列表产生两个默认上游。GitHub Actions 会在 PR、推送到 `main` 或手动触发时执行 `npm run validate`；非 PR 触发会在校验通过后部署。需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` secrets。

将站点 HTTPS 地址加入 /etc/docker/daemon.json 的 registry-mirrors 时，保留其他现有配置，并重启 Docker。使用 systemd 的 Linux 执行 sudo systemctl restart docker；Docker Desktop 在设置界面应用并重启。
