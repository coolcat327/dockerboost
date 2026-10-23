# 系统架构与模块边界

本文维护系统模块边界；按任务阅读见 [文档导航](README.md)。项目概览、目录、启动、验证与部署见 [README](../README.md)，仓库级约束见 [AGENTS.md](../AGENTS.md)。

## 模块边界与实现约定

- 前端入口 app.js 管理页面初始化、语言和标签切换；功能入口通过 features/index.js 注册。专属实现和样式留在功能目录，页面共用样式放 styles，保持 styles/index.css 的级联顺序。
- 后端入口只创建 Hono 应用、挂载子路由、处理全局错误与未命中回退。业务目录的 index.ts 只注册并导出具名子路由；业务不互相引用，不反向引用入口，common 不依赖 routes。
- 前后端确实共用的纯逻辑放 src/shared/；仅一侧复用的能力留在对应 common，不为未来可能复用提前建模块。
- 保持导入、构建入口、缓存规则、测试与文档引用一致。专属实现避免使用缺少领域含义的 download/script 等泛用文件名。
- 不手工修改或提交 dist/、node_modules/、.wrangler/；不提交密钥、令牌、.env* 或 .dev.vars*。这些是构建产物、依赖、本地运行状态或敏感配置。
