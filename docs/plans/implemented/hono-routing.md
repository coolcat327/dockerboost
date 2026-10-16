# Hono 路由与业务目录迁移

状态：已实现，本地验证通过（2026-10-16），未部署。基于 main，仅引入 Hono 与路由组织，包含 SHA/TAR 依赖替换，不包含分块下载或断点续传。

## 结构与接入

- src/api/index.ts 创建 Hono 应用、挂载业务子路由、统一错误与 API 404/ASSETS 回退。
- routes 下统一 install、images、download、registry、share、status 业务目录，各 index.ts 注册并导出具名路由，处理函数和专属依赖留在目录内。
- install 原分发函数拆到 handlers.ts，download 原处理函数移到 terminal.ts；其他平铺路由移入对应业务目录并调整导入。
- common/types.ts 提供 ApiEnv，common/http.ts 提供 GET 方法适配。业务不互相引用，common 不引用业务，根入口只引用业务 index。

## 契约与迁移

保持 main 的 URL、参数、响应、下载行为与缓存策略。GET API 的 HEAD 及其他非 GET 方法保持 405 和 Allow: GET；停用 save 保持全方法 410；Registry 全方法透传原始 Request 和响应流；未知 API 保持 JSON 404，其他路径回退 ASSETS。保留尾斜杠区分。

调用链从 Worker 手动路径分支改为 Hono 根应用 → 业务 index → 原生 Request/Response 处理函数，下载与缓存生命周期不变。先迁移模块和注册适配，再接通根入口，最后迁移测试与规范；不需要客户端数据迁移。

## 验证计划

npm ci 和 npm run validate；覆盖全部 GET API 方法守卫、未知路径、410、Registry HEAD/上传流与错误映射。静态架构检查接入 check 与 CI；新增接口规范见开发参考。

## SHA/TAR 依赖替换

安装包增量 SHA-256 改用 @noble/hashes 2.4.0，经 client/common/sha256.js 薄适配；TAR 编码交给 modern-tar 0.8.6，原 archive-format.js 保留业务条目和流式写入、取消及提交适配。镜像下载仍使用 main 的整层调度；不迁入新的分块、任务记录和恢复协议。验证包含哈希向量、TAR 兼容性与打包取消。

## 验证结果

npm ci --ignore-scripts 与 npm run validate 通过：TypeScript、路由依赖边界检查、97 项测试及构建均成功。文档本地链接及 git diff --check 通过。未部署、未进行真实 Docker 导入和线上上游验证。
