# DockerBoost 开发指南

## 项目结构

- `src/client/`：单页前端及其功能、共享逻辑和样式。
- `src/worker/`：Cloudflare Worker 的路由与服务端逻辑。
- `public/`：页面和静态资源；`scripts/`：构建脚本；`tests/`：回归测试。
- `wrangler.jsonc`：Worker 配置；`.github/workflows/`：CI 与部署。具体文件分工和操作流程见 README。

`dist/`、`node_modules/`、`.wrangler/` 和本地环境文件是生成或私有内容，不要手工修改或提交。

## 开发约定

- 使用 Node.js 22 或更新版本和 `npm ci`。CI 执行 `npm run validate`；其他命令及环境要求见 README。
- 从需求涉及的最小范围改动。前端源码改 `src/client/` 或 `public/`；新增专属样式放功能目录，页面及共用样式放 `styles/`，并保持 `styles/index.css` 的级联顺序。
- Worker 改动须保持路由契约及 Registry 响应的流式透传。镜像源配置集中在 `wrangler.jsonc` 和 `src/worker/sources.ts`，源的仓库命名规则经 `/api/sources` 提供给前端；普通 `/v2/<repo>/...` 路径保留完整仓库名，显式源使用 `/v2/dkbst/<source-id>/...`。元数据接口的 `auto` 源须使用一致的仓库路径规则。
- 保持 TypeScript 严格检查通过；不要提交密钥、令牌或 `.env*`、`.dev.vars*`。

## 文档维护与验证

- 每轮修改仓库前先检查 `git status --short` 和受影响目录的实际文件，保留用户未提交的改动。
- 本文件只记录长期适用的仓库级约定：顶层目录职责、开发约束和最低验证要求。仅当这些约定发生实质变化时更新；新增或修改单个文件、功能、资源、测试用例及其覆盖范围时，不逐项写入本文件。具体文件分工、功能行为、接口和测试细节写在 README 或源码与测试中。
- 更新本文件时概括规则，避免罗列当前实现和单次修复；完成前按改动范围核对相关源码、`package.json`、`wrangler.jsonc` 与工作流。
- TypeScript 或 Worker 改动至少运行 `npm run check`；行为改动运行相关测试；前端入口、样式、`public/` 或构建改动运行 `npm run build`。跨层改动运行 `npm run validate`。
- 最终汇报改动、实际验证结果及未执行的检查，并明确写出“AGENTS.md：已同步”或“AGENTS.md：无需更新（原因）”。
