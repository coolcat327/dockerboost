import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreSharedState } from '../src/client/common/share-link.js';

const hashFor = (state) => `#${state.tab}?image=${encodeURIComponent(state.image)}&source=${encodeURIComponent(state.source)}&platform=${encodeURIComponent(state.platform)}`;

test('readable shared hash restores tab, image, source, and platform', () => {
  const state = { tab: 'download', image: '团队/nginx:测试', source: 'mirror-gcr', platform: 'linux/arm64/v8' };
  assert.deepEqual(restoreSharedState(hashFor(state)), state);
  assert.deepEqual(restoreSharedState('#download?image=nginx&source=auto&platform=linux/amd64'), {
    tab: 'download', image: 'nginx', source: 'auto', platform: 'linux/amd64'
  });
});

test('share restore state accepts encoded docker input and platform values only within API bounds', () => {
  const state = { tab: 'pull', image: 'docker pull nginx:latest', source: 'custom-1', platform: 'linux/arm64/v8' };
  assert.deepEqual(restoreSharedState(hashFor(state)), state);
  assert.equal(restoreSharedState(hashFor({ ...state, platform: 'x'.repeat(129) })), null);
});

test('invalid or oversized shared state is ignored', () => {
  assert.equal(restoreSharedState(''), null);
  assert.equal(restoreSharedState('#share=%7Bbad'), null);
  assert.equal(restoreSharedState(hashFor({ tab: 'setup', image: 'nginx', source: 'mirror-gcr', platform: '' })), null);
  assert.equal(restoreSharedState(hashFor({ tab: 'pull', image: 'x'.repeat(513), source: 'mirror-gcr', platform: '' })), null);
  assert.equal(restoreSharedState(hashFor({ tab: 'pull', image: 'nginx:latest', source: 'bad source', platform: '' })), null);
  assert.equal(restoreSharedState(hashFor({ tab: 'pull', image: 'nginx:latest', source: 'auto', platform: 'linux/arm64/bad/extra' })), null);
});

test('shared clipboard helper reports a successful copy to both share entry points', async t => {
  const { copyLink } = await import('../src/client/common/share-link.js');
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  let copied;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(value) { copied = value; } } });
  t.after(() => { if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor); else delete navigator.clipboard; });
  assert.equal(await copyLink('https://example.com/#download-batch?v=1', () => ({})), true);
  assert.equal(copied, 'https://example.com/#download-batch?v=1');
});
