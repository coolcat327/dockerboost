# React Bits 选型依据

本文件仅用于追溯视觉选型；当前约束见 [视觉规范](../design/visual-style.md)，接入配置见 [开发工具](../development/tooling.md)。

## 来源与取舍

| 参考 | 项目中的取舍 |
| --- | --- |
| [Dark Veil](https://reactbits.dev/backgrounds/dark-veil) / [Silk](https://reactbits.dev/backgrounds/silk) | 借鉴低频光幕与材质层次，采用统一 CSS 背景，未引入 WebGL |
| [Noise](https://reactbits.dev/animations/noise) | 使用静态细颗粒，避免持续闪烁 |
| [SpotlightCard](https://reactbits.dev/components/spotlight-card) | 借鉴隔离柔光层，增加静态键盘高亮，保持工具内容清晰 |

2026-10-15 通过 shadcn MCP 搜索 `SpotlightCard`，读取 `@react-bits/SpotlightCard-JS-CSS` 详情和完整示例。项目保留原生 JavaScript 与 CSS，自行实现上述视觉思路，没有复制 React 组件或引入 React。此次选型不包含真实设备性能结论。

后续通过 MCP 读取 `@react-bits/BorderGlow-JS-CSS` 完整示例，借鉴局部边缘光，以现有指针坐标与 CSS 遮罩实现蓝银描边。按钮扫光为项目自有 CSS 装饰。实现与验证边界见 [交付记录](../plans/implemented/bits-polish.md)。

后续采用组件时记录准确名称、来源和取舍；直接复制源码前核对所选版本的依赖与许可。官方接入说明：[React Bits MCP](https://reactbits.dev/get-started/mcp)。
