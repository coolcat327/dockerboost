# React Bits 选型依据

本文件仅用于追溯视觉选型；当前约束见 [视觉规范](../ui.md)，接入配置见 [开发工具](../development.md)。

## 来源与取舍

| 参考 | 项目中的取舍 |
| --- | --- |
| [Dark Veil](https://reactbits.dev/backgrounds/dark-veil) / [Silk](https://reactbits.dev/backgrounds/silk) | 借鉴低频光幕与材质层次，采用统一 CSS 背景，未引入 WebGL |
| [Noise](https://reactbits.dev/animations/noise) | 使用静态细颗粒，避免持续闪烁 |
| [SpotlightCard](https://reactbits.dev/components/spotlight-card) | 借鉴隔离柔光层，增加静态键盘高亮，保持工具内容清晰 |

2026-10-15 通过 shadcn MCP 搜索 `SpotlightCard`，读取 `@react-bits/SpotlightCard-JS-CSS` 详情和完整示例。项目保留原生 JavaScript 与 CSS，自行实现上述视觉思路，没有复制 React 组件或引入 React。此次选型不包含真实设备性能结论。

后续通过 MCP 读取 `@react-bits/BorderGlow-JS-CSS` 完整示例，借鉴局部边缘光，以现有指针坐标与 CSS 遮罩实现蓝银描边。按钮扫光为项目自有 CSS 装饰。实现与验证边界见 [交付记录](../archive/plans/bits-polish.md)。

后续采用组件时记录准确名称、来源和取舍；直接复制源码前核对所选版本的依赖与许可。官方接入说明：[React Bits MCP](https://reactbits.dev/get-started/mcp)。

2026-10-22 通过 shadcn MCP 搜索并读取 `@react-bits/StarBorder-JS-CSS` 完整示例（[StarBorder](https://reactbits.dev/animations/star-border)）。其实现依赖 React hooks、Canvas 与逐帧绘制。本次采用按钮边缘高光的视觉思路，以现有 CSS 内描边、单次扫光和短暂按压实现；没有复制组件源码或增加依赖，避免为按钮装饰增加持续渲染。

2026-10-23 通过 shadcn MCP 搜索并读取 `@react-bits/AnimatedList-JS-CSS` 完整示例（[AnimatedList](https://reactbits.dev/components/animated-list)）。该示例依赖 React 与 Hugeicons，并包含滚动观察和弹簧动画。本次仅参考列表层次与入场方向，下载队列采用原生 CSS 单次 transform / opacity 动画，复用项目变量，不复制源码或引入依赖；减少动态效果时关闭动画。

2026-10-23 为下载队列通过 shadcn MCP 搜索 Table 并读取 `@shadcn/table-demo`、`@shadcn/data-table-demo`；同时查阅 [shadcn Table](https://ui.shadcn.com/docs/components/base/table)、[Data Table](https://ui.shadcn.com/docs/components/base/data-table) 和 [Tabulator 响应式布局](https://www.tabulator.info/docs/6.x/layout/)。shadcn 示例基于 React，Data Table 还使用 TanStack Table、Lucide 及表格交互控件；Tabulator 提供按宽度折叠列到行下方的布局。本项目仅需要任务状态与控制，借鉴表头层次、列间留白及窄屏内容下移思路，用现有 CSS 容器查询实现，不复制组件源码或添加依赖。
