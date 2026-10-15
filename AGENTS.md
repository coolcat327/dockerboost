# DockerBoost 开发约定

## 阅读与文档职责

先阅读本文件；其他文档按任务查阅，不默认通读 `docs/` 或历史计划。

- `AGENTS.md`：长期仓库约束、阅读入口和最低验证要求。只在这些约定变化时更新，不记录文件清单、功能细节或交付日志。
- [README.md](README.md)：当前功能、使用限制、本地启动、验证命令和部署入口，面向使用者与开发者。
- [docs/README.md](docs/README.md)：专题索引；开发、接口、下载机制及设计细节各自只保留一处说明。行为或契约变化时更新所属文档；纯内部重构不追加说明。
- `docs/plans/pending/` 与 `docs/plans/implemented/`：待实现方案和交付记录。计划不是当前行为或通用约束；仅处理对应任务或追溯决策时读取。

按修改范围选择：前端模块与新增标签读 [开发参考](docs/development.md)，视觉变更再读 [视觉规范](docs/design/visual-style.md) 和 [设计流程](docs/design/workflow.md)；接口与镜像源读 [接口参考](docs/api.md)；下载、OPFS 或缓存读 [下载机制](docs/downloads.md)。源码、`package.json`、`wrangler.jsonc` 与工作流是实现事实依据，文档随其同步。

## 通用约束

- 每轮修改前检查 `git status --short` 和受影响目录实际文件，保留用户未提交改动；从需求涉及的最小范围修改。
- 使用 Node.js 22 或更新版本及 `npm ci`。不要手工修改或提交 `dist/`、`node_modules/`、`.wrangler/`，不要提交密钥、令牌及 `.env*`、`.dev.vars*`。
- 文件名体现领域和职责；专属实现避免泛用的 download/script 名称。保持导入、构建入口、缓存规则、测试和文档引用一致。
- 公共模块仅放实际复用能力，不为未来可能复用提前抽象；前后端确实共用的纯逻辑放 `src/shared/`。

## 前端

- 源码改 `src/client/` 或 `public/`。功能专属样式放功能目录，页面与共用样式放 `styles/`，保持 `styles/index.css` 的级联顺序。
- 复用现有颜色变量、字体层级、间距和控件，不另建主题或重复公共规则。按视觉规范检查中英文、宽窄屏与控件状态。
- 动效不阻塞内容和操作，尊重减少动态效果设置；页面隐藏或装饰离屏时暂停持续动画。

## Worker 与下载

- Worker 入口只做路由分发。路由及专属依赖放 `src/api/routes/<route>/`；简单且无专属依赖的路由可用单文件。跨路由实际共用能力放 `src/api/common/`，路由不直接依赖彼此内部实现。
- 保持路由契约和 Registry 流式透传。镜像源集中在 `wrangler.jsonc` 和 `src/api/common/sources.ts`，命名规则经 `/api/sources` 提供给前端。普通 `/v2/<repo>/...` 保留完整仓库名，显式源用 `/v2/dkbst/<source-id>/...`；元数据接口的 `auto` 使用一致路径规则。
- 浏览器下载统一使用 `src/client/common/browser-download-task.js` 管理 OPFS、任务保护、保存和清理；功能模块只负责内容与打包，在 finally 结束任务，先停止后台写入再清理，不另建缓存生命周期。
- HTTP 缓存与 OPFS 暂存分开管理。下载请求沿用公共发布标识与地址逻辑，标识覆盖前后端及安装模板变更，不向上游透传。

## 验证与交付

- TypeScript 或 Worker 改动至少运行 `npm run check`，保持严格检查通过；行为改动运行相关测试。
- 前端入口、样式、`public/` 或构建改动运行 `npm run build`；跨层改动运行 `npm run validate`。仅文档改动检查链接、引用和差异，不要求重跑代码测试。
- 功能与接口说明按安装、配置、拉取、下载的页面顺序排列；接口文档包含方法、路径、参数与默认值、响应和重要限制。详细安装步骤留在下载包内说明，代码细节留在源码与测试。
- 最终汇报改动、实际验证和未执行检查，明确写出“AGENTS.md：已同步”或“AGENTS.md：无需更新（原因）”。
