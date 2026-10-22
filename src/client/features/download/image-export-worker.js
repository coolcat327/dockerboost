import { downloadRequestUrl } from '../../common/download-cache-policy.js';
import { writeOpfsFile, writeOpfsStream } from '../../common/opfs-file-writer.js';
import { downloadDirectory } from '../../common/browser-download-task.js';
import { archiveEntries, digestHex, writeArchive } from './archive-format.js';

const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json';

self.addEventListener('message', (event) => {
  exportImage(event.data).then((result) => self.postMessage({ ok: true, result })).catch((error) => self.postMessage({ ok: false, error: error.message }));
});

async function root() { return navigator.storage.getDirectory(); }
async function directory(base, parts, create = true) { let current = base; for (const part of parts) current = await current.getDirectoryHandle(part, { create }); return current; }
async function file(base, parts, create = true) { const dir = await directory(base, parts.slice(0, -1), create); return dir.getFileHandle(parts.at(-1), { create }); }
async function removeDirectory(base, name) { await base.removeEntry(name, { recursive: true }).catch(() => {}); }
async function fetchJson(url, version) { const response = await fetch(downloadRequestUrl(url, version), { headers: { Accept: accept } }); if (!response.ok) throw new Error(`镜像仓库返回 ${response.status}`); return response.json(); }
function platformMatch(item, platform) { const [os, architecture, variant] = platform.split('/'); return item.platform?.os === os && item.platform?.architecture === architecture && (!variant || item.platform?.variant === variant); }
async function exportImage({ repository, reference, repoTag, source, platform, filename, version, sessionId }) {
  if (!navigator.storage?.getDirectory) throw new Error('此浏览器不支持本地大文件下载，请复制终端命令下载。');
  if (!sessionId || !/^image-[a-zA-Z0-9-]+$/.test(sessionId)) throw new Error('下载任务无效');
  const base = await root();
  const job = await directory(base, [downloadDirectory, sessionId], false);
  // Each download owns a temporary session; the UI removes it after save handoff.
  await removeDirectory(job, 'export');
  self.postMessage({ phase: 'resolve' });
  const sourceQuery = source ? `?source=${encodeURIComponent(source)}` : '';
  let manifest = await fetchJson(`/v2/${repository}/manifests/${encodeURIComponent(reference)}${sourceQuery}`, version);
  if (Array.isArray(manifest.manifests)) { const selected = manifest.manifests.find((item) => platformMatch(item, platform)); if (!selected) throw new Error(`未找到 ${platform} 架构`); manifest = await fetchJson(`/v2/${repository}/manifests/${selected.digest}${sourceQuery}`, version); }
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
        self.postMessage({ phase: 'download', completed: completed + progressBytes.reduce((sum, value) => sum + value, 0), total });
        return;
      }
      await directory(job, blobPath.slice(0, -1), false).then((parent) => parent.removeEntry(blobPath.at(-1))).catch(() => {});
    } catch {}
    const response = await fetch(downloadRequestUrl(`/v2/${repository}/blobs/${descriptor.digest}${sourceQuery}`, version));
    if (!response.ok) throw new Error(`下载 layer 失败 (${response.status})`);
    const handle = await file(job, blobPath);
    try {
      await writeOpfsStream(handle, response.body, { onChunk: (chunk, received) => {
        if (received > Number(descriptor.size)) throw new Error('镜像层大小不匹配，已停止下载。');
        progressBytes[index] = received;
        self.postMessage({ phase: 'download', completed: completed + progressBytes.reduce((sum, value) => sum + value, 0), total });
      }, onComplete: received => {
        if (received !== Number(descriptor.size)) throw new Error('镜像层下载不完整，请重试。');
      } });
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
  self.postMessage({ phase: 'export' });
  const output = await file(job, ['export', filename]);
  await writeOpfsFile(output, writable => writeArchive(writable, entries));
  const archive = await output.getFile();
  self.postMessage({ phase: 'done', completed: archive.size, total: archive.size });
  return { archive, filename };
}
