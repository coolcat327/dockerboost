# DockerBoost 开发指南

## 项目结构

- `src/worker/`：Cloudflare Worker 服务端；涵盖 HTTP 路由、镜像源配置、Registry 上游代理/认证/回退、镜像解析与终端下载脚本。
- `src/client/`：浏览器端源码；涵盖页面交互、镜像输入与引用解析、浏览器导出、下载进度/速率及样式。
- `public/`：原样复制到构建产物的静态资源与响应头规则。
- `scripts/`：构建脚本；使用 esbuild 打包前端并复制静态资源到 `dist/`。
- `tests/`：Node 内置测试运行器的回归测试，覆盖 Worker 与前端各功能模块。
- `wrangler.jsonc`：Worker 入口、静态资源、构建监视和镜像源配置。
- `.github/workflows/`：CI 校验与部署流程。

`dist/`、`node_modules/`、`.wrangler/`、本地环境文件（`.env*`、`.dev.vars*`）均为忽略内容；不要提交或手工修改它们。

## 环境、启动、测试与构建

CI 使用 Node.js 22；本地也使用 Node.js 22 或更新版本。依赖锁定在 `package-lock.json`，首次安装或需要干净安装时运行：

```sh
npm ci
```

可用命令如下：

```sh
npm run dev       # 通过 Wrangler 启动本地 Worker；会执行配置中的前端构建
npm run check     # tsc --noEmit，仅检查 src/**/*.ts
npm test          # node --test tests/*.test.mjs；下载脚本测试需要本机 sh 和 tar
npm run build     # 运行 scripts/build.mjs，生成 dist/ 中的 JS、CSS 与静态文件
npm run validate  # 依次执行 check、test、build；与 CI 的验证命令一致
npm run deploy    # 通过 Wrangler 部署；需要 Cloudflare 凭据
```

首次部署前可运行 `npx wrangler login`。部署工作流还要求 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。

## 改动边界与开发约定

- 从需求涉及的最小范围开始改动，避免无关重构、格式化或依赖升级。
- 修改浏览器功能时编辑 `src/client/` 或 `public/`，不要编辑生成的 `dist/app.bundle.js`、`dist/browser-export-worker.js` 或 `dist/app.css`；需要时以 `npm run build` 重新生成它们。
- CSS 保持 `src/client/styles/index.css` 中既有的级联顺序，除非任务明确要求改变样式层级或布局。
- 修改 Worker 行为时优先保持 `src/worker/index.ts` 的路由契约，以及 Registry 响应的流式透传行为；镜像源变更集中在 `wrangler.jsonc` 的 `IMAGE_SOURCES` 或对应的 `src/worker/sources.ts` 逻辑中。
- Registry 普通 `/v2/<repo>/...` 路径保留完整仓库名；显式源使用 Docker 镜像名合法的保留前缀 `/v2/dkbst/<source-id>/...`，前端生成的拉取地址必须与之同步。各元数据接口的 `auto` 源解析须使用一致的仓库路径规则。
- 保持 TypeScript 严格类型检查可通过；客户端 JavaScript、Worker TypeScript 与测试各自使用项目现有的模块写法。
- 不要提交密钥、令牌或本地 `.env*` / `.dev.vars*` 文件。

## AGENTS.md 持续维护（强制）

`AGENTS.md` 是项目当前事实的工作说明，不是一次性的初始化文档。每一轮会修改仓库内容的任务，都必须在实现与汇报前自动执行以下维护流程；不需要等待用户额外提醒：

**粒度原则：**项目结构默认只写目录或职责域，不逐一列举实现文件。仅当某个入口文件、配置文件或生成物规则是跨目录工作所必需的决策边界时才点名；新增普通模块时，更新其所属职责域即可。示例、完整 API 清单和逐文件索引应放在 `README.md`、专门设计文档或代码注释中，而非本文件。

1. 先用 `git status --short` 和受影响目录的 `rg --files` / 源码检查确认当前状态，避免把未提交的用户改动误记为已完成工作。
2. 判断改动是否改变了这里记录的项目结构、职责划分、命令/依赖、配置/部署、测试覆盖、生成物规则或开发约定。若改变，必须在同一改动中更新本文件；无变化时无需制造无意义的文档改动。
3. 新增、删除、移动模块，或改变模块职责域时，同步更新“项目结构”；同一职责域内的普通文件增减不单列。新增或替换测试时，仅在覆盖范围变化时更新测试说明；新增命令、环境要求、构建产物或 CI 行为时，同步更新对应章节。
4. 完成前复读本文件中受影响的段落，并以实际文件、`package.json`、`wrangler.jsonc` 和工作流为准交叉核验。事实冲突时，以代码与配置为准，立即修正文档。
5. 最终汇报明确写出“AGENTS.md：已同步”或“AGENTS.md：无需更新（原因）”。不能仅因任务跨越多轮对话而沿用旧描述；每个继续实现的回合都重复此检查。

以下变更视为必须更新本文件的触发条件：`src/` 或 `public/` 下新增/删除职责模块、`scripts/` 或构建链变动、`package.json` 脚本或运行时依赖变动、`wrangler.jsonc`/Worker 路由/镜像源策略变动、CI 工作流变动，以及测试入口或测试范围的实质变化。

## 完成前验证与汇报

- 对 TypeScript 或 Worker 改动至少运行 `npm run check`；对行为改动运行相关测试，通常直接运行 `npm test`。
- 若改动涉及客户端入口、样式、`public/` 或构建脚本，运行 `npm run build`；对跨层或不确定范围的改动，运行完整的 `npm run validate`。
- 若有无法在本地执行的验证，明确说明未执行的命令、原因和潜在影响；不要声称未运行的检查已通过。
- 汇报时列出改动的文件和用户可见或接口层面的影响，并说明实际执行的验证命令及结果。不要因为构建产生的已忽略 `dist/`、`.wrangler/` 或 `node_modules/` 内容而报告源代码改动。
