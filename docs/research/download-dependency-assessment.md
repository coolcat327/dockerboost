# SHA-256 与 TAR 依赖选型

日期：2026-10-16。状态：已采用 @noble/hashes 2.4.0 与 modern-tar 0.8.6。本分支只替换算法和格式编码，不调整网络下载调度及 OPFS 生命周期。

## 增量 SHA-256

浏览器 Web Crypto digest 需要完整 BufferSource，不提供增量 update 接口；大文件保持流式处理，不能为计算哈希一次性读入内存。安装包增量哈希使用 @noble/hashes，经 src/client/common/sha256.js 保留 Sha256.update(bytes).hex() 适配。小型归档元数据仍用原生 crypto.subtle.digest，构建脚本继续使用 Node createHash。

选择 @noble/hashes 是因为同步增量接口和纯 JavaScript 构建便于适配现有代码，不需要异步 WASM 初始化。验证使用 Node createHash 对照标准向量、分块边界和独立实例；不承诺未经测量的性能提升。

参考：[Web Crypto digest 规范](https://www.w3.org/TR/webcrypto/#SubtleCrypto-method-digest)、[@noble/hashes 官方说明](https://github.com/paulmillr/noble-hashes#readme)。

## TAR

modern-tar 基于 Web Streams，通过 createTarPacker 提供逐条目写入和背压，处理 USTAR/PAX、填充及结束标记。archive-format.js 保留 OCI/Docker 元数据与 writeArchive 接口；OPFS writable 的 close/abort 继续由公共 writer 管理。

生产和消费并行启动以避免背压挂起；出现写入错误、源流错误或取消时，等待双方停止再清理。测试覆盖系统 tar 互操作、长路径与中文名称、取消、数据截断和写入失败。未进行真实 Docker 导入或线上性能验证。

参考：[modern-tar 官方说明](https://github.com/ayuhito/modern-tar#readme)。
