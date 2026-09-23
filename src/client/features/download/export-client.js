export function runExport(worker, payload, onProgress) {
  return new Promise((resolve, reject) => {
    worker.addEventListener('message', ({ data }) => {
      if (data?.ok === true) resolve(data.result);
      else if (data?.ok === false) reject(new Error(data.error || '浏览器下载失败。'));
      else if (data?.phase) onProgress(data);
    });
    worker.addEventListener('error', (event) => reject(new Error(event.message || '浏览器下载任务启动失败。')));
    worker.addEventListener('messageerror', () => reject(new Error('无法接收下载结果。')));
    worker.postMessage(payload);
  });
}
