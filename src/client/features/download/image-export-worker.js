import { downloadRequestUrl } from '../../common/download-cache-policy.js';
import { writeOpfsFile, writeOpfsStream } from '../../common/opfs-file-writer.js';
import { downloadDirectory } from '../../common/browser-download-task.js';
import { Sha256 } from '../../common/sha256.js';
import { archiveEntries, digestHex, writeArchive } from './archive-format.js';

const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json';

self.addEventListener('message', (event) => {
  exportImage(event.data).then((result) => self.postMessage({ ok: true, result })).catch((error) => self.postMessage({ ok: false, error: error.message, code: error.code, retryable: error.retryable !== false }));
});

function platformError(message) { return Object.assign(new Error(message), { code: 'PLATFORM_CHANGED', retryable: false }); }

async function root() { return navigator.storage.getDirectory(); }
async function directory(base, parts, create = true) { let current = base; for (const part of parts) current = await current.getDirectoryHandle(part, { create }); return current; }
async function file(base, parts, create = true) { const dir = await directory(base, parts.slice(0, -1), create); return dir.getFileHandle(parts.at(-1), { create }); }
async function removeDirectory(base, name) { await base.removeEntry(name, { recursive: true }).catch(() => {}); }
async function fetchManifest(url, version) { const response = await fetch(downloadRequestUrl(url, version), { headers: { Accept: accept } }); if (!response.ok) throw new Error(`镜像仓库返回 ${response.status}`); const bytes = new Uint8Array(await response.arrayBuffer()); return { manifest: JSON.parse(new TextDecoder().decode(bytes)), bytes }; }
async function verifyManifest(bytes, digest) {
  const match = typeof digest === 'string' && /^(sha256|sha384|sha512):([a-f0-9]+)$/.exec(digest);
  const algorithms = { sha256: ['SHA-256', 64], sha384: ['SHA-384', 96], sha512: ['SHA-512', 128] };
  if (!match || match[2].length !== algorithms[match[1]][1]) throw new Error('不支持或无效的镜像清单 digest。');
  const hash = await crypto.subtle.digest(algorithms[match[1]][0], bytes);
  const actual = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== match[2]) throw new Error('镜像清单 digest 校验失败，请重试。');
}
function selectPlatform(items, platform) {
  const [os, architecture, variant] = platform.split('/');
  const matching = items.filter(item => item.platform?.os === os && item.platform?.architecture === architecture);
  return matching.find(item => (item.platform?.variant || undefined) === variant) || (!variant ? matching[0] : undefined);
}
async function exportImage({ repository, reference, repoTag, source, platform, filename, version, sessionId }) {
  if (!navigator.storage?.getDirectory) throw new Error('此浏览器不支持本地大文件下载，请复制终端命令下载。');
  if (!sessionId || !/^image-[a-zA-Z0-9-]+$/.test(sessionId)) throw new Error('下载任务无效');
  const base = await root();
  const job = await directory(base, [downloadDirectory, sessionId], false);
  // Each download owns a temporary session; the UI removes it after save handoff.
  await removeDirectory(job, 'export');
  self.postMessage({ phase: 'resolve' });
  const sourceQuery = source ? `?source=${encodeURIComponent(source)}` : '';
  let { manifest, bytes: manifestBytes } = await fetchManifest(`/v2/${repository}/manifests/${encodeURIComponent(reference)}${sourceQuery}`, version);
  if (repoTag.includes('@')) await verifyManifest(manifestBytes, reference);
  let selectedPlatform;
  if (Array.isArray(manifest.manifests)) { const selected = selectPlatform(manifest.manifests, platform); if (!selected) throw platformError(`未找到 ${platform} 架构，请重新解析。`); selectedPlatform = selected.platform; ({ manifest, bytes: manifestBytes } = await fetchManifest(`/v2/${repository}/manifests/${selected.digest}${sourceQuery}`, version)); await verifyManifest(manifestBytes, selected.digest); }
  if (!manifest.config || !Array.isArray(manifest.layers)) throw new Error('该镜像不是可导出的 OCI 镜像。');
  const blobs = new Map();
  for (const descriptor of [manifest.config, ...manifest.layers]) {
    if (!descriptor || !Number.isSafeInteger(descriptor.size) || descriptor.size < 0) throw new Error('blob 描述符的大小无效。');
    digestHex(descriptor.digest);
    const existing = blobs.get(descriptor.digest);
    if (existing && Number(existing.size) !== Number(descriptor.size)) throw new Error('相同 digest 的 blob 描述符大小不一致。');
    if (!existing) blobs.set(descriptor.digest, descriptor);
  }
  const descriptors = [...blobs.values()];
  const total = descriptors.reduce((sum, item) => sum + Number(item.size || 0), 0);
  if (!Number.isSafeInteger(total)) throw new Error('blob 总大小超出支持范围。');
  let completed = 0;
  const download = async (descriptor, index, progressBytes) => {
    const blobPath = ['blobs', 'sha256', digestHex(descriptor.digest)];
    const response = await fetch(downloadRequestUrl(`/v2/${repository}/blobs/${descriptor.digest}${sourceQuery}`, version));
    if (!response.ok) throw new Error(`下载 layer 失败 (${response.status})`);
    const handle = await file(job, blobPath);
    const hash = new Sha256();
    try {
      await writeOpfsStream(handle, response.body, { onChunk: (chunk, received) => {
        if (received > Number(descriptor.size)) throw new Error('镜像层大小不匹配，已停止下载。');
        hash.update(chunk);
        progressBytes[index] = received;
        self.postMessage({ phase: 'download', completed: completed + progressBytes.reduce((sum, value) => sum + value, 0), total });
      }, onComplete: received => {
        if (received !== Number(descriptor.size)) throw new Error('镜像层下载不完整，请重试。');
        if (hash.hex() !== digestHex(descriptor.digest)) throw new Error('blob digest 校验失败，请重试。');
      } });
    } catch (error) {
      await directory(job, blobPath.slice(0, -1), false).then((parent) => parent.removeEntry(blobPath.at(-1))).catch(() => {});
      throw error;
    }
    progressBytes[index] = descriptor.size;
  };
  await download(descriptors[0], 0, [0]);
  completed += descriptors[0].size;
  let config;
  try { config = JSON.parse(await (await (await file(job, ['blobs', 'sha256', digestHex(manifest.config.digest)], false)).getFile()).text()); }
  catch { throw new Error('无法读取镜像架构配置，请重新解析。'); }
  const [os, architecture, variant] = platform.split('/');
  const expectedVariant = selectedPlatform?.variant || variant;
  if (!config || config.os !== os || config.architecture !== architecture
    || (expectedVariant && config.variant && config.variant !== expectedVariant)
    || (!selectedPlatform && expectedVariant && config.variant !== expectedVariant)) {
    throw platformError(`镜像架构与 ${platform} 不匹配，请重新解析。`);
  }
  for (let start = 1; start < descriptors.length; start += 5) {
    const batch = descriptors.slice(start, start + 5);
    const progressBytes = batch.map(() => 0);
    await Promise.all(batch.map((descriptor, offset) => download(descriptor, offset, progressBytes)));
    completed += batch.reduce((sum, descriptor) => sum + Number(descriptor.size || 0), 0);
  }
  const entries = await archiveEntries(manifest, repository, reference, repoTag, manifestBytes);
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
