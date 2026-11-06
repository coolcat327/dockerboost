# Workflow Demos

**简体中文** · [English](README.en.md)

Workflow Demos 是 DockerBoost 的流程对比动画工程。每个场景并排展示传统操作和 DockerBoost 的操作流程，提供简体中文与英文版本。工程使用 Remotion、React、SVG 和 CSS 生成无声循环 GIF，供 GitHub 上的两份主 README 直接展示。

## 演示场景

| 场景 | GIF 文件名前缀 | 传统流程 | DockerBoost |
| --- | --- | --- | --- |
| `offline` · 离线安装 | `offline-docker-install` | 分别下载 Docker 和 Compose，核对架构并配置服务 | 下载一份离线包，按包内说明安装 |
| `browser` · 镜像带到内网 | `offline-image-transfer` | 在联网 Docker 主机拉取镜像，再用 `docker save` 导出 | 在浏览器下载并校验镜像层，生成 TAR |
| `share` · 团队分享 | `image-queue-sharing` | 发送方导出并上传归档，队友再下载 | 发送队列链接，队友打开后按需下载 |
| `batch` · Compose 批量归档 | `compose-batch-export` | 逐项找出镜像，重复拉取和保存 | 导入 Compose，复制一条命令并发导出 |

界面为流程演示做了简化。核对实际操作与使用条件时，按[场景与主站流程的对应表](../../docs/architecture.md#主站与流程演示)查阅主站实现和对应文档。

## 本地预览

使用 **Node.js 22 或更新版本**和 **pnpm 12.14.0**。从 DockerBoost 仓库根目录执行：

```sh
cd tools/workflow-demos
pnpm install --frozen-lockfile
pnpm run check
pnpm run studio
```

打开终端输出的 Studio 地址，按场景选择合成。合成 ID 由场景、流程和语言组成，格式为 `<scene>-<traditional|boost>-<zh|en>`，例如 `offline-boost-zh`。首次渲染可能需要联网下载 Chrome Headless Shell。预览和导出中文版本时，系统需要安装简体中文字体，例如 PingFang SC 或 Noto Sans CJK SC。

## 导出 GIF

在工程目录运行 `pnpm run render` 导出全部 16 个 GIF，也可指定需要更新的合成：

```sh
pnpm run render offline-traditional-zh offline-boost-zh offline-traditional-en offline-boost-en
```

导出的文件名采用 `<scene-slug>-<traditional|our>-<zh|en>.gif`。例如，合成 `offline-boost-zh` 导出为 `offline-docker-install-our-zh.gif`。

每条动画有三个阶段，画布为 768 × 432、20 fps、8.5 秒。导出时缩放到 672 × 378，并使用共享色板压缩。脚本在临时目录构建和渲染，全部选中项成功后才将 GIF 写入[文档素材目录](../../docs/assets/workflow-demos/)。GIF 随仓库版本管理，两份主 README 各引用对应语言的版本。工程有独立的依赖和锁文件，可按需安装与渲染。

## 项目结构

| 位置 | 职责 |
| --- | --- |
| `src/index.ts`、`src/root.tsx` | 注册 Remotion 合成，编排标题、画面、字幕与循环 |
| `src/story.ts` | 场景编号、名称和中英文分幕字幕 |
| `src/offline.tsx`、`src/handoff.tsx` | 绘制离线安装、浏览器归档、团队分享与批量归档画面 |
| `src/graphics.tsx`、`src/stage.css` | 公用 SVG 图标、面板、标签、终端行及画面样式 |
| `src/motion.ts` | 画布、帧率、分幕和缓动参数 |
| `render.mjs`、`remotion.config.ts` | 选择合成、调用渲染、压缩与导出 GIF |

离线安装、镜像转移和批量归档在幕间淡入淡出，由文件、镜像层或终端图标沿弧线衔接前后画面。队列分享通过同一条轨道传递链接或归档，并切换两侧面板的内容。

转场与画面编排参考 [Remotion Transitions](https://www.remotion.dev/docs/transitions/)、[Remotion Components](https://www.remotion.dev/docs/components) 和 [Code Hike 模板](https://www.remotion.dev/templates/code-hike)。

## 更新流程

先确认主站当前行为，再更新对应场景的画面和文案。用 Studio 检查同场景的两种语言与两条流程，运行类型检查并重导受影响的合成。若修改共用样式、时间轴或导出参数，检查全部场景。变更合成 ID 时，同步 Studio 注册与导出映射。变更 GIF 文件名时，同步两份主 README 的链接。
