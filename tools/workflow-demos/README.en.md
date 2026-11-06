# Workflow Demos

[简体中文](README.md) · **English**

Workflow Demos creates DockerBoost’s side-by-side workflow animations. Each scenario shows the traditional workflow and the DockerBoost workflow in Simplified Chinese and English. The project uses Remotion, React, SVG, and CSS to render silent, looping GIFs for the two main READMEs on GitHub.

## Scenarios

| Scenario | GIF filename prefix | Traditional workflow | DockerBoost |
| --- | --- | --- | --- |
| `offline` · Offline install | `offline-docker-install` | Download Docker and Compose separately, check the architecture, and configure the service | Download one offline bundle and follow the included instructions |
| `browser` · Offline image transfer | `offline-image-transfer` | Pull the image on a connected Docker host, then export it with `docker save` | Download and verify image layers in the browser, then build the TAR |
| `share` · Team handoff | `image-queue-sharing` | The sender exports and uploads archives, then the teammate downloads them | Share a queue link so the teammate can download when needed |
| `batch` · Compose batch export | `compose-batch-export` | Find each image manually, then pull and save it | Import Compose and copy one command to export the images in parallel |

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

## Export GIFs

Run `pnpm run render` in the project directory to export all 16 GIFs. You can also name the compositions to update.

```sh
pnpm run render offline-traditional-zh offline-boost-zh offline-traditional-en offline-boost-en
```

Exported filenames follow `<scene-slug>-<traditional|our>-<zh|en>.gif`. For example, the composition `offline-boost-zh` exports as `offline-docker-install-our-zh.gif`.

Each clip has three stages and runs for 8.5 seconds at 20 fps on a 768 × 432 canvas. Exports are scaled to 672 × 378 and compressed with a shared palette. The script builds and renders in a temporary directory and writes the GIFs to the [documentation assets directory](../../docs/assets/workflow-demos/) once every selected render succeeds. The GIFs are versioned with the repository, and each main README embeds the clips in its language. This project has its own dependencies and lockfile for on-demand installation and rendering.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/index.ts`, `src/root.tsx` | Register Remotion compositions and arrange the header, stage, captions, and loop |
| `src/story.ts` | Scenario numbers, names, and bilingual captions for each stage |
| `src/offline.tsx`, `src/handoff.tsx` | Draw the offline install, browser export, team handoff, and batch export scenes |
| `src/graphics.tsx`, `src/stage.css` | Shared SVG icons, panels, tags, terminal lines, and stage styles |
| `src/motion.ts` | Canvas dimensions, frame rate, stage timing, and easing |
| `render.mjs`, `remotion.config.ts` | Select compositions, run the renderer, compress, and export GIFs |

Offline install, image transfer, and batch export dissolve between stages while a file, image layer, or terminal icon arcs into the next shot. Queue sharing moves a link or archive along a single track as the sender and teammate panels update.

The transitions and scene composition draw on [Remotion Transitions](https://www.remotion.dev/docs/transitions/), [Remotion Components](https://www.remotion.dev/docs/components), and the [Code Hike template](https://www.remotion.dev/templates/code-hike).

## Update workflow

Check the current product behavior, then update the corresponding scene and copy. Review both languages and both workflows for the scenario in Studio, run the type check, and export the affected compositions. Review every scenario if shared styles, timing, or export settings change. When changing a composition ID, update the Studio registration and export mapping. When changing a GIF filename, update the links in both main READMEs.
