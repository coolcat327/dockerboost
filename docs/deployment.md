# 平台开发与部署

本文维护 Cloudflare Workers 与 EdgeOne Pages 的认证、平台启动、发布、CI 和运行时配置。命令及自动化行为以根目录 `package.json`、`wrangler.jsonc`、`edgeone.json` 和 `.github/workflows/deploy.yml` 为准。执行以下命令前，需在项目根目录完成依赖安装。

## GitHub Actions

1. 将项目推送到自己的 GitHub 仓库，建议将默认分支设为 `main`。
2. 在 `wrangler.jsonc` 中设置 Worker 名称；页面链接、作者与默认镜像源在根目录 `config.js` 中配置。可用运行时变量 `IMAGE_SOURCES` 覆盖镜像源列表，填写方式见下方[运行时配置](#运行时配置)。
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

## Cloudflare 本地部署

先安装依赖并调整 `wrangler.jsonc`，然后登录 Cloudflare：

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm run deploy
```

部署时会自动构建。部署完成后，使用 Wrangler 输出的站点地址访问。

## EdgeOne 开发与部署

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

如需现有 GitHub Actions 同时部署 EdgeOne，在仓库 **Variables** 设置 `EDGEONE_PROJECT_NAME`，在 **Secrets** 设置 `EDGEONE_API_TOKEN`。Cloudflare 项目名为 `dockerboost`（见根目录 `wrangler.jsonc`）；EdgeOne 项目名由该仓库变量决定。手动运行仅发布所选平台，选择 all 时发布两个平台；推送 main 运行 Cloudflare 发布，并在设置项目名后同时运行 EdgeOne 发布。未设置项目名时跳过 EdgeOne 部署；启用后与 Cloudflare 共用验证、分别发布。两者使用同一提交、独立并发组，手动发布其他分支同样会更新各自生产站点。

前端直接由 Pages 托管，仅 `/api`、`/v2` 进入边缘函数；没有 Node.js 云函数或服务端归档。正式切换前，在 overseas 预览环境验证海外 Registry 回源、鉴权、Range/HEAD、大镜像层、长时间传输和取消；本地测试不能确认平台的传输配额与网络表现。参见 [EdgeOne CLI](https://edgeone.cloud.tencent.com/pages/document/162936923278893056) 和 [边缘函数](https://pages.edgeone.ai/document/edge-functions)。

## 运行时配置

- 页面作者、公开链接与默认镜像源在根目录 `config.js` 配置，修改后重新构建部署。不要在此文件写入凭据。
- `IMAGE_SOURCES` 完整替换默认镜像源列表；字段、示例与校验规则见[镜像源配置](api.md#镜像源配置)。
- Cloudflare：在 Worker → Settings → Variables and Secrets 添加 JSON 类型的 `IMAGE_SOURCES`，直接填写数组；也可在 `wrangler.jsonc` 的 `vars.IMAGE_SOURCES` 中配置数组。本项目使用 `keep_vars` 保留控制台的非密钥变量；显式写入 Wrangler 配置的同名值优先。
- EdgeOne：设置同名运行时变量，填写 JSON 数组字符串；分别检查生产与预览配置。

## 发布检查

发布前运行 `pnpm run validate`；确认平台入口、`dist` 静态资源目录、环境变量和目标项目一致。发布后检查首页、`/api/health`、镜像架构查询和下载。真实平台的大文件传输、限额及网络表现需在对应部署中验证，本地检查不能替代。
