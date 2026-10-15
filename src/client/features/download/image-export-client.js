// Open tabs can outlive a deployment that removes their hashed worker asset.
export async function resolveImageExportWorker(url, { signal } = {}) {
  const isScript = async (path, cache = 'default') => {
    const response = await fetch(path, { signal, cache });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !/(?:java|ecma)script/i.test(type)) {
      await response.body?.cancel();
      return false;
    }
    const source = await response.text();
    signal?.throwIfAborted();
    return !source.trimStart().startsWith('<');
  };
  if (await isScript(url)) return url;
  const page = await fetch('/', { signal, cache: 'no-store' });
  if (!page.ok) throw new Error('下载组件加载失败，请刷新页面后重试。');
  const html = new DOMParser().parseFromString(await page.text(), 'text/html');
  const current = html.querySelector('meta[name="image-export-worker"]')?.content;
  // Only accept a root-relative worker asset from our own page.
  if (!current || !/^\/image-export-worker(?:-[a-z0-9]+)?\.js$/i.test(current) || !await isScript(current, 'reload')) {
    throw new Error('下载组件已更新，请刷新页面后重试。');
  }
  return current;
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
