import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/client/features/pull/index.js', import.meta.url).pathname],
  bundle: true, format: 'esm', write: false,
  plugins: [{ name: 'pull-fixtures', setup(builder) {
    builder.onResolve({ filter: /(?:image-selection|pull\/batch)\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onResolve({ filter: /^\.\/batch\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.includes('image-selection')
      ? 'export const createImageSelection = options => globalThis.pullTestSelection(options);'
      : 'export const initBatchPull = () => ({ setLanguage() {} });' }));
  } }],
});

test('pull command only enables copying a resolved command and preserves status across languages', async t => {
  const nodes = new Map();
  const node = () => ({ textContent: '', disabled: false, addEventListener() {} });
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); } };
  let options, platform = '', platformUnsupported = false, input = 'nginx';
  const previous = globalThis.pullTestSelection;
  t.after(() => { if (previous === undefined) delete globalThis.pullTestSelection; else globalThis.pullTestSelection = previous; });
  globalThis.pullTestSelection = value => {
    options = value;
    return { init() { options.onReset(); }, current: () => ({ image: input, platform, platformUnsupported }), resolve: () => ({ accelerated: 'proxy/nginx', original: 'nginx' }), onPlatformChange() {}, setLanguage() {} };
  };
  const { feature } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
  let lang = { waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', failedPlatforms: 'Failed', noPlatforms: 'None' };
  const instance = feature.init({ panel, locale: () => lang, messages: () => ({}), flash() {}, selectionStore: {} });
  const copy = panel.querySelector('[data-copy="pull-all-command"]'), command = panel.querySelector('#pull-all-command');
  assert.equal(copy.disabled, true); assert.equal(command.textContent, 'Waiting');
  options.onLoading();
  lang = { waitingPlatforms: '等待', loadingPlatforms: '加载中', failedPlatforms: '查询失败', noPlatforms: '无架构' };
  instance.setLanguage(feature.messages['zh-CN']);
  assert.equal(command.textContent, '加载中'); assert.equal(copy.disabled, true);
  options.onError(new Error('offline')); assert.equal(command.textContent, '查询失败'); assert.equal(copy.disabled, true);
  lang = { waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', failedPlatforms: 'Failed', noPlatforms: 'None' };
  instance.setLanguage(feature.messages.en); assert.equal(command.textContent, 'Failed');
  lang = { waitingPlatforms: '等待', loadingPlatforms: '加载中', failedPlatforms: '查询失败', noPlatforms: '无架构', unsupportedPlatforms: '架构不支持' };
  options.onReady(); assert.equal(command.textContent, '无架构'); assert.equal(copy.disabled, true);
  platformUnsupported = true; options.onReady(); assert.equal(command.textContent, '架构不支持'); assert.equal(copy.disabled, true);
  platformUnsupported = false;
  platform = 'linux/amd64'; options.onReady();
  assert.match(command.textContent, /docker pull --platform 'linux\/amd64'/); assert.equal(copy.disabled, false);
  input = ''; options.onReset(); assert.equal(copy.disabled, true);
});
