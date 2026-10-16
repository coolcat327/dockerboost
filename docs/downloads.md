# 下载任务与缓存

安装包与镜像的浏览器下载共用 `src/client/common/browser-download-task.js`，没有固定文件大小上限，受浏览器存储配额与磁盘空间限制。下载完成后本地打包，再自动触发保存。

| 类型 | 策略 |
| --- | --- |
| HTTP 缓存 | 安装二进制和成功的 sha256 镜像 blob 允许缓存一天；镜像 blob 使用私有缓存，并尊重上游 no-store/no-cache。到期需要重新验证，实际回收由浏览器管理 |
| OPFS 暂存 | 每次任务在 `dockerboost-downloads/<类型>-<任务ID>/` 创建独立目录；失败或停止后清理，触发保存后保留 60 秒再释放文件引用并清理 |
| 遗留目录 | 页面初始化、刷新安装版本、新下载前清理；兼容旧安装目录和旧镜像会话目录，支持 Web Locks 时跳过其他标签页正在使用的任务 |

浏览器无法通知网页文件已保存完毕，60 秒为保存交接缓冲。关闭页面可能中断定时清理，遗留目录由下次访问清理。OPFS 不保留长期复用缓存，重复下载加速依赖 HTTP 缓存。构建按源码、静态资源及配置内容生成 8 位 URL 安全字符的发布标识，直接注入页面 JS 与下载 Worker，同时作为 JS、CSS、图标与 Hero 的统一文件名后缀；不再生成或请求 version.json。安装文件和镜像请求直接携带内嵌的 `version` 参数。同版本可复用一天缓存，新版本使用不同地址，不再复用旧版下载响应；旧 HTTP 缓存由浏览器回收，OPFS 仍按任务清理。相同源码重复部署保持相同标识。

新增下载功能使用 `createDownloadTask(kind)` 获取 `id` 和 `directory`，下载与打包完成后调用 `save(archive, filename)`，在 finally 调用 `finish()`。使用后台 Worker 时，将任务 ID 传给 Worker；失败或停止后先终止 Worker，再结束任务。功能模块不自行维护目录命名、锁和清理定时器。文件写入共用 `opfs-file-writer.js`：流式下载使用 `writeOpfsStream`，打包使用 `writeOpfsFile`；公共函数负责关闭、异常中止和读取流释放，校验与进度由功能回调提供。

## 哈希与归档实现

安装包增量 SHA-256 使用 @noble/hashes，经 src/client/common/sha256.js 适配。TAR 头、PAX 与填充由 modern-tar 编码，archive-format.js 负责业务条目、流式读写和取消；公共 OPFS writer 负责 close/abort。生产与消费均停止后才允许清理暂存。
