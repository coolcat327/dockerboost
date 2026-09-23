import { archiveEntries, digestHex, writeArchive } from './archive-format.js';

const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json';

self.addEventListener('message', (event) => {
  exportImage(event.data).then((result) => self.postMessage({ ok: true, result })).catch((error) => self.postMessage({ ok: false, error: error.message }));
});

async function root() { return navigator.storage.getDirectory(); }
async function directory(base, parts, create = true) { let current = base; for (const part of parts) current = await current.getDirectoryHandle(part, { create }); return current; }
async function file(base, parts, create = true) { const dir = await directory(base, parts.slice(0, -1), create); return dir.getFileHandle(parts.at(-1), { create }); }
async function removeDirectory(base, name) { await base.removeEntry(name, { recursive: true }).catch(() => {}); }
async function writeStream(handle, response, progress, expectedSize) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('镜像仓库没有返回数据流。');
  const writable = await handle.createWritable();
  let received = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.byteLength;
      if (received > expectedSize) throw new Error('镜像层大小不匹配，已停止下载。');
      await writable.write(next.value);
      progress(received);
    }
    if (received !== expectedSize) throw new Error('镜像层下载不完整，请重试。');
    await writable.close();
  } catch (error) {
    await reader.cancel().catch(() => {});
    await writable.abort().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
async function fetchJson(url) { const response = await fetch(url, { headers: { Accept: accept } }); if (!response.ok) throw new Error(`镜像仓库返回 ${response.status}`); return response.json(); }
function platformMatch(item, platform) { const [os, architecture, variant] = platform.split('/'); return item.platform?.os === os && item.platform?.architecture === architecture && (!variant || item.platform?.variant === variant); }
async function exportImage({ repository, reference, repoTag, source, platform, filename, sessionId }) {
  if (!navigator.storage?.getDirectory) throw new Error('此浏览器不支持本地大文件下载，请复制终端命令下载。');
  const base = await root(); const cache = await directory(base, ['dockerboost-export', 'sessions'], true);
  const currentSession = sessionId || 'legacy';
  for await (const [name] of cache.entries()) if (name !== currentSession) await cache.removeEntry(name, { recursive: true }).catch(() => {});
  const job = await directory(cache, [currentSession], true); await navigator.storage.persist?.().catch(() => false);
  // Archives are disposable; blob files below remain as a cache for repeat downloads.
  await removeDirectory(job, 'export');
  self.postMessage({ phase: 'resolve', message: '正在解析镜像…' });
  const sourceQuery = source ? `?source=${encodeURIComponent(source)}` : '';
  let manifest = await fetchJson(`/v2/${repository}/manifests/${encodeURIComponent(reference)}${sourceQuery}`);
  if (Array.isArray(manifest.manifests)) { const selected = manifest.manifests.find((item) => platformMatch(item, platform)); if (!selected) throw new Error(`未找到 ${platform} 架构`); manifest = await fetchJson(`/v2/${repository}/manifests/${selected.digest}${sourceQuery}`); }
  if (!manifest.config || !Array.isArray(manifest.layers)) throw new Error('该镜像不是可导出的 OCI 镜像。');
  const descriptors = [manifest.config, ...manifest.layers]; const total = descriptors.reduce((sum, item) => sum + Number(item.size || 0), 0);
  let completed = 0;
  const download = async (descriptor, index, progressBytes) => {
    const blobPath = ['blobs', 'sha256', digestHex(descriptor.digest)];
    try {
      const cached = await file(job, blobPath, false);
      const cachedFile = await cached.getFile();
      if (cachedFile.size === Number(descriptor.size)) {
        progressBytes[index] = Number(descriptor.size);
        self.postMessage({ phase: 'download', completed: completed + progressBytes.reduce((sum, value) => sum + value, 0), total, cached: true });
        return;
      }
      await directory(job, blobPath.slice(0, -1), false).then((parent) => parent.removeEntry(blobPath.at(-1))).catch(() => {});
    } catch {}
    const response = await fetch(`/v2/${repository}/blobs/${descriptor.digest}${sourceQuery}`);
    if (!response.ok) throw new Error(`下载 layer 失败 (${response.status})`);
    const handle = await file(job, blobPath);
    try {
      await writeStream(handle, response, (received) => {
        progressBytes[index] = received;
        self.postMessage({ phase: 'download', completed: completed + progressBytes.reduce((sum, value) => sum + value, 0), total });
      }, descriptor.size);
    } catch (error) {
      await directory(job, blobPath.slice(0, -1), false).then((parent) => parent.removeEntry(blobPath.at(-1))).catch(() => {});
      throw error;
    }
    progressBytes[index] = descriptor.size;
  };
  for (let start = 0; start < descriptors.length; start += 5) {
    const batch = descriptors.slice(start, start + 5);
    const progressBytes = batch.map(() => 0);
    await Promise.all(batch.map((descriptor, offset) => download(descriptor, offset, progressBytes)));
    completed += batch.reduce((sum, descriptor) => sum + Number(descriptor.size || 0), 0);
  }
  const entries = await archiveEntries(manifest, repository, reference, repoTag);
  for (const descriptor of descriptors) {
    entries.push([`blobs/sha256/${digestHex(descriptor.digest)}`, await (await file(job, ['blobs', 'sha256', digestHex(descriptor.digest)], false)).getFile()]);
  }
  self.postMessage({ phase: 'export', message: '正在本地打包镜像…' });
  const output = await file(job, ['export', filename]);
  const writable = await output.createWritable();
  try {
    await writeArchive(writable, entries);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
  const archive = await output.getFile();
  self.postMessage({ phase: 'done', completed: archive.size, total: archive.size });
  return { archive, filename };
}
