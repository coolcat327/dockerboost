# 文档索引

先读根目录 [AGENTS.md](../AGENTS.md) 的约束；项目概览、启动和部署见 [README.md](../README.md)。以下内容按任务查阅，无需全部加载。

| 修改或查询范围 | 文档 | 内容边界 |
| --- | --- | --- |
| 模块定位、MCP 配置、新增标签 | [开发参考](development.md) | 文件职责、接入与扩展步骤 |
| API、Registry、镜像源配置 | [接口参考](api.md) | 当前方法、参数、响应、缓存和限制 |
| 下载、OPFS、发布隔离 | [下载任务与缓存](downloads.md) | 当前机制与下载功能接入方法 |
| 页面视觉与交互 | [视觉规范](design/visual-style.md) | 当前设计规则与验收要求 |
| 设计任务的推进 | [设计与实现流程](design/workflow.md) | 选型、实施、验收和归档 |
| React Bits 选型追溯 | [选型依据](design/react-bits.md) | 来源与取舍，非必读规范 |

## 计划

- `plans/pending/`：当前待实现方案；暂无计划文件，按任务需要创建。
- `plans/implemented/`：交付记录，包括 [炭灰视觉与工具区反馈](plans/implemented/visual-refinement.md) 和 [Bits 视觉细节增强](plans/implemented/bits-polish.md)。仅在追溯该项工作时读取。

## 维护方式

同一规则只在所属文档维护，其他位置链接引用；README 保持概览，专题文档解释细节。计划记录范围、结果和未完成项，不重复维护现行规范，也不自动成为后续任务。源码参数、完整文件列表和测试用例以实现为准，文档不逐项抄录。
