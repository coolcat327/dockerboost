import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/client/features/download/index.js', import.meta.url).pathname],
  bundle: true, format: 'esm', write: false,
  plugins: [{ name: 'download-fixtures', setup(builder) {
    builder.onResolve({ filter: /(?:terminal-commands|\/batch|export-archive|browser-download-task|transfer-progress|download-progress|image-reference|image-selection|share-link|download-retry)\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
      const fixtures = {
        'terminal-commands': 'export const batchCommands = entries => { globalThis.downloadTestCommands = entries; return "download command"; };',
        batch: 'export const initBatch = () => ({ setLanguage() {} });',
        'export-archive': 'export const exportArchive = () => {};',
        'browser-download-task': 'export const clearDownloadCaches = async () => {};',
        'transfer-progress': 'export const formatImageMetadata = () => "";',
        'download-progress': 'export const createDownloadProgress = () => globalThis.downloadTestProgress || ({ clear(){}, info(){}, start(){}, fail(){}, setLanguage(){} });',
        'image-reference': 'export const archiveFilename = () => "image.tar";',
        'image-selection': 'export const createImageSelection = options => globalThis.downloadTestSelection(options);',
        'share-link': 'export const shareSelection = () => {};',
        'download-retry': 'export const retryDownload = (...args) => globalThis.downloadTestRetry?.(...args);'
      };
      const key = Object.keys(fixtures).find(name => path.endsWith(`/${name}.js`));
      return { contents: fixtures[key] };
    });
  } }],
});

test('an unsupported shared platform cancels stale image inspection', async t => {
  const nodes = new Map();
  const node = () => ({ textContent: '', disabled: false, attributes: {}, classList: { remove() {}, add() {} }, addEventListener() {}, querySelector() { return node(); }, setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; } });
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); } };
  const old = { selection: globalThis.downloadTestSelection, progress: globalThis.downloadTestProgress, commands: globalThis.downloadTestCommands, window: globalThis.window, fetch: globalThis.fetch };
  t.after(() => { for (const [key, value] of Object.entries({ downloadTestSelection: old.selection, downloadTestProgress: old.progress, downloadTestCommands: old.commands, window: old.window, fetch: old.fetch })) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  globalThis.window = { location: { origin: 'https://example.com' } };
  let signal, clears = 0, options, changed, platform = 'linux/amd64';
  globalThis.fetch = (_url, init) => { signal = init.signal; return new Promise(() => {}); };
  globalThis.downloadTestProgress = { clear() { clears++; }, info() {}, setLanguage() {} };
  globalThis.downloadTestSelection = value => {
    options = value;
    return { init() { options.onReset(); }, current: () => ({ image: 'nginx', platform, platformUnsupported: !platform, resolvedSource: 'auto' }), resolve: () => ({ upstream: 'nginx:latest', original: 'nginx:latest' }), onPlatformChange(callback) { changed = callback; }, setLanguage() {} };
  };
  const { feature } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
  feature.init({ panel, locale: () => ({ waitingPlatforms: 'Waiting', noPlatforms: 'None', unsupportedPlatforms: 'Unsupported' }), messages: () => ({}), flash() {}, selectionStore: {} });
  options.onReady();
  assert.equal(signal.aborted, false);
  const previousClears = clears;
  platform = ''; changed();
  assert.equal(signal.aborted, true);
  assert.equal(clears, previousClears + 1);
  assert.equal(panel.querySelector('[data-copy="load-command"]').disabled, true);
});

