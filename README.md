# DockerBoost

基于 Hono、部署在 Cloudflare Workers 上的 Docker 镜像代理，提供安装、加速配置、拉取命令和浏览器/终端下载。自动选源按延迟逐批并发查询已配置源，采用第一个成功响应；未缓存镜像可能不可用，不绕过上游鉴权或限流。

## 页面功能

### 安装

在线安装使用 LinuxMirrors 脚本。离线安装可选择 Linux 架构与 Docker 版本，自动匹配 Compose 最新正式版；浏览器下载完整 TAR 包，或复制命令在联网机器下载后带到离线机器。文件经本站代理下载，下载机器无需直连 Docker 或 GitHub。

离线包提供程序、配置、systemd 服务、校验文件及交互安装脚本，仅支持全新安装的 systemd Linux；需要 iptables/ip6tables 等系统依赖。具体操作和限制见包内 `readme.md`。

### 配置

生成本站镜像加速配置命令。修改已有 `daemon.json` 前备份，并提供恢复命令；也可手动合并页面展示的 `registry-mirrors` 字段。

### 拉取

输入镜像名或粘贴 `docker pull` 命令，选择镜像源与架构，生成拉取和标签命令。拉取与下载共享镜像选择，分享链接可恢复页面参数。

### 下载

- 浏览器将镜像层流式暂存至 OPFS，本地组装 TAR 并触发保存；需要支持 OPFS 的浏览器和足够磁盘空间。安装包与镜像下载均可停止并清理暂存。
- 终端命令使用 curl 下载、本机 tar 打包，无需 Docker、jq 或 Skopeo；需常见 shell 工具。下载脚本成功、失败或收到可捕获中断后删除自身和临时文件，成功时保留 TAR。
- Worker 解析元数据并流式转发文件，不在服务端组装整份归档；下载仍受上游限流、网络和平台资源限制影响。

镜像归档可通过 `docker load -i nginx_latest_linux_amd64.tar` 导入。浏览器不能确认文件已保存完毕，触发保存后保留暂存 60 秒；关闭页面可能中断清理，下次访问会回收遗留目录。缓存与任务规则见 [下载任务与缓存](docs/downloads.md)。

## 项目结构

| 位置 | 职责 |
| --- | --- |
| `src/client/app.js` | 原生 JavaScript 页面入口，管理初始化、语言与标签切换 |
| `src/client/features/` | 页面功能：install（安装）、setup（配置）、pull（拉取）、download（下载） |
| `src/client/common/` | 前端复用能力，例如镜像选择、语言、浏览器下载任务与文件写入 |
| `src/client/styles/` | 页面与共用样式，由 index.css 统一导入；功能专属样式留在 features 对应目录 |
| `src/api/index.ts` | Hono Worker 入口，挂载业务路由并统一处理错误与静态资源回退 |
| `src/api/routes/` | 业务路由：install、images、download、registry、share、status；各目录 index.ts 注册子路由 |
| `src/api/common/` | 跨业务复用能力，例如镜像源配置与选择、Registry 请求、镜像解析及 HTTP 适配 |
| `public/` | 页面与静态资源 |
| `scripts/` | 构建、发布标识和架构检查 |
| `tests/` | 接口、安装脚本、归档及浏览器下载等回归测试 |
| `docs/` | development.md、api.md、downloads.md 分别说明开发接入、接口契约与下载机制 |
| `docs/design/` | 视觉规范与设计流程 |
| `docs/plans/` | pending 存放待实现或待验收事项，implemented 存放交付记录 |
| `docs/research/` | 调研结果与选型依据 |
| `wrangler.jsonc` | Worker 绑定、镜像源及部署配置 |
| `.github/workflows/` | 持续验证与部署 |

模块接入和依赖边界见 [开发参考](docs/development.md)，详细文档按 [索引](docs/README.md) 查阅。

## 本地开发

使用 Node.js 22 或更新版本：

```sh
npm ci
npm run dev
```

Wrangler 自动构建并监听前端、静态资源与构建脚本变化；服务端源码由 Wrangler 处理。

```sh
npm run check     # TypeScript 类型与 API 依赖边界检查
npm test          # 回归测试，需 sh、bash、tar、sha256sum 等工具
npm run build     # 生成 dist
npm run validate  # 类型检查、测试与构建；CI 使用此命令
```

修改源码，不手工编辑 `dist/`。开发前阅读 [AGENTS.md](AGENTS.md)，再按任务从 [文档索引](docs/README.md) 选择相关说明；React Bits MCP 配置、模块分工和新增标签步骤见 [开发参考](docs/development.md)。

## 部署

```sh
npx wrangler login
npm run deploy
```

部署自动构建。镜像源在 `wrangler.jsonc` 的 `IMAGE_SOURCES` 配置，字段和路径规则见 [接口参考](docs/api.md#镜像源配置)。GitHub Actions 在 PR、推送 `main` 或手动触发时执行验证，非 PR 触发在验证通过后部署；需要 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` secrets。

使用本站作为 Docker 镜像加速地址时，保留 `daemon.json` 的其他配置，修改后重启 Docker；Docker Desktop 在设置界面应用并重启。

## 文档

[文档索引](docs/README.md) 按任务列出开发参考、接口、下载机制、设计规范和计划。当前行为写在 README 与专题文档，待实现目标与交付记录仅保留在计划中。
