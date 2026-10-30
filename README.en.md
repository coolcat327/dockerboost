<div align="center">

<a href="https://docker.coolcat.win/"><img src="docs/assets/github-ocean-header.svg" width="100%" alt="The DockerBoost whale surfing across ocean waves" /></a>

[简体中文](README.md) · **English**

**Install Docker. Pull images. Take them offline. All in one place.**

[Live demo](https://docker.coolcat.win/) · [Quick start](#local-development) · [Deploy your own](#deployment) · [Documentation](docs/README.md)

</div>

DockerBoost is a lightweight Docker toolkit for Cloudflare Workers and EdgeOne Pages. Generate installation commands, configure registry mirrors, build pull commands, and prepare offline archives. The server streams files while the browser or terminal assembles TAR archives locally. Downloading images requires no Docker installation.

## What you can do

| Feature | Usage |
| --- | --- |
| Install Docker | Generate online installation commands or download an offline bundle containing Docker, Compose, configuration, and install/uninstall scripts |
| Configure registry mirrors | Generate configuration, backup, and recovery commands |
| Pull images | Enter an image name, paste a `docker pull` command, or import Compose / image lists to generate pull and tagging commands for a selected architecture |
| Download images | Export individual TAR archives in the browser or copy terminal download commands; batch mode supports per-image selection, cancellation, retry, and removal, with up to 5 concurrent image downloads by default |
| Share selections | Share one image selection or a complete download queue; recipients automatically resolve queued images without starting downloads |

Pull and Download share single-image selections. Choose an image source automatically or manually; batch queues select sources automatically and allow bulk or per-image architecture choices. Expand Compose variables and multiple files with `docker compose config` first; `build` is not executed.

Select an image and architecture on a connected machine, download the archive, then transfer and import it on the destination machine:

```sh
docker load -i nginx_latest_linux_amd64.tar
```

## Requirements and limitations

- **Public images**: automatic selection queries configured sources concurrently in batches and uses the first successful response. Uncached images may be unavailable; upstream authentication, rate limits, and network restrictions still apply.
- **Browser downloads**: require OPFS support and sufficient disk space. Archives are assembled locally after downloading; the browser may ask you to allow multiple file downloads.
- **Terminal downloads**: require sh, curl, jq, tar, and common shell tools; offline installation bundles also require sha256sum. Docker and Skopeo are unnecessary. Scripts clean up temporary files on normal exit, failure, or catchable interruption.
- **Offline installation**: supports fresh installations on Linux with systemd and dependencies such as iptables/ip6tables. Select an architecture and Docker version, paired with the latest stable Compose release. Installation records, backups, and locks stay beside the scripts; uninstall handles recorded installations and does not adopt existing or manual installations. Follow the bundled `readme.md`. Online installation uses LinuxMirrors scripts.
- **Configuration and releases**: restart Docker after applying mirror settings; use the settings interface for Docker Desktop. After a site update, older pages or copied versioned download commands may stop working; refresh and copy them again.

## Local development

Use **Node.js 22 or newer** and **pnpm 12.14.0**. From the project root, run:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open the URL printed in your terminal. Wrangler builds and watches changes automatically. Run the complete checks with:

```sh
pnpm run validate
```

See [Local development and tools](docs/development.md) for prerequisites, debugging entry points, and individual checks. Read [AGENTS.md](AGENTS.md) before contributing.

## Project structure

| Location | Purpose |
| --- | --- |
| `src/client/` | Vanilla JavaScript page, four feature tabs, shared capabilities, and styles |
| `src/api/` | Hono APIs, streaming Registry proxy, and platform adapters |
| `edge-functions/` | Thin EdgeOne file route entries |
| `public/`, `scripts/` | Static resources, build tooling, and architecture checks |
| `tests/` | API, script, archive, and frontend logic regression tests |
| `docs/` | Development guides, API and mechanism specifications, decisions, and historical records |

See [System architecture](docs/architecture.md) for detailed directory responsibilities and dependency directions. Public page settings and default image sources live in `config.js`; deployment settings live in `wrangler.jsonc` and `edgeone.json`.

## Deployment

### Cloudflare Workers

Set the Worker name in `wrangler.jsonc` and page settings in `config.js`. After installing dependencies, run:

```sh
pnpm exec wrangler login
pnpm run deploy
```

### EdgeOne development and deployment

After installing dependencies, sign in, link the project, and deploy:

```sh
pnpm exec edgeone login
pnpm exec edgeone makers link
pnpm run deploy:edgeone
```

Deployment commands build the complete project automatically. EdgeOne scripts explicitly use `--area overseas`; do not upload only the static `dist/` directory. GitHub Actions is also supported: pull requests run validation, pushes to main validate and deploy, and manual runs select a branch and platform to update the corresponding production site.

See [Platform development and deployment](docs/deployment.md) for authentication, Actions credentials, preview deployments, EdgeOne local development, and runtime variables.

## Documentation

Use the [Documentation index](docs/README.md) to find the right topic. Development and deployment guides own procedures; architecture, API, download, and visual specifications each own their respective rules. Pending plans, decisions, and historical records are kept separately. Detailed guides are currently in Chinese.
