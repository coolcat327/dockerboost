// Keep an open page on its own release; missing assets require a refresh.
export async function resolveImageExportWorker(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !/(?:java|ecma)script/i.test(type)) {
    await response.body?.cancel();
    throw new Error('下载组件已更新，请刷新页面后重试。');
  }
  const source = await response.text();
  signal?.throwIfAborted();
  if (source.trimStart().startsWith('<')) throw new Error('下载组件已更新，请刷新页面后重试。');
  return url;
}

export function runExport(worker, payload, onProgress, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onMessageError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (callback, value) => { cleanup(); callback(value); };
    const onMessage = ({ data }) => {
      if (data?.ok === true) finish(resolve, data.result);
      else if (data?.ok === false) finish(reject, new Error(data.error || '浏览器下载失败。'));
      else if (data?.phase) onProgress(data);
    };
    const onError = (event) => finish(reject, new Error(event.message || '浏览器下载任务启动失败。'));
    const onMessageError = () => finish(reject, new Error('无法接收下载结果。'));
    const onAbort = () => finish(reject, new DOMException('下载已停止。', 'AbortError'));
    if (signal?.aborted) { onAbort(); return; }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onMessageError);
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.postMessage(payload);
  });
}
