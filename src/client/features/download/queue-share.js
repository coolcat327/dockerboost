import { queueSharePrefix } from '../../common/share-link.js';
const maxPayloadBytes = 1024 * 1024;
const maxFragmentLength = 64 * 1024;
const maxQueueEntries = 1000;
const platformPattern = /^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/;

function validateQueue(queue) {
  if (!Array.isArray(queue) || !queue.length) throw new Error('SHARE_INVALID');
  if (queue.length > maxQueueEntries) throw new Error('SHARE_TOO_LARGE');
  const seen = new Set(), entries = [];
  for (const item of queue) {
    if (!Array.isArray(item) || item.length !== 2) throw new Error('SHARE_INVALID');
    const [image, platform] = item;
    if (typeof image !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/@:-]{0,511}$/.test(image)
      || typeof platform !== 'string' || platform.length > 128 || (platform && !platformPattern.test(platform))) throw new Error('SHARE_INVALID');
    const key = JSON.stringify(item);
    if (!seen.has(key)) { seen.add(key); entries.push({ image, platform }); }
  }
  return entries;
}

function base64url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function readPayload(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxPayloadBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('SHARE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function encodeQueueShare(entries) {
  const queue = validateQueue(entries.map(({ image, platform = '' }) => [image, platform]));
  const json = JSON.stringify(queue.map(({ image, platform }) => [image, platform]));
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > maxPayloadBytes) throw new Error('SHARE_TOO_LARGE');
  let fragment = `${queueSharePrefix}v=1&queue=${encodeURIComponent(json)}`;
  if (fragment.length > 2048 && typeof CompressionStream !== 'undefined') {
    const compressed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const shorter = `${queueSharePrefix}v=1&gzip=${base64url(compressed)}`;
    if (shorter.length < fragment.length) fragment = shorter;
  }
  if (fragment.length > maxFragmentLength) throw new Error('SHARE_TOO_LARGE');
  return fragment;
}

export async function restoreQueueShare(hash) {
  if (!hash.startsWith(queueSharePrefix)) return null;
  if (hash.length > maxFragmentLength) throw new Error('SHARE_TOO_LARGE');
  const params = new URLSearchParams(hash.slice(queueSharePrefix.length));
  if (params.getAll('v').length !== 1 || params.get('v') !== '1'
    || params.has('queue') === params.has('gzip') || params.getAll('queue').length > 1 || params.getAll('gzip').length > 1) throw new Error('SHARE_INVALID');
  let json;
  if (params.has('queue')) {
    json = params.get('queue');
    if (new TextEncoder().encode(json).byteLength > maxPayloadBytes) throw new Error('SHARE_TOO_LARGE');
  } else {
    if (typeof DecompressionStream === 'undefined') throw new Error('SHARE_UNSUPPORTED');
    const value = params.get('gzip');
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('SHARE_INVALID');
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    const compressed = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    json = await readPayload(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')));
  }
  return validateQueue(JSON.parse(json));
}
