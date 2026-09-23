const encoder = new TextEncoder();
const text = (value) => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value));
export const digestHex = (digest) => String(digest).replace(/^sha256:/, '');

async function sha256(data) {
  const value = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(value), (part) => part.toString(16).padStart(2, '0')).join('');
}

export async function archiveEntries(manifest, repository, reference, repoTag) {
  const manifestBytes = text(manifest);
  const manifestDigest = await sha256(manifestBytes);
  const configPath = `blobs/sha256/${digestHex(manifest.config.digest)}`;
  const layerPaths = manifest.layers.map((item) => `blobs/sha256/${digestHex(item.digest)}`);
  return [
    ['oci-layout', text('{"imageLayoutVersion":"1.0.0"}')],
    ['index.json', text({ schemaVersion: 2, manifests: [{ mediaType: manifest.mediaType, digest: `sha256:${manifestDigest}`, size: manifestBytes.byteLength, annotations: { 'org.opencontainers.image.ref.name': repoTag } }] })],
    ['manifest.json', text([{ Config: configPath, RepoTags: [repoTag], Layers: layerPaths }])],
    ['repositories', text({ [repository]: { [reference]: digestHex(manifest.config.digest) } })],
    [`blobs/sha256/${manifestDigest}`, manifestBytes]
  ];
}

function tarHeader(name, size) {
  const output = new Uint8Array(512);
  const put = (offset, length, value) => output.set(encoder.encode(String(value).slice(0, length)), offset);
  const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\0';
  put(0, 100, name);
  put(100, 8, octal(0o644, 8));
  put(108, 8, octal(0, 8));
  put(116, 8, octal(0, 8));
  put(124, 12, octal(size, 12));
  put(136, 12, octal(Math.floor(Date.now() / 1000), 12));
  output.fill(32, 148, 156);
  put(156, 1, '0');
  put(257, 6, 'ustar');
  put(263, 2, '00');
  const checksum = output.reduce((sum, value) => sum + value, 0);
  put(148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
  return output;
}

export async function writeArchive(writable, entries) {
  for (const [name, data] of entries) {
    const size = data.size ?? data.byteLength;
    await writable.write(tarHeader(name, size));
    if (data.stream) {
      const reader = data.stream().getReader();
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          await writable.write(next.value);
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      await writable.write(data);
    }
    await writable.write(new Uint8Array((512 - (size % 512)) % 512));
  }
  await writable.write(new Uint8Array(1024));
}
