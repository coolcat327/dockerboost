import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { encodeQueueShare, restoreQueueShare } from '../src/client/features/download/queue-share.js';

const readable = queue => `#download-batch?v=1&queue=${encodeURIComponent(JSON.stringify(queue))}`;

test('short queue shares preserve explicit variants, digest references and unselected platforms', async () => {
  const entries = [
    { image: 'busybox:latest', platform: 'linux/arm64/v8' },
    { image: 'busybox:latest', platform: 'linux/amd64' },
    { image: `org/image@sha256:${'a'.repeat(64)}`, platform: '' }
  ];
  const hash = await encodeQueueShare(entries);
  assert.match(hash, /^#download-batch\?v=1&queue=/);
  const url = new URL('https://example.com/tools?lang=en'); url.hash = hash;
  assert.deepEqual(await restoreQueueShare(url.hash), entries);
  assert.equal(url.pathname, '/tools');
});

test('large queues use stateless gzip with URL-safe encoding and round-trip in order', async () => {
  const entries = Array.from({ length: 250 }, (_, i) => ({ image: `company/service-${i}:release-2026`, platform: 'linux/arm64/v8' }));
  const hash = await encodeQueueShare(entries);
  assert.match(hash, /^#download-batch\?v=1&gzip=[A-Za-z0-9_-]+$/);
  assert.ok(hash.length < readable(entries.map(e => [e.image, e.platform])).length / 4);
  assert.deepEqual(await restoreQueueShare(hash), entries);
});

test('duplicate entries collapse without merging different platforms', async () => {
  assert.deepEqual(await restoreQueueShare(readable([
    ['nginx:latest', 'linux/amd64'], ['nginx:latest', 'linux/arm64/v8'], ['nginx:latest', 'linux/amd64']
  ])), [{ image: 'nginx:latest', platform: 'linux/amd64' }, { image: 'nginx:latest', platform: 'linux/arm64/v8' }]);
});

test('invalid or unsupported shares are rejected before any entries can be applied', async () => {
  assert.equal(await restoreQueueShare('#download?image=nginx'), null);
  for (const queue of [[], {}, [['nginx']], [['nginx', 'linux/arm64/v8/extra']], [['nginx', 64]], [['nginx', ''], ['bad;curl', '']], [['nginx', '', 'extra']], [['x'.repeat(513), '']]]) {
    await assert.rejects(restoreQueueShare(readable(queue)), /SHARE_INVALID/);
  }
  for (const hash of ['#download-batch?v=2&queue=[]', '#download-batch?v=1&queue=[]&gzip=abc', '#download-batch?v=1&queue=[]&queue=[]', '#download-batch?v=1&v=1&queue=[]', '#download-batch?v=1&gzip=not+base64', '#download-batch?v=1&gzip=AAAA']) {
    await assert.rejects(restoreQueueShare(hash));
  }
  await assert.rejects(encodeQueueShare([]), /SHARE_INVALID/);
});

test('fragment and decompressed payload limits reject oversized input', async () => {
  await assert.rejects(restoreQueueShare('#download-batch?' + 'x'.repeat(65536)), /SHARE_TOO_LARGE/);
  const bomb = gzipSync(' '.repeat(1024 * 1024 + 1)).toString('base64url');
  await assert.rejects(restoreQueueShare(`#download-batch?v=1&gzip=${bomb}`), /SHARE_TOO_LARGE/);
  await assert.rejects(restoreQueueShare(readable(Array.from({ length: 1001 }, (_, i) => [`image${i}`, '']))), /SHARE_TOO_LARGE/);
  const huge = Array.from({ length: 2200 }, (_, i) => ({ image: `repo${i}/` + 'x'.repeat(490), platform: 'linux/amd64' }));
  await assert.rejects(encodeQueueShare(huge), /SHARE_TOO_LARGE/);
});

test('browsers without compression keep readable links and enforce the URL limit', async t => {
  const previous = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  t.after(() => { globalThis.CompressionStream = previous; });
  const entries = Array.from({ length: 60 }, (_, i) => ({ image: `org/image-${i}`, platform: 'linux/amd64' }));
  const hash = await encodeQueueShare(entries);
  assert.match(hash, /&queue=/);
  assert.deepEqual(await restoreQueueShare(hash), entries);
  await assert.rejects(encodeQueueShare(Array.from({ length: 400 }, (_, i) => ({ image: `repo${i}/` + 'x'.repeat(220), platform: '' }))), /SHARE_TOO_LARGE/);
});

test('a compressed share reports missing decompression support explicitly', async t => {
  const previous = globalThis.DecompressionStream;
  globalThis.DecompressionStream = undefined;
  t.after(() => { globalThis.DecompressionStream = previous; });
  await assert.rejects(restoreQueueShare('#download-batch?v=1&gzip=AAAA'), /SHARE_UNSUPPORTED/);
});
