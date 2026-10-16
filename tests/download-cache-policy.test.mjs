import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVersion, downloadRequestUrl } from '../src/client/common/download-cache-policy.js';

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

test('download URLs use the embedded build version without a version lookup', t => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('version selection must not fetch'); });
  const url = new URL(downloadRequestUrl('/api/install/plan?docker=28.1.1'), 'https://example.com');
  assert.equal(url.searchParams.get('version'), buildVersion);
  assert.equal(url.searchParams.get('docker'), '28.1.1');
});
