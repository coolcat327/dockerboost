import { createTarPacker } from 'modern-tar';
import { localImageTag, splitImageReference } from '../../../common/image-syntax.js';

const encoder = new TextEncoder();
const text = (value) => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value));
export function digestHex(digest) {
  if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('不支持或无效的 blob digest（需要 sha256）。');
  return digest.slice(7);
}

async function sha256(data) {
  const value = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(value), (part) => part.toString(16).padStart(2, '0')).join('');
}

export async function archiveEntries(manifest, repository, reference, repoTag, originalManifestBytes) {
  const manifestBytes = originalManifestBytes || text(manifest);
  const manifestDigest = await sha256(manifestBytes);
  const configPath = `blobs/sha256/${digestHex(manifest.config.digest)}`;
  const layerPaths = manifest.layers.map((item) => `blobs/sha256/${digestHex(item.digest)}`);
  // OCI imports bypass Docker's RepoTags normalization. Match Docker Hub's
  // canonical name so containerd can resolve the image again during docker run.
  const tag = localImageTag(repoTag);
  // An index digest may resolve to a platform-specific manifest with a different digest.
  const displayName = tag || `${repoTag.slice(0, repoTag.indexOf('@'))}@sha256:${manifestDigest}`;
  const firstComponent = displayName.split('/')[0];
  const qualified = displayName.includes('/') && (/[.:]/.test(firstComponent) || firstComponent === 'localhost');
  const imageName = qualified ? displayName : `docker.io/${displayName.includes('/') ? '' : 'library/'}${displayName}`;
  const tagName = tag ? splitImageReference(tag)?.reference || reference : null;
  const annotations = { 'io.containerd.image.name': imageName, ...(tagName ? { 'org.opencontainers.image.ref.name': tagName } : {}) };
  return [
    ['oci-layout', text('{"imageLayoutVersion":"1.0.0"}')],
    ['index.json', text({ schemaVersion: 2, manifests: [{ mediaType: manifest.mediaType, digest: `sha256:${manifestDigest}`, size: manifestBytes.byteLength, annotations }] })],
    ['manifest.json', text([{ Config: configPath, RepoTags: tag ? [tag] : [], Layers: layerPaths }])],
    ['repositories', text(tagName ? { [repository]: { [tagName]: digestHex(manifest.config.digest) } } : {})],
    [`blobs/sha256/${manifestDigest}`, manifestBytes]
  ];
}

// The library owns TAR headers, PAX records, padding and end markers.
// The caller still owns the OPFS writable's close/abort transaction.
export async function writeArchive(writable, entries, { signal } = {}) {
  signal?.throwIfAborted();
  const { readable, controller } = createTarPacker();
  const consume = readable.pipeTo(new WritableStream({
    async write(chunk) {
      signal?.throwIfAborted();
      await writable.write(chunk);
      signal?.throwIfAborted();
    }
  }), { signal });
  const produce = (async () => {
    try {
      for (const [name, data] of entries) {
        signal?.throwIfAborted();
        const body = controller.add({ name, size: data.size ?? data.byteLength, type: 'file', mode: 0o644 });
        if (data.stream) await data.stream().pipeTo(body, { signal });
        else {
          const writer = body.getWriter();
          try { await writer.write(data); await writer.close(); }
          finally { writer.releaseLock(); }
        }
      }
      controller.finalize();
    } catch (error) { controller.error(error); throw error; }
  })();
  // Observe both immediately and wait for production to stop before OPFS cleanup.
  const results = await Promise.allSettled([consume, produce]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}
