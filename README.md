<div align="center">

<a href="https://docker.coolcat.win/"><img src="docs/assets/github-ocean-header.svg" width="100%" alt="DockerBoost 鲸鱼乘风破浪" /></a>

**简体中文** · [English](README.en.md)

**从安装 Docker 到带走镜像，一个页面搞定。**

[在线体验](https://docker.coolcat.win/) · [快速开始](#本地开发) · [部署自己的站点](#部署) · [详细文档](docs/README.md)

</div>

DockerBoost 是支持 Cloudflare Workers 和 EdgeOne Pages 的轻量 Docker 工具站，提供安装命令、镜像加速配置、拉取命令和离线归档。服务端流式转发文件，浏览器或终端在本地组装 TAR，下载镜像无需先安装 Docker。

## 你可以用它做什么

| 功能 | 使用方式 |
| --- | --- |
| 安装 Docker | 生成在线安装命令，或下载包含 Docker、Compose、配置及安装/卸载脚本的离线包 |
| 配置镜像加速 | 生成配置、备份与恢复命令 |
| 拉取镜像 | 输入镜像名、粘贴 `docker pull` 命令，或批量导入 Compose / 镜像列表，生成指定架构的拉取与标签命令 |
| 下载镜像 | 浏览器导出独立 TAR，或复制终端命令下载；批量模式支持逐项选择、停止、重试与移除，默认最多同时下载 5 个镜像 |
| 分享选择 | 分享单个镜像参数或整个下载队列；接收方打开队列链接后自动解析，不自动开始下载 |

拉取与下载共享单个镜像的选择。镜像源支持自动选择和手动指定；批量队列自动选源，可统一设置或逐项调整架构。Compose 变量与多文件配置请先用 `docker compose config` 展开；不执行 `build`。

在联网机器选择镜像与架构并下载归档，拷贝到目标机器后导入：

```sh
docker load -i nginx_latest_linux_amd64.tar
```

## 使用前须知

- **公开镜像**：自动选源逐批并发查询已配置源，采用首个成功响应。未缓存镜像可能不可用；不绕过上游鉴权、限流或网络限制。
- **浏览器下载**：需要支持 OPFS 的浏览器和足够磁盘空间；下载完成后在本地打包。浏览器可能要求允许批量文件下载。
- **终端下载**：需要 sh、curl、jq、tar 等常见工具；离线安装包还需要 sha256sum。无需 Docker 或 Skopeo，脚本会清理正常退出、失败或可捕获中断时的暂存文件。
- **离线安装**：面向全新安装的 systemd Linux，需 iptables/ip6tables 等系统依赖。选择架构和 Docker 版本后匹配 Compose 最新正式版；安装记录、备份与锁留在脚本目录，卸载仅处理有记录的安装，不接管已有或手动安装。操作步骤见包内 `readme.md`。在线安装使用 LinuxMirrors 脚本。
- **配置与发布**：应用镜像加速配置后需重启 Docker，Docker Desktop 在设置界面应用。站点更新后，旧页面或复制的版本化下载命令可能失效，请刷新并重新复制。

## 本地开发

使用 **Node.js 22 或更新版本**和 **pnpm 12.14.0**，在项目根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

打开终端输出的本地地址，Wrangler 自动构建并监听变更。完整检查使用：

```sh
pnpm run validate
```

环境依赖、调试入口和各项检查命令见[本地开发与工具](docs/development.md)。参与开发前阅读 [AGENTS.md](AGENTS.md)。

## 项目结构

| 位置 | 职责 |
| --- | --- |
| `src/client/` | 原生 JavaScript 页面、四个功能标签、共用能力与样式 |
| `src/api/` | Hono API、Registry 透传与平台适配 |
| `edge-functions/` | EdgeOne 文件路由薄入口 |
| `public/`、`scripts/` | 静态资源、构建及架构检查工具 |
| `tests/` | 接口、脚本、归档及前端逻辑回归 |
| `docs/` | 开发指南、接口与机制规范、决策及历史记录 |

目录细分与依赖方向见[系统架构](docs/architecture.md)。页面公开配置及默认镜像源位于 `config.js`，部署配置位于 `wrangler.jsonc` 和 `edgeone.json`。

## 部署

### Cloudflare Workers

调整 `wrangler.jsonc` 的 Worker 名称及 `config.js` 的页面配置，安装依赖后执行：

```sh
pnpm exec wrangler login
pnpm run deploy
```

### EdgeOne 开发与部署

安装依赖后登录、关联项目，再发布：

```sh
pnpm exec edgeone login
pnpm exec edgeone makers link
pnpm run deploy:edgeone
```

部署命令自动构建完整项目。EdgeOne 脚本固定使用 `--area overseas`，不要仅上传静态 `dist/`。也支持 GitHub Actions：Pull Request 运行验证，推送 main 验证后发布；手动运行可选择分支与平台，更新对应生产站点。

认证、Actions 凭据、预览部署、EdgeOne 本地调试及运行时变量设置统一见[平台开发与部署](docs/deployment.md)。

## 文档导航

按任务查阅[文档索引](docs/README.md)：开发与部署指南负责操作步骤，架构、接口、下载和视觉专题各自维护对应规则；待办、选型和历史记录分开保存。
