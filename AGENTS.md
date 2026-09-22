# DockerBoost 开发指南

## 项目结构

- `src/worker/`：Cloudflare Worker 服务端。`index.ts` 负责 HTTP 路由和静态资源入口；`sources.ts` 管理镜像源；`registry.ts` 处理上游 Registry 请求、认证、回退和流式透传；`images.ts` 解析镜像和平台；`download-script.ts` 生成终端下载脚本。
- `src/client/`：浏览器端源码。`app.js` 编排页面交互；`image-reference.js` 与 `image-input.js` 处理镜像输入；`export-client.js` 和 `browser-export-worker.js` 支持浏览器导出；`styles/` 是 CSS 源码。
- `public/`：原样复制到构建产物的静态资源（目前为 `index.html` 和 `docker-icon.svg`）。
- `scripts/build.mjs`：使用 esbuild 将客户端 JS/CSS 打包并复制 `public/` 到 `dist/`。
- `tests/`：Node 内置测试运行器的回归测试；包括 Worker 路由、镜像引用、输入解析、导出客户端和下载脚本。
- `wrangler.jsonc`：Worker 入口、静态资源目录、构建监视目录和 `IMAGE_SOURCES` 配置。
- `.github/workflows/deploy.yml`：CI 在 PR、推送到 `main` 和手动触发时执行校验；非 PR 事件在校验通过后部署。

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
- 保持 TypeScript 严格类型检查可通过；客户端 JavaScript、Worker TypeScript 与测试各自使用项目现有的模块写法。
- 不要提交密钥、令牌或本地 `.env*` / `.dev.vars*` 文件。

## 完成前验证与汇报

- 对 TypeScript 或 Worker 改动至少运行 `npm run check`；对行为改动运行相关测试，通常直接运行 `npm test`。
- 若改动涉及客户端入口、样式、`public/` 或构建脚本，运行 `npm run build`；对跨层或不确定范围的改动，运行完整的 `npm run validate`。
- 若有无法在本地执行的验证，明确说明未执行的命令、原因和潜在影响；不要声称未运行的检查已通过。
- 汇报时列出改动的文件和用户可见或接口层面的影响，并说明实际执行的验证命令及结果。不要因为构建产生的已忽略 `dist/`、`.wrangler/` 或 `node_modules/` 内容而报告源代码改动。
