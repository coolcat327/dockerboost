<div align="center">

<a href="https://docker.coolcat.win/"><img src="docs/assets/github-title-icon.svg" width="280" alt="The DockerBoost whale surfing across ocean waves" /></a>

# DockerBoost

[简体中文](README.md) · **English**

**Install Docker. Pull images. Take them offline. All in one place.**

A lightweight Docker toolkit for Cloudflare Workers and EdgeOne Pages.
Install Docker, configure registry mirrors, generate pull commands, and download offline archives from a single page.

[Live demo](https://docker.coolcat.win/) · [Quick start](#local-development) · [Deploy your own](#deployment) · [Use cases](#what-you-can-do) · [Documentation](docs/README.md)

</div>

The Download tab offers Single and Batch modes: paste or select Compose YAML, select public images, and download individual TAR archives with five concurrent image tasks, per-image stop/retry controls and select-all, or copy/save a batch download script. Expand variables and multiple files with `docker compose config` first; image builds are not executed.

## Why DockerBoost

- **One place for everyday tasks**: install, configure, pull, and download, with shared image selection to reduce repeated input.
- **Prepare for offline environments**: download Docker, Compose, or image archives on a connected machine and transfer them to the destination.
- **Download images without installing Docker**: export a TAR directly in your browser, or use curl and your local tar utility in a terminal.
- **Deploy a lightweight edge service**: built with Hono for Cloudflare Workers and EdgeOne Edge Functions. The server streams files while the client assembles archives.
- **Choose your image source**: use automatic source selection or specify a source and architecture. Share links restore page selections.

## What you can do

| Your goal | How DockerBoost helps |
| --- | --- |
| Install Docker on a new machine | Generate online installation commands or download an offline bundle with Docker, Compose, configuration, and an installer |
| Configure a registry mirror | Generate configuration commands, back up existing settings, and get recovery commands |
| Pull an image for a specific architecture | Enter an image name or paste a `docker pull` command to generate pull and tagging commands |
| Prepare images for an offline machine | Download a TAR in your browser or terminal, transfer it, and import it with `docker load` |
| Share an image selection with a teammate | Copy a share link that restores the image, source, architecture, and other page parameters |

### Take an image offline in a single archive

Choose an image and architecture on the page, download the archive, then import it on the destination machine:

```sh
docker load -i nginx_latest_linux_amd64.tar
```

Browser downloads stream image layers into OPFS temporary storage and assemble the TAR locally. Terminal downloads use curl, local tar, and common shell tools, without Docker, jq, or Skopeo. Both installation bundles and image downloads support cancellation and temporary file cleanup. See [Download tasks and caching](docs/development/downloads.md) for details.

### Requirements and limitations

- Automatic source selection queries configured sources concurrently in batches ordered by latency and uses the first successful response. Uncached images may be unavailable. DockerBoost does not bypass upstream authentication or rate limits, and access to every image is not guaranteed.
- Browser downloads require OPFS support and sufficient disk space. Network conditions, upstream rate limits, and platform resource limits still apply.
- Online installation uses LinuxMirrors scripts. Offline installation bundles support **fresh Docker installations on Linux with systemd** and require system dependencies such as iptables/ip6tables. Choose a Linux architecture and Docker version; the bundle pairs them with the latest stable Compose release. Extracts into one top-level folder and includes idempotent install/uninstall scripts. Records, configuration backups, and locks stay beside the scripts. Uninstall removes recorded programs and services and saves the current configuration for reuse on reinstall. It does not adopt older or manual installations. Read the included `readme.md` for instructions.
- Preserve other fields in `daemon.json` when applying registry mirror settings, then restart Docker. For Docker Desktop, apply the settings and restart through its settings interface.

## Local development

Use **Node.js 22 or newer** and **pnpm 12.14.0**, pinned in the `packageManager` field of `package.json`. If needed, follow the [pnpm installation instructions](https://pnpm.io/installation) to install that version.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open the local URL printed in your terminal. Wrangler builds and watches frontend code, static assets, and build scripts, and handles server source changes.

```sh
pnpm run check     # TypeScript and API dependency boundary checks
pnpm test          # Regression tests; requires sh, bash, tar, sha256sum, etc.
pnpm run build     # Generate dist
pnpm run validate  # Type checks, tests, and build; also used in CI
```

Edit source files rather than generated files in `dist/`. Before contributing, read [AGENTS.md](AGENTS.md). See the [Development reference](docs/development/README.md) for module integration and dependency boundaries.

## Project structure

| Location | Purpose |
| --- | --- |
| `src/client/index.html` | Page template; the build injects settings and versioned asset paths |
| `src/client/app.js` | Vanilla JavaScript entry point for initialization, language selection, and tabs |
| `src/client/features/` | Page features: install, setup, pull, and download |
| `src/client/common/` | Shared frontend capabilities, including image selection, localization, download tasks, and file writing |
| `src/client/styles/` | Page and shared styles imported by index.css; feature styles live alongside their features |
| `src/api/app.ts` | Shared Hono application, route registration, and error handling |
| `src/api/platforms/` | Cloudflare and EdgeOne adapters |
| `edge-functions/` | EdgeOne file routes for `/api` and `/v2` |
| `src/api/routes/` | install, images, download, registry, share, and status routes, registered by each directory's index.ts |
| `src/api/common/` | Shared source configuration and selection, Registry requests, image parsing, and HTTP adapters |
| `public/` | Static assets and hosting configuration |
| `scripts/` | Build tooling, release identifiers, and architecture checks |
| `tests/` | Regression tests for APIs, installation scripts, archives, and browser downloads |
| `docs/` | Documentation index; topic guides are organized by responsibility |
| `docs/development/` | Frontend and backend integration, API contracts, download implementation, and development tool setup |
| `docs/design/` | Visual guidelines and design workflow |
| `docs/plans/` | Pending work in pending; delivery records in implemented |
| `docs/research/` | Research findings and technology assessments |
| `config.js` | Public page settings and default image sources |
| `wrangler.jsonc`, `edgeone.json` | Platform build and deployment configuration |
| `.github/workflows/` | Continuous validation and deployment |

See the [Development reference](docs/development/README.md) for module integration and dependency boundaries, or browse the [Documentation index](docs/README.md).

## Deployment

### Deploy with GitHub Actions

1. Push the project to your GitHub repository. Set `main` as the default branch for the default manual selection described below.
2. Set the Worker name in `wrangler.jsonc`. Configure page links, author, and default image sources in the root `config.js`. Override the source list with the JSON variable `IMAGE_SOURCES` if needed. See [Image source configuration](docs/development/api.md#镜像源配置) for fields and path rules.
3. Add these repository secrets under **Settings → Secrets and variables → Actions**:

   | Secret | Purpose |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | API token with permission to deploy Workers to the target account |
   | `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account ID |

4. Push the workflow to the default branch, then open **Actions → Validate and deploy DockerBoost** to view runs.

| Trigger | Behavior |
| --- | --- |
| Push to `main` | Run type checks, tests, and build, then deploy if validation succeeds |
| Open or update a pull request | Run validation |
| Manual run | Click **Run workflow**, choose a branch under **Use workflow from**, then validate and deploy that branch |
| Push to another branch | No automatic deployment; select the branch manually to deploy it |

Manual branch selection uses GitHub's built-in workflow interface; see [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow). With `main` as the repository's default branch, the manual selector defaults to `main`. The selected branch must contain the workflow. Validation and deployment use the same commit captured for the run, and the run name includes the branch.

**Manually deploying another branch updates the same live Worker.** It does not create a separate preview site. Deployment jobs share a concurrency group so only one deployment runs at a time. GitHub may replace pending runs, so every trigger is not guaranteed to produce a deployment.

### Deploy locally

Install dependencies and configure `wrangler.jsonc`, then log in to Cloudflare:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm run deploy
```

Deployment builds the project automatically. Open the site URL printed by Wrangler when deployment completes.

### EdgeOne development and deployment

Use the project-pinned CLI. The current CLI uses `makers`; the older `pages` command is deprecated. Existing Cloudflare `dev` and `deploy` commands remain supported, alongside explicit `dev:cloudflare` and `deploy:cloudflare` commands.

Sign in and link the project once:

```sh
pnpm exec edgeone login
pnpm exec edgeone makers link
pnpm run dev:edgeone
```

Choose China or Global according to your account; the account site and acceleration region are separate settings. Do not run init again. The default development URL is `http://localhost:8088`; the CLI combines functions and the frontend server on port 5173. Frontend edits rebuild automatically; refresh the page to see changes. The CLI watches function code. Keep `edgeone.json` devCommand pointing to the frontend server, never to `dev:edgeone` or Wrangler.

```sh
pnpm run validate
pnpm run deploy:edgeone:preview
pnpm run deploy:edgeone
```

Both production and preview deployment scripts explicitly use `--area overseas` (global coverage excluding mainland China). GitHub Actions invokes the same script and uses the same region. When invoking the CLI directly, always include this option, for example `pnpm exec edgeone makers deploy --area overseas`; otherwise, the CLI defaults to `global`, and overseas Registry requests may still be affected by mainland China network restrictions. Choosing China or Global during login does not configure the deployment region.

Deployment builds and uploads the complete project. Do not upload the static-only `dist/` directory directly. CLI deployment to an existing project requires a direct-upload project. Alternatively, import the Git repository in EdgeOne and use the install/build commands and `dist` output configured in `edgeone.json`, selecting an acceleration region excluding mainland China in the platform settings. Avoid enabling both platform Git deployment and Actions deployment for the same project.

To enable EdgeOne in the existing GitHub Actions workflow, set repository **Variable** `EDGEONE_PROJECT_NAME` and **Secret** `EDGEONE_API_TOKEN`. Without the project name, EdgeOne deployment is skipped. Both platforms share validation and deploy the same commit independently, with separate concurrency groups. Manual deployment of another branch also updates the respective production sites.

Configure runtime variable `IMAGE_SOURCES` in EdgeOne as a JSON array string, or leave it unset to use the default sources. Check production and preview configuration separately. Never commit credentials, tokens, or local environment files.

Pages serves frontend assets directly; only `/api` and `/v2` invoke Edge Functions. No Node.js Cloud Functions or server-side archive assembly are used. Before switching production, test overseas Registry access, authentication, Range/HEAD, large image layers, long transfers, and cancellation on an overseas preview deployment. Local tests cannot establish platform transfer quotas or network performance. See [EdgeOne CLI](https://edgeone.cloud.tencent.com/pages/document/162936923278893056) and [Edge Functions](https://pages.edgeone.ai/document/edge-functions).

## Documentation

The detailed documentation is currently in Chinese.

- [Documentation index](docs/README.md): find documentation by task.
- [Development reference](docs/development/README.md): module structure, API integration, and dependency boundaries.
- [API reference](docs/development/api.md): API contracts, Registry behavior, and image source configuration.
- [Download tasks and caching](docs/development/downloads.md): browser and terminal downloads, temporary storage, and cleanup.
- [Visual guidelines](docs/design/visual-style.md): page styling and interaction requirements.
