<div align="center">

<a href="https://docker.coolcat.win/"><img src="docs/assets/github-title-icon.svg" width="280" alt="DockerBoost 鲸鱼乘风破浪" /></a>

# DockerBoost

**简体中文** · [English](README.en.md)

**从安装 Docker 到带走镜像，一个页面搞定。**

部署在 Cloudflare Workers 上的轻量 Docker 工具站。
在线安装、镜像加速、拉取命令、离线打包，让不同网络环境下的 Docker 使用更顺手。

[在线体验](https://docker.coolcat.win/) · [快速开始](#本地开发) · [部署自己的站点](#部署) · [使用场景](#你可以用它做什么) · [详细文档](docs/README.md)

</div>

## 为什么选择 DockerBoost

- **一站完成常用操作**：安装、配置、拉取、下载四个入口，共享镜像选择，减少重复输入。
- **离线环境也有准备方案**：打包 Docker、Compose 或镜像归档，在联网机器下载后带到目标机器。
- **下载镜像无需先装 Docker**：浏览器直接导出 TAR，或用 curl 与本机 tar 在终端完成下载。
- **轻量部署到边缘**：基于 Hono 与 Cloudflare Workers，Worker 流式转发文件，归档在客户端组装。
- **按需选择镜像源**：支持自动选源、手动指定来源与架构；分享链接可以恢复页面参数。

## 你可以用它做什么

| 你的目标 | DockerBoost 提供的方式 |
| --- | --- |
| 给新机器装 Docker | 在线安装命令，或包含 Docker、Compose、配置和安装脚本的离线包 |
| 配置镜像加速 | 生成配置命令，备份已有配置，并提供恢复命令 |
| 拉取指定架构的镜像 | 输入镜像名或粘贴 `docker pull` 命令，生成拉取和标签命令 |
| 给离线机器准备镜像 | 在浏览器或终端下载 TAR，拷贝后用 `docker load` 导入 |
| 与同事分享相同镜像选择 | 复制分享链接，恢复镜像、来源与架构等页面参数 |

### 一份归档，把镜像带到离线机器

在页面选择镜像与架构，下载镜像归档，再在目标机器导入：

```sh
docker load -i nginx_latest_linux_amd64.tar
```

浏览器下载使用 OPFS 流式暂存镜像层并在本地组装 TAR；终端下载使用 curl、本机 tar 和常见 shell 工具，无需 Docker、jq 或 Skopeo。安装包与镜像下载均支持停止并清理暂存，具体规则见 [下载任务与缓存](docs/downloads.md)。

### 先了解这些使用边界

- 自动选源按延迟逐批并发查询已配置源，采用第一个成功响应；未缓存镜像可能不可用，不绕过上游鉴权或限流，也不保证所有镜像均可访问。
- 浏览器下载需要支持 OPFS 的浏览器和足够磁盘空间；网络、上游限流与平台资源限制仍会影响下载。
- 在线安装使用 LinuxMirrors 脚本。离线安装包面向**全新安装的 systemd Linux**，需 iptables/ip6tables 等系统依赖；支持选择 Linux 架构与 Docker 版本，并匹配 Compose 最新正式版，详细操作见包内 `readme.md`。
- 应用镜像加速配置时需保留 `daemon.json` 的其他字段并重启 Docker；Docker Desktop 在设置界面应用并重启。

## 本地开发

使用 **Node.js 22 或更新版本**和 **pnpm 12.14.0**（版本固定在 `package.json` 的 `packageManager` 字段）。如果尚未安装 pnpm，可按 [pnpm 安装说明](https://pnpm.io/installation)安装对应版本：

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

打开终端提示的本地地址即可使用。Wrangler 自动构建并监听前端、静态资源与构建脚本变化；服务端源码由 Wrangler 处理。

```sh
pnpm run check     # TypeScript 类型与 API 依赖边界检查
pnpm test          # 回归测试，需 sh、bash、tar、sha256sum 等工具
pnpm run build     # 生成 dist
pnpm run validate  # 类型检查、测试与构建；CI 使用此命令
```

修改源码，不手工编辑 `dist/`。参与开发前阅读 [AGENTS.md](AGENTS.md)，模块接入与依赖边界见 [开发参考](docs/development.md)。

## 项目结构

| 位置 | 职责 |
| --- | --- |
| `src/client/index.html` | 页面模板，构建时注入配置及版本化资源路径 |
| `src/client/app.js` | 原生 JavaScript 页面入口，管理初始化、语言与标签切换 |
| `src/client/features/` | 页面功能：install（安装）、setup（配置）、pull（拉取）、download（下载） |
| `src/client/common/` | 前端复用能力，例如镜像选择、语言、浏览器下载任务与文件写入 |
| `src/client/styles/` | 页面与共用样式，由 index.css 统一导入；功能专属样式留在 features 对应目录 |
| `src/api/index.ts` | Hono Worker 入口，挂载业务路由并统一处理错误与静态资源回退 |
| `src/api/routes/` | 业务路由：install、images、download、registry、share、status；各目录 index.ts 注册子路由 |
| `src/api/common/` | 跨业务复用能力，例如镜像源配置与选择、Registry 请求、镜像解析及 HTTP 适配 |
| `public/` | 静态资源与托管配置 |
| `scripts/` | 构建、发布标识和架构检查 |
| `tests/` | 接口、安装脚本、归档及浏览器下载等回归测试 |
| `docs/` | development.md、api.md、downloads.md 分别说明开发接入、接口契约与下载机制 |
| `docs/design/` | 视觉规范与设计流程 |
| `docs/plans/` | pending 存放待实现或待验收事项，implemented 存放交付记录 |
| `docs/research/` | 调研结果与选型依据 |
| `config.js` | 页面公开配置与默认镜像源 |
| `wrangler.jsonc` | Worker 绑定、变量覆盖与部署配置 |
| `.github/workflows/` | 持续验证与部署 |

模块接入和依赖边界见 [开发参考](docs/development.md)，详细文档按 [索引](docs/README.md) 查阅。

## 部署

### 通过 GitHub Actions 部署

1. 将项目推送到自己的 GitHub 仓库，建议将默认分支设为 `main`。
2. 在 `wrangler.jsonc` 中设置 Worker 名称；页面链接、作者与默认镜像源在根目录 `config.js` 中配置。可用 JSON 类型变量 `IMAGE_SOURCES` 覆盖镜像源列表。镜像源字段与路径规则见 [接口参考](docs/api.md#镜像源配置)。
3. 在仓库 **Settings → Secrets and variables → Actions** 中添加以下 Repository secrets：

   | Secret | 用途 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | 具有目标账户 Workers 部署权限的 API Token |
   | `CLOUDFLARE_ACCOUNT_ID` | 目标 Cloudflare 账户 ID |

4. 将工作流推送到默认分支后，在 **Actions → Validate and deploy DockerBoost** 查看执行结果。

| 触发方式 | 行为 |
| --- | --- |
| 推送到 `main` | 自动运行类型检查、测试和构建，通过后部署 |
| 创建或更新 Pull Request | 运行验证 |
| 手动运行 | 点击 **Run workflow**，在 **Use workflow from** 下拉框选择要部署的分支，通过验证后部署 |
| 推送到其他分支 | 不自动触发部署；可手动选择该分支运行 |

手动选择分支使用 GitHub 原生入口，参见 [GitHub 手动运行工作流说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)。默认分支设为 `main` 时，手动入口默认选择 `main`。所选分支需包含该工作流；验证和部署固定使用本次触发的同一个提交，运行名称会显示分支名。

**手动部署其他分支也会更新同一个线上 Worker**，不会创建独立预览站点。部署任务使用同一并发组，同一时间只运行一个部署；GitHub 可能合并等待中的运行，不保证每次触发都发布。

### 从本地部署

先安装依赖并调整 `wrangler.jsonc`，然后登录 Cloudflare：

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm run deploy
```

部署时会自动构建。部署完成后，使用 Wrangler 输出的站点地址访问。

## 文档与开发导航

- [文档索引](docs/README.md)：按任务查阅项目文档。
- [开发参考](docs/development.md)：模块结构、接口接入与依赖边界。
- [接口参考](docs/api.md)：API 契约、Registry 与镜像源配置。
- [下载任务与缓存](docs/downloads.md)：浏览器与终端下载、暂存与清理机制。
- [视觉规范](docs/design/visual-style.md)：页面风格与交互约束。
