# 本地开发与工具

本文维护运行环境、依赖安装、本地调试、验证命令及开发工具配置。命令以根目录 `package.json` 为准。

## 环境与安装

使用 Node.js 22 或更新版本及 pnpm 12.14.0，具体要求固定在 `package.json` 的 `engines` 和 `packageManager`。测试还需 `sh`、`bash`、`curl`、`jq`、`tar`、`sha256sum` 等命令行工具；CI 使用 Ubuntu，其他系统请先安装缺少的工具。pnpm 安装方式见[官方说明](https://pnpm.io/installation)。

在项目根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

打开 Wrangler 在终端输出的地址。`dev` 与 `dev:cloudflare` 等价，运行完整的页面与 API；Wrangler 自动构建并监听前端、静态资源、构建脚本和 `config.js`，服务端源码由 Wrangler 处理。

## 调试入口

| 命令 | 用途 |
| --- | --- |
| `pnpm run dev` | Cloudflare 本地运行，包含页面与 API |
| `pnpm run dev:assets` | 仅启动前端资源服务，默认 5173 端口，不提供 API |
| `pnpm run dev:edgeone` | EdgeOne 本地运行；登录、关联与端口约定见[平台开发与部署](deployment.md#edgeone-开发与部署) |

前端资源服务监听源码和配置变化后重新构建，刷新浏览器查看结果。修改源码及 `public/`，不要手工修改 `dist/`、`node_modules/` 或本地平台状态目录。

## 验证命令

| 命令 | 检查范围 |
| --- | --- |
| `pnpm run check` | TypeScript 与 API 依赖边界 |
| `pnpm run check:architecture` | 仅 API 静态依赖边界 |
| `pnpm test` | 接口、脚本、归档和前端逻辑回归 |
| `pnpm run build` | 生产资源构建，输出到 dist |
| `pnpm run validate` | check、test、build 顺序执行；CI 使用此命令 |

按仓库级约定选择检查范围。浏览器布局、物理设备和真实平台传输不在上述命令的覆盖范围内。

## React Bits MCP

本项目将 React Bits MCP 作为必备开发工具，用于组件浏览和搜索。React Bits 通过 shadcn MCP 接入，支持 Claude Code、Codex、Cursor 等 MCP 客户端。请按照所用客户端的 [shadcn MCP 配置说明](https://ui.shadcn.com/docs/mcp) 添加一个名为 `shadcn` 的 STDIO 服务，启动命令与参数为：

```sh
npx -y shadcn@latest mcp
```

在客户端配置中，`command` 为 `npx`，`args` 为 `["-y", "shadcn@latest", "mcp"]`。可选择仅对本项目生效，或使用已有的全局配置；配置文件位置及格式以客户端文档为准。确保服务工作目录为本项目根目录，以读取注册表。

项目根目录的 [`components.json`](../components.json) 已配置 `@react-bits` 注册表，无需重复添加；配置方式见 [React Bits 官方说明](https://reactbits.dev/get-started/mcp)。

在客户端中重新加载 MCP 服务或重启客户端后，在该项目中请求浏览或搜索 `@react-bits` 组件。首次启动时 `npx` 会联网下载 shadcn CLI；克隆项目或运行 `pnpm install --frozen-lockfile` 不会自动注册 MCP，每位开发者需在所用客户端中完成配置。普通网站用户无需安装。当前前端使用原生 JavaScript，采用 React 组件前需评估框架与依赖适配。

