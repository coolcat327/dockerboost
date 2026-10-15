import test from 'node:test';
import assert from 'node:assert/strict';
import { currentDownloadVersion, downloadRequestUrl } from '../src/client/common/download-cache-policy.js';

test('download cache keys differ by version and preserve source and selected versions', () => {
  const path = '/v2/library/nginx/blobs/sha256:abc?source=mirror-gcr';
  const previous = downloadRequestUrl(path, 'Abcd123_');
  const current = downloadRequestUrl(path, 'Efgh456-');
  assert.notEqual(previous, current);
  assert.equal(new URL(current, 'https://example.com').searchParams.get('source'), 'mirror-gcr');
  const install = downloadRequestUrl('/api/install/asset?docker=29.9.0&kind=docker&version=old', 'new');
  assert.equal(new URL(install, 'https://example.com').searchParams.getAll('version').length, 1);
  assert.match(install, /docker=29.9.0/);
});

test('open pages read the live version without caching before each download', async t => {
  let version = 'Abcd123_';
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/version.json');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal, controller.signal);
    return Response.json({ version: version });
  });
  assert.equal(await currentDownloadVersion({ signal: controller.signal }), version);
  version = 'Efgh456-';
  assert.equal(await currentDownloadVersion({ signal: controller.signal }), version);
});

test('invalid deployment metadata fails rather than reusing old cache keys', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ version: 'old' }));
  await assert.rejects(currentDownloadVersion(), /版本信息无效/);
});
