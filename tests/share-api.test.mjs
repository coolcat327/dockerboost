import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { restoreSharedState } from '../src/client/common/share-link.js';

const { outputFiles } = await build({ entryPoints: ['src/api/index.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const env = { ASSETS: { fetch: async () => new Response('static page') } };
const request = (query, options) => worker.fetch(new Request(`https://example.com/api/share?${query}`, options), env);

test('share endpoint returns a readable same-origin link that restores the selection', async () => {
  const response = await request('tab=download&image=ghcr.io%2Fteam%2Fapp%3Atag&source=auto&platform=linux%2Farm64%2Fv8');
  assert.equal(response.status, 200);
  const { url } = await response.json();
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://example.com');
  assert.equal(parsed.pathname, '/');
  assert.equal(parsed.hash, '#download?image=ghcr.io/team/app:tag&source=auto&platform=linux/arm64/v8');
  assert.deepEqual(restoreSharedState(parsed.hash), {
    tab: 'download', image: 'ghcr.io/team/app:tag', source: 'auto', platform: 'linux/arm64/v8'
  });

  const emptyPlatform = await request('tab=pull&image=registry.example%2Fteam%2Fapp&source=auto&platform=');
  assert.deepEqual(restoreSharedState(new URL((await emptyPlatform.json()).url).hash), {
    tab: 'pull', image: 'registry.example/team/app', source: 'auto', platform: ''
  });
});

test('share endpoint rejects invalid arguments and non-GET methods', async () => {
  for (const query of [
    'tab=inspect&image=nginx&source=auto&platform=',
    'tab=pull&image=&source=auto&platform=',
    `tab=pull&image=${'x'.repeat(513)}&source=auto&platform=`,
    'tab=pull&image=nginx&source=&platform=',
    'tab=pull&image=nginx&source=auto%2Fextra&platform=',
    'tab=pull&image=nginx&source=auto&platform=linux',
    'tab=pull&image=nginx&source=auto&platform=linux%2Farm64%2Fv8%2Fextra'
  ]) assert.equal((await request(query)).status, 400, query);

  const response = await request('tab=pull&image=nginx&source=auto&platform=', { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});