test('a changed platform exposes reparse instead of repeating the download', async t => {
  const nodes = new Map();
  const node = () => ({ textContent: '', disabled: false, attributes: {}, listeners: {}, classList: { remove() {}, add() {} }, addEventListener(k, fn) { this.listeners[k] = fn; }, querySelector() { return node(); }, setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; }, getAttribute(k) { return this.attributes[k]; } });
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); } };
  const old = { selection: globalThis.downloadTestSelection, retry: globalThis.downloadTestRetry, commands: globalThis.downloadTestCommands, window: globalThis.window, fetch: globalThis.fetch };
  t.after(() => { for (const [key, value] of Object.entries({ downloadTestSelection: old.selection, downloadTestRetry: old.retry, downloadTestCommands: old.commands, window: old.window, fetch: old.fetch })) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  globalThis.window = { location: { origin: 'https://example.com' } };
  globalThis.fetch = async () => Response.json({});
  let options, reparses = 0, downloads = 0;
  globalThis.downloadTestRetry = async () => { downloads++; throw Object.assign(new Error('changed'), { code: 'PLATFORM_CHANGED', retryable: false }); };
  globalThis.downloadTestSelection = value => {
    options = value;
    return { init() { options.onReset(); }, current: () => ({ image: 'nginx', platform: 'linux/amd64', resolvedSource: 'auto' }), resolve: () => ({ upstream: 'nginx', original: 'nginx' }), onPlatformChange() {}, setLanguage() {}, recheck() { reparses++; options.onLoading(); } };
  };
  const { feature } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
  const lang = { waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', failedPlatforms: 'Failed', noPlatforms: 'None' };
  const instance = feature.init({ panel, locale: () => lang, messages: () => feature.messages['zh-CN'], flash() {}, selectionStore: {} });
  options.onReady();
  const button = panel.querySelector('#browser-download');
  await button.listeners.click({ preventDefault() {} });
  assert.equal(button.textContent, '重新解析');
  instance.setLanguage(feature.messages.en);
  assert.equal(button.textContent, 'Reparse');
  await button.listeners.click({ preventDefault() {} });
  assert.equal(reparses, 1);
  assert.equal(downloads, 1);
  assert.equal(button.getAttribute('aria-disabled'), 'true');
});

test('download command and inspection follow image resolution state', async t => {
  const nodes = new Map();
  const node = () => ({ textContent: '', disabled: false, attributes: {}, classList: { remove() {}, add() {} }, addEventListener() {}, querySelector() { return node(); }, setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; } });
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); } };
  let options, platform = '', platformUnsupported = false, requests = 0;
  const old = { selection: globalThis.downloadTestSelection, commands: globalThis.downloadTestCommands, window: globalThis.window, fetch: globalThis.fetch };
  t.after(() => { for (const [key, value] of Object.entries({ downloadTestSelection: old.selection, downloadTestCommands: old.commands, window: old.window, fetch: old.fetch })) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  globalThis.window = { location: { origin: 'https://example.com' } };
  globalThis.fetch = async () => { requests++; return Response.json({}); };
  globalThis.downloadTestSelection = value => {
    options = value;
    return { init() { options.onReset(); }, current: () => ({ image: 'nginx', platform, platformUnsupported, resolvedSource: 'auto' }), resolve: () => ({ upstream: 'library/nginx@sha256:abc', original: 'nginx:stable@sha256:abc' }), onPlatformChange() {}, setLanguage() {} };
  };
  const { feature } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
  let lang = { waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', failedPlatforms: 'Failed', noPlatforms: 'None' };
  const instance = feature.init({ panel, locale: () => lang, messages: () => ({}), flash() {}, selectionStore: {} });
  const copy = panel.querySelector('[data-copy="load-command"]'), command = panel.querySelector('#load-command');
  assert.equal(copy.disabled, true); assert.equal(command.textContent, 'Waiting');
  options.onLoading();
  lang = { waitingPlatforms: '等待', loadingPlatforms: '加载中', failedPlatforms: '查询失败', noPlatforms: '无架构', unsupportedPlatforms: '架构不支持' };
  instance.setLanguage(feature.messages['zh-CN']);
  assert.equal(command.textContent, '加载中'); assert.equal(copy.disabled, true);
  options.onError(new Error('offline')); assert.equal(command.textContent, '查询失败'); assert.equal(copy.disabled, true);
  options.onReady(); assert.equal(command.textContent, '无架构'); assert.equal(copy.disabled, true); assert.equal(requests, 0);
  platformUnsupported = true; options.onReady(); assert.equal(command.textContent, '架构不支持'); assert.equal(copy.disabled, true);
  platformUnsupported = false;
  platform = 'linux/amd64'; options.onReady();
  assert.equal(command.textContent, 'download command'); assert.equal(copy.disabled, false); assert.equal(requests, 1);
  assert.equal(globalThis.downloadTestCommands[0].image, 'nginx:stable@sha256:abc');
  options.onReset(); assert.equal(copy.disabled, true); assert.equal(command.textContent, '等待');
});
