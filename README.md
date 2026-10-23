<div align="center">

<a href="https://docker.coolcat.win/"><img src="docs/assets/github-title-icon.svg" width="280" alt="DockerBoost 鲸鱼乘风破浪" /></a>

# DockerBoost

**简体中文** · [English](README.en.md)

**从安装 Docker 到带走镜像，一个页面搞定。**

支持 Cloudflare Workers 和 EdgeOne Pages 的轻量 Docker 工具站。
在线安装、镜像加速、拉取命令、离线打包，让不同网络环境下的 Docker 使用更顺手。

[在线体验](https://docker.coolcat.win/) · [快速开始](#本地开发) · [部署自己的站点](#部署) · [使用场景](#你可以用它做什么) · [详细文档](docs/README.md)

</div>

## 为什么选择 DockerBoost

- **一站完成常用操作**：安装、配置、拉取、下载四个入口，共享镜像选择，减少重复输入。
- **离线环境也有准备方案**：打包 Docker、Compose 或镜像归档，在联网机器下载后带到目标机器。
- **下载镜像无需先装 Docker**：浏览器直接导出 TAR，或用 curl 与本机 tar 在终端完成下载。
- **轻量部署到边缘**：基于 Hono，支持 Cloudflare Workers 与 EdgeOne 边缘函数，服务端流式转发文件，归档在客户端组装。
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
- 在线安装使用 LinuxMirrors 脚本。离线安装包面向**全新安装的 systemd Linux**，需 iptables/ip6tables 等系统依赖；支持选择 Linux 架构与 Docker 版本，并匹配 Compose 最新正式版，解压到同名顶层文件夹，包含带安装记录的幂等安装/卸载脚本；记录、配置备份和锁均保存在脚本同目录；卸载仅清理有安装记录的程序与服务，备份当前配置供下次安装复用，不接管旧版或手动安装。详细操作见包内 `readme.md`。
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

修改源码，不手工编辑 `dist/`。参与开发前阅读 [AGENTS.md](AGENTS.md)，模块接入与依赖边界见 [开发参考](docs/architecture.md)。

## 项目结构

| 位置 | 职责 |
| --- | --- |
| `src/client/index.html` | 页面模板，构建时注入配置及版本化资源路径 |
| `src/client/app.js` | 原生 JavaScript 页面入口，管理初始化、语言与标签切换 |
| `src/client/features/` | 页面功能：install（安装）、setup（配置）、pull（拉取）、download（下载） |
| `src/client/common/` | 前端复用能力，例如镜像选择、语言、浏览器下载任务与文件写入 |
| `src/client/styles/` | 页面与共用样式，由 index.css 统一导入；功能专属样式留在 features 对应目录 |
| `src/api/app.ts` | 共用 Hono 应用，挂载业务路由并统一处理错误 |
| `src/api/platforms/` | Cloudflare 与 EdgeOne 平台入口 |
| `edge-functions/` | EdgeOne 的 `/api` 与 `/v2` 文件路由 |
| `src/api/routes/` | 业务路由：install、images、download、registry、share、status；各目录 index.ts 注册子路由 |
| `src/api/common/` | 跨业务复用能力，例如镜像源配置与选择、Registry 请求、镜像解析及 HTTP 适配 |
| `public/` | 静态资源与托管配置 |
| `scripts/` | 构建、发布标识和架构检查 |
| `tests/` | 接口、安装脚本、归档及浏览器下载等回归测试 |
| `docs/` | 文档总索引，各专题按职责分目录维护 |
| `docs/` | 当前架构、开发、接口、下载与视觉专题 |
| `docs/decisions/` | 选型与决策依据 |
| `docs/archive/` | 已完成计划与历史验证 |
| `docs/plans/` | pending 存放待实现或待验收事项，implemented 存放交付记录 |
| `config.js` | 页面公开配置与默认镜像源 |
| `wrangler.jsonc`、`edgeone.json` | 两个平台的构建与部署配置 |
| `.github/workflows/` | 持续验证与部署 |

模块接入和依赖边界见 [开发参考](docs/architecture.md)，详细文档按 [索引](docs/README.md) 查阅。

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
| 手动运行 | 点击 **Run workflow**，在 **Use workflow from** 下拉框选择分支，在 **Deployment platform** 选择 cloudflare（默认）、edgeone 或 all，通过验证后部署 |
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

### EdgeOne 开发与部署

使用项目内锁定的 EdgeOne CLI。当前 CLI 使用 `makers` 命令，旧 `pages` 命令已弃用。Cloudflare 的 `dev`、`deploy` 保持兼容，也可显式使用 `dev:cloudflare`、`deploy:cloudflare`。

首次登录并关联项目：

```sh
pnpm exec edgeone login
pnpm exec edgeone makers link
pnpm run dev:edgeone
```

登录时按账号选择 China 或 Global；站点与加速区域是两项配置。项目无需再次运行 init。开发入口默认为 `http://localhost:8088`，CLI 将函数与 5173 端口的前端服务整合到同一入口。前端变更自动重新构建，刷新页面查看结果；函数由 CLI 监听。`edgeone.json` 的 `devCommand` 必须保持为前端服务，不能改为 `dev:edgeone` 或 Wrangler。

```sh
pnpm run validate
pnpm run deploy:edgeone:preview
pnpm run deploy:edgeone
```

生产和预览部署脚本均固定使用 `--area overseas`（全球不含中国大陆），GitHub Actions 调用同一脚本，也使用该区域。直接运行 CLI 时必须带上此参数，例如 `pnpm exec edgeone makers deploy --area overseas`；否则 CLI 默认使用 `global`，海外 Registry 回源仍可能受到中国大陆网络限制。登录时选择 China 或 Global 不能替代此部署区域配置。

部署命令自动构建并部署完整项目，不要直接上传仅包含静态资源的 `dist/`。CLI 发布到已有项目时要求项目为直接上传类型。也可在 EdgeOne 导入 Git 仓库，使用 `edgeone.json` 中的安装、构建命令和 `dist` 输出目录，并在平台设置中选择全球不含中国大陆的加速区域；若使用平台 Git 自动发布，不要再为同一项目启用 Actions 发布。

如需现有 GitHub Actions 同时部署 EdgeOne，在仓库 **Variables** 设置 `EDGEONE_PROJECT_NAME`，在 **Secrets** 设置 `EDGEONE_API_TOKEN`。Cloudflare 项目名为 `dockerboost`（见 `wrangler.jsonc`）；EdgeOne 项目名由该仓库变量决定。手动运行仅发布所选平台，选择 all 时发布两个平台；推送 main 仍自动发布已启用的平台。未设置项目名时跳过 EdgeOne 部署；启用后与 Cloudflare 共用验证、分别发布。两者使用同一提交、独立并发组，手动发布其他分支同样会更新各自生产站点。

在 EdgeOne 控制台配置运行时环境变量 `IMAGE_SOURCES`，值为 JSON 数组字符串；不配置时沿用默认源。生产、预览环境分别检查配置。账号、Token 与本地环境文件不提交 Git。

前端直接由 Pages 托管，仅 `/api`、`/v2` 进入边缘函数；没有 Node.js 云函数或服务端归档。正式切换前，在 overseas 预览环境验证海外 Registry 回源、鉴权、Range/HEAD、大镜像层、长时间传输和取消；本地测试不能确认平台的传输配额与网络表现。参见 [EdgeOne CLI](https://edgeone.cloud.tencent.com/pages/document/162936923278893056) 和 [边缘函数](https://pages.edgeone.ai/document/edge-functions)。

## 文档与开发导航

- [文档索引](docs/README.md)：按任务查阅项目文档。
- [开发参考](docs/architecture.md)：模块结构、接口接入与依赖边界。
- [接口参考](docs/api.md)：API 契约、Registry 与镜像源配置。
- [下载任务与缓存](docs/downloads.md)：浏览器与终端下载、暂存与清理机制。
- [视觉规范](docs/ui.md)：页面风格与交互约束。
