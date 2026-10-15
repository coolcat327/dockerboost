# DockerBoost

部署在 Cloudflare Workers 上的 Docker 镜像代理，提供安装、加速配置、拉取命令和浏览器/终端下载。自动选源按延迟逐批并发查询已配置源，采用第一个成功响应；未缓存镜像可能不可用，不绕过上游鉴权或限流。

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

## 本地开发

使用 Node.js 22 或更新版本：

```sh
npm ci
npm run dev
```

Wrangler 自动构建并监听前端、静态资源与构建脚本变化；服务端源码由 Wrangler 处理。

```sh
npm run check     # TypeScript 类型检查
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
