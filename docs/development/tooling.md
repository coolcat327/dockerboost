# 开发工具

本文维护开发客户端的工具配置；Node.js、pnpm 版本和项目启动命令见 [README](../../README.md#本地开发)，前端组件接入见 [前端开发](frontend.md)。

## React Bits MCP

本项目将 React Bits MCP 作为必备开发工具，用于组件浏览和搜索。React Bits 通过 shadcn MCP 接入，支持 Claude Code、Codex、Cursor 等 MCP 客户端。请按照所用客户端的 [shadcn MCP 配置说明](https://ui.shadcn.com/docs/mcp) 添加一个名为 `shadcn` 的 STDIO 服务，启动命令与参数为：

```sh
npx -y shadcn@latest mcp
```

在客户端配置中，`command` 为 `npx`，`args` 为 `["-y", "shadcn@latest", "mcp"]`。可选择仅对本项目生效，或使用已有的全局配置；配置文件位置及格式以客户端文档为准。确保服务工作目录为本项目根目录，以读取注册表。

项目根目录的 [`components.json`](../../components.json) 已配置 `@react-bits` 注册表，无需重复添加；配置方式见 [React Bits 官方说明](https://reactbits.dev/get-started/mcp)。

在客户端中重新加载 MCP 服务或重启客户端后，在该项目中请求浏览或搜索 `@react-bits` 组件。首次启动时 `npx` 会联网下载 shadcn CLI；克隆项目或运行 `pnpm install --frozen-lockfile` 不会自动注册 MCP，每位开发者需在所用客户端中完成配置。普通网站用户无需安装。当前前端使用原生 JavaScript，采用 React 组件前需评估框架与依赖适配。

