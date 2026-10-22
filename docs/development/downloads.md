# 下载任务与缓存

本文维护浏览器下载的本地生命周期、暂存、发布隔离和归档能力。接口路径与 HTTP 缓存有效期统一见 [接口参考](api.md)，页面构建接入见 [前端开发](frontend.md)。

## 任务生命周期

安装包与镜像的浏览器下载共用 `src/client/common/browser-download-task.js`，没有固定文件大小上限，受浏览器存储配额与磁盘空间限制。下载完成后本地打包，再自动触发保存。

| 类型 | 策略 |
| --- | --- |
| HTTP 缓存 | 网络响应的复用与有效期由响应头决定，具体接口策略见 [接口参考](api.md)；浏览器负责存储和回收 |
| OPFS 暂存 | 每次任务在 `dockerboost-downloads/<类型>-<任务ID>/` 创建独立目录；失败或停止后清理，触发保存后保留 60 秒再释放文件引用并清理 |
| 遗留目录 | 页面初始化、刷新安装版本、新下载前清理；兼容旧安装目录和旧镜像会话目录，支持 Web Locks 时跳过其他标签页正在使用的任务 |

浏览器无法通知网页文件已保存完毕，60 秒为保存交接缓冲。关闭页面可能中断定时清理，遗留目录由下次访问清理。OPFS 不保留长期复用缓存，重复下载加速依赖 HTTP 缓存。

## 发布标识与请求隔离

构建按源码、静态资源及配置内容生成 8 位 URL 安全字符的发布标识，直接注入页面 JS 与下载 Worker，同时作为 JS、CSS、图标与 Hero 的统一文件名后缀；不再生成或请求 version.json。安装文件和镜像请求直接携带内嵌的 `version` 参数。同版本按对应 HTTP 缓存策略复用响应，新版本使用不同地址，不再复用旧版下载响应；旧 HTTP 缓存由浏览器回收，OPFS 仍按任务清理。相同源码重复部署保持相同标识。

## 哈希与归档实现

浏览器镜像归档同时包含 OCI 索引与 Docker manifest.json。OCI 描述符的 `io.containerd.image.name` 使用完整 Docker Hub 名称（例如 `docker.io/library/redis:latest`），`org.opencontainers.image.ref.name` 保存标签。containerd 优先读取 OCI 索引，不能依赖 manifest.json 的 RepoTags 修正短名称，否则可能出现导入成功但运行时找不到本地镜像的问题。

安装包增量 SHA-256 使用 @noble/hashes，经 src/client/common/sha256.js 适配。TAR 头、PAX 与填充由 modern-tar 编码，archive-format.js 负责业务条目、流式读写和取消；公共 OPFS writer 负责 close/abort。生产与消费均停止后才允许清理暂存。

## 接入下载功能

新增下载功能使用 `createDownloadTask(kind)` 获取 `id` 和 `directory`，下载与打包完成后调用 `save(archive, filename)`，在 finally 调用 `finish()`。使用后台 Worker 时，将任务 ID 传给 Worker；失败或停止后先终止 Worker，再结束任务。功能模块不自行维护目录命名、锁和清理定时器。文件写入共用 `opfs-file-writer.js`：流式下载使用 `writeOpfsStream`，打包使用 `writeOpfsFile`；公共函数负责关闭、异常中止和读取流释放，校验与进度由功能回调提供。

## 下载状态与进度展示

安装包与镜像下载复用 `src/client/common/download-progress.js` 和 `src/client/styles/download-progress.css`。展示模块接收现有任务的阶段、累计字节和总字节，管理文案、速率采样、ARIA 进度属性、文件详情及布局，不管理请求、取消、OPFS 或保存生命周期。

- `start(name)` 清除旧任务的速度和进度；`update({ phase, completed, total, name })` 更新阶段。准备、解析、打包和保存交接为不定进度；未知总大小的下载显示已接收字节，不提供百分比或 `aria-valuenow`。
- 下载阶段使用真实累计字节 / 总字节百分比，文字和进度条一致。达到 100% 仅代表下载字节收齐，随后显示独立的本地打包阶段，不再使用固定 90% / 95% 模拟整体进度。
- Worker 的 `done` 仅表示归档已就绪，展示映射为保存交接。调用 `task.save()` 成功后才调用 `complete({ filename, size })`，显示“已交给浏览器保存”、归档大小与从任务启动到交接的总耗时。浏览器不提供最终磁盘保存完成通知。
- 速度只用于下载阶段；打包与交接不沿用旧速度。完成摘要不再把归档大小除以包含打包的总耗时称为下载均速。
- `fail(error, cancelled)` 统一失败和停止展示，隐藏进度并停止其动画。`info(message)` 用于版本就绪、镜像详情等非下载状态；`clear()` 隐藏状态区，两者均清除旧任务指标。
- `setLanguage(language)` 根据保留的状态重新渲染阶段、指标和耗时，不重置任务。原始异常诊断保留其来源文本。
- 常规字节更新合并到最多每 100ms 一次渲染；阶段、文件、总大小变化与最终字节事件立即展示。文件名单行显示，最大宽度为可用宽度与 72ch 中的较小值，超出部分使用省略号，悬停可查看完整内容；错误信息仍允许换行，不缩小字号；中英文和减少动态效果使用同一套公共规则。
