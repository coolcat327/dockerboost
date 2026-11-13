# Workflow Demos

[简体中文](README.md) · **English**

Workflow Demos creates DockerBoost’s side-by-side workflow animations. An architecture animation covers deployment and download data flow; four comparison scenarios show the traditional workflow and the DockerBoost workflow in Simplified Chinese and English. The project uses Remotion, React, SVG, and CSS to render silent, looping GIFs for the two main READMEs on GitHub.

## Scenarios

| Scenario | GIF filename prefix | Traditional workflow | DockerBoost |
| --- | --- | --- | --- |
| `offline` · Offline install | `offline-docker-install` | Download Docker and Compose separately, check the architecture, and configure the service | Download one offline bundle and follow the included instructions |
| `browser` · Offline image transfer | `offline-image-transfer` | Pull the image on a connected Docker host, then export it with `docker save` | Download and verify image layers in the browser, then build the TAR |
| `share` · Team handoff | `image-queue-sharing` | The sender exports and uploads archives, then the teammate downloads them | Share a queue link so the teammate can download when needed |
| `batch` · Compose batch export | `compose-batch-export` | Find each image manually, then pull and save it | Import Compose and copy one command to export the images in parallel |

The `architecture` scenario has only a DockerBoost workflow (`architecture-boost-zh` / `architecture-boost-en`), exported as `project-architecture-our-<zh|en>.gif` and placed after the main README introduction. It uses one continuous, fixed system diagram showing the user device, page, two alternative edge platforms, shared API, upstream Registry, and target host. User selection and download, page loading, metadata and blob requests, streaming responses, local TAR assembly, and the user copying and importing the archive follow fixed routes without scene cuts. Blue marks actions and requests; green marks image data and archives. Active nodes highlight, data reception and local packing have separate progress bars, and a TAR token follows the copy route once packing finishes. Importing on the target requires Docker; downloading does not.

The clips simplify the interface. Use the [scenario-to-workflow mapping](../../docs/architecture.md#主站与流程演示) to find the relevant product implementation and documentation for actual behavior and requirements.

## Local preview

Use **Node.js 22 or later** and **pnpm 12.14.0**. Run these commands from the DockerBoost repository root.

```sh
cd tools/workflow-demos
pnpm install --frozen-lockfile
pnpm run check
pnpm run studio
```

Open the Studio URL printed in the terminal and select a composition by scenario. A composition ID combines the scenario, workflow, and language as `<scene>-<traditional|boost>-<zh|en>`, for example `offline-boost-zh`. The first render may need internet access to download Chrome Headless Shell. Previewing and exporting the Chinese clips requires a Simplified Chinese font such as PingFang SC or Noto Sans CJK SC.

Once dependencies are installed, start a preview manually from the repository root with:

```sh
cd tools/workflow-demos
pnpm run studio
```

Keep the terminal running and open the printed URL (usually `http://localhost:3000`; use the actual URL if that port is busy). In the left sidebar, open the `architecture` folder and select `architecture-boost-zh` or `architecture-boost-en` to preview the Chinese or English architecture animation. Studio supports playback, pause, timeline scrubbing, and frame-by-frame inspection without exporting a GIF first.

Edit and save [`src/architecture.tsx`](src/architecture.tsx) to adjust the architecture animation's visuals, copy, and motion, or [`src/architecture.css`](src/architecture.css) for its dedicated styles. Studio refreshes automatically. See the project structure below for other scene sources. Export the GIF using the next section once the preview looks right; press `Ctrl+C` in the server terminal to stop previewing.

## Export GIFs

Run `pnpm run render` in the project directory to export all 18 GIFs. You can also name the compositions to update.

```sh
pnpm run render offline-traditional-zh offline-boost-zh offline-traditional-en offline-boost-en
```

If the automatic browser download fails, set `REMOTION_BROWSER_EXECUTABLE` to a local Chrome / Chromium executable, for example on macOS:

```sh
REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm run render architecture-boost-zh architecture-boost-en
```

Exported filenames follow `<scene-slug>-<traditional|our>-<zh|en>.gif`. For example, the composition `offline-boost-zh` exports as `offline-docker-install-our-zh.gif`.

Comparison clips have three stages at 20 fps on a 768 × 432 canvas, run for 8.5 seconds, and export at 672 × 378. The architecture animation uses one continuous shot at 20 fps on a 960 × 600 canvas, runs for 20 seconds, and exports at 840 × 525. Both use shared-palette compression. The script builds and renders in a temporary directory and writes the GIFs to the [documentation assets directory](../../docs/assets/workflow-demos/) once every selected render succeeds. The GIFs are versioned with the repository, and each main README embeds the clips in its language. This project has its own dependencies and lockfile for on-demand installation and rendering.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/index.ts`, `src/root.tsx` | Register Remotion compositions and arrange the header, stage, captions, and loop |
| `src/architecture.tsx`, `src/architecture.css` | Project architecture and download data flow, bilingual captions, and dedicated styles |
| `src/story.ts` | Scenario numbers, names, and bilingual captions for each stage |
| `src/offline.tsx`, `src/handoff.tsx` | Draw the offline install, browser export, team handoff, and batch export scenes |
| `src/graphics.tsx`, `src/stage.css` | Shared SVG icons, panels, tags, terminal lines, and stage styles |
| `src/motion.ts` | Canvas dimensions, frame rate, stage timing, and easing |
| `render.mjs`, `remotion.config.ts` | Select compositions, run the renderer, compress, and export GIFs |

Offline install, image transfer, and batch export dissolve between stages while a file, image layer, or terminal icon arcs into the next shot. Queue sharing moves a link or archive along a single track as the sender and teammate panels update.

The transitions and scene composition draw on [Remotion Transitions](https://www.remotion.dev/docs/transitions/), [Remotion Components](https://www.remotion.dev/docs/components), and the [Code Hike template](https://www.remotion.dev/templates/code-hike).

## Update workflow

Check the current product behavior, then update the corresponding scene and copy. Review both languages and both workflows for the scenario in Studio, run the type check, and export the affected compositions. Review every scenario if shared styles, timing, or export settings change. When changing a composition ID, update the Studio registration and export mapping. When changing a GIF filename, update the links in both main READMEs.
