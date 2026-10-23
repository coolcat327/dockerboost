import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageSelection } from '../src/client/common/image-selection.js';
import { createSelectionStore } from '../src/client/common/selection-store.js';

class Control {
  constructor(value = '') {
    this.value = value;
    this.options = [];
    this.disabled = false;
    this.listeners = new Map();
  }
  replaceChildren(...options) {
    this.options = options;
    this.value = options[0]?.value || '';
  }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
}

function panel() {
  const image = new Control();
  const source = new Control('auto');
  const architecture = new Control();
  const controls = new Map([
    ['.image-fields input', image],
    ['.source-fields select', source],
    ['.architecture-fields select', architecture]
  ]);
  return { image, source, architecture, querySelector: (selector) => controls.get(selector) };
}

test('shared image waits one second after typing and sends one platform request', async () => {
  const original = { Option: globalThis.Option, fetch: globalThis.fetch, window: globalThis.window };
  globalThis.Option = class { constructor(textContent, value) { this.textContent = textContent; this.value = value; } };
  globalThis.window = { location: { host: 'proxy.test' } };
  const requests = [];
  let sourcesRequests = 0;
  globalThis.fetch = async (url) => {
    if (url === '/api/sources') {
      sourcesRequests++;
      return { ok: true, json: async () => ({ sources: [{ id: 'mirror-gcr', label: 'Docker Hub' }] }) };
    }
    requests.push(url);
    return { ok: true, headers: { get: () => 'mirror-gcr' }, json: async () => ({ platforms: ['linux/amd64'] }) };
  };
  try {
    const store = createSelectionStore();
    const options = { locale: () => ({ waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', noPlatforms: 'None' }),
      messages: () => ({ automatic: 'Auto' }), flash: () => {}, store };
    const firstPanel = panel();
    const secondPanel = panel();
    createImageSelection({ panel: firstPanel, ...options }).init();
    createImageSelection({ panel: secondPanel, ...options }).init();
    await new Promise(setImmediate);
    assert.equal(sourcesRequests, 1, 'both panels share one source catalog request');
    assert.equal(firstPanel.source.options.some(option => option.value === 'mirror-gcr'), true);
    assert.equal(secondPanel.source.options.some(option => option.value === 'mirror-gcr'), true);

    firstPanel.image.value = 'golang:ti';
    firstPanel.image.listeners.get('input')();
    await new Promise((resolve) => setTimeout(resolve, 400));
    firstPanel.image.value = 'golang:tip';
    firstPanel.image.listeners.get('input')();
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(requests.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0], 'https://proxy.test').searchParams.get('image'), 'golang:tip');
  } finally { Object.assign(globalThis, original); }
});

test('image selection state and requests belong to each tab', async () => {
  const original = { Option: globalThis.Option, fetch: globalThis.fetch, window: globalThis.window };
  globalThis.Option = class { constructor(textContent, value) { this.textContent = textContent; this.value = value; } };
  globalThis.window = { location: { host: 'proxy.test' } };
  globalThis.fetch = async (url) => {
    if (url === '/api/sources') return { ok: true, json: async () => ({ sources: [
      { id: 'mirror-gcr', label: 'Docker Hub' }, { id: 'ghcr', label: 'GitHub' }
    ] }) };
    const selected = new URL(url, 'https://proxy.test').searchParams.get('source');
    return {
      ok: true,
      headers: { get: () => selected === 'auto' ? 'mirror-gcr' : selected },
      json: async () => ({ platforms: ['linux/amd64'] })
    };
  };
  try {
    const firstPanel = panel();
    const secondPanel = panel();
    const common = { waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', noPlatforms: 'None' };
    const options = { locale: () => common, messages: () => ({ automatic: 'Auto' }), flash: () => {} };
    let firstReady = 0;
    let secondReady = 0;
    const first = createImageSelection({ panel: firstPanel, ...options, onReady: () => { firstReady++; } });
    const second = createImageSelection({ panel: secondPanel, ...options, onReady: () => { secondReady++; } });
    first.init();
    second.init();
    await new Promise(setImmediate);

    firstPanel.image.value = 'nginx:latest';
    await firstPanel.image.listeners.get('input')();
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.equal(first.current().platform, 'linux/amd64');
    assert.equal(first.current().resolvedSource, 'mirror-gcr');
    assert.equal(second.current().image, '');
    assert.equal(secondPanel.architecture.disabled, true);
    assert.equal(firstReady, 1);
    assert.equal(secondReady, 0);

    firstPanel.source.value = 'ghcr';
    firstPanel.image.value = 'owner/image:1';
    firstPanel.source.listeners.get('change')();
    await new Promise(setImmediate);
    assert.equal(first.current().resolvedSource, 'ghcr');
    assert.equal(secondPanel.source.value, 'auto');
    assert.equal(second.current().resolvedSource, 'mirror-gcr');
    assert.equal(secondReady, 0);
  } finally {
    Object.assign(globalThis, original);
  }
});

test('a selection group shares image, source, and platform choices', async () => {
  const original = { Option: globalThis.Option, fetch: globalThis.fetch, window: globalThis.window };
  globalThis.Option = class { constructor(textContent, value) { this.textContent = textContent; this.value = value; } };
  globalThis.window = { location: { host: 'proxy.test' } };
  globalThis.fetch = async (url) => {
    if (url === '/api/sources') return { ok: true, json: async () => ({ sources: [
      { id: 'mirror-gcr', label: 'Docker Hub' }
    ] }) };
    const requestedImage = new URL(url, 'https://proxy.test').searchParams.get('image');
    return {
      ok: true,
      headers: { get: () => 'mirror-gcr' },
      json: async () => ({ platforms: requestedImage === 'alpine:3' ? ['linux/amd64'] : ['linux/amd64', 'linux/arm64'] })
    };
  };
  try {
    const group = createSelectionStore();
    const common = { waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', noPlatforms: 'None' };
    const options = { locale: () => common, messages: () => ({ automatic: 'Auto' }), flash: () => {} };
    const pullPanel = panel();
    const downloadPanel = panel();
    const separatePanel = panel();
    let pullPlatformChanges = 0;
    let downloadPlatformChanges = 0;
    const pull = createImageSelection({ panel: pullPanel, ...options, store: group });
    const download = createImageSelection({ panel: downloadPanel, ...options, store: group });
    const separate = createImageSelection({ panel: separatePanel, ...options });
    pull.init();
    download.init();
    separate.init();
    pull.onPlatformChange(() => { pullPlatformChanges++; });
    download.onPlatformChange(() => { downloadPlatformChanges++; });
    await new Promise(setImmediate);

    pullPanel.image.value = 'nginx:latest';
    pullPanel.image.listeners.get('input')();
    assert.equal(download.current().image, 'nginx:latest');
    assert.equal(separate.current().image, '');
    assert.equal(downloadPanel.architecture.disabled, true);
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.equal(pull.current().platform, 'linux/amd64');
    assert.equal(download.current().platform, 'linux/amd64');

    pullPanel.source.value = 'mirror-gcr';
    pullPanel.source.listeners.get('change')();
    assert.equal(downloadPanel.source.value, 'mirror-gcr');
    assert.equal(separatePanel.source.value, 'auto');
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.equal(download.current().platform, 'linux/amd64');
    pullPanel.architecture.value = 'linux/arm64';
    pullPanel.architecture.listeners.get('change')();
    assert.equal(download.current().platform, 'linux/arm64');
    assert.equal(group.snapshot().platform, 'linux/arm64');
    assert.equal(pullPlatformChanges, 1);
    assert.equal(downloadPlatformChanges, 1);
    downloadPanel.architecture.value = 'linux/amd64';
    downloadPanel.architecture.listeners.get('change')();
    assert.equal(pull.current().platform, 'linux/amd64');
    assert.equal(pullPlatformChanges, 2);
    assert.equal(downloadPlatformChanges, 2);
    downloadPanel.architecture.value = 'linux/arm64';
    downloadPanel.architecture.listeners.get('change')();
    downloadPanel.image.value = 'alpine:3';
    downloadPanel.image.listeners.get('input')();
    assert.equal(pull.current().image, 'alpine:3');
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.equal(pull.current().platform, 'linux/amd64');
    assert.equal(download.current().platform, 'linux/amd64');
    assert.equal(group.snapshot().platform, 'linux/amd64');
  } finally {
    Object.assign(globalThis, original);
  }
});

test('a pending platform lookup applies the latest shared choice', async () => {
  const original = { Option: globalThis.Option, fetch: globalThis.fetch, window: globalThis.window };
  globalThis.Option = class { constructor(textContent, value) { this.textContent = textContent; this.value = value; } };
  globalThis.window = { location: { host: 'proxy.test' } };
  let resolveLookup;
  let platformRequests = 0;
  const platformResponse = () => ({
    ok: true,
    headers: { get: () => 'mirror-gcr' },
    json: async () => ({ platforms: ['linux/amd64', 'linux/arm64'] })
  });
  globalThis.fetch = async (url) => {
    if (url === '/api/sources') return { ok: true, json: async () => ({ sources: [{ id: 'mirror-gcr', label: 'Docker Hub' }] }) };
    platformRequests++;
    if (platformRequests === 1) return new Promise((resolve) => { resolveLookup = resolve; });
    return platformResponse();
  };
  try {
    const group = createSelectionStore();
    const common = { waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', noPlatforms: 'None' };
    const options = { locale: () => common, messages: () => ({ automatic: 'Auto' }), flash: () => {}, store: group };
    const pullPanel = panel();
    const downloadPanel = panel();
    const pull = createImageSelection({ panel: pullPanel, ...options });
    const download = createImageSelection({ panel: downloadPanel, ...options });
    pull.init();
    download.init();
    await new Promise(setImmediate);

    pullPanel.image.value = 'nginx:latest';
    pullPanel.image.listeners.get('input')();
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.equal(platformRequests, 1);
    assert.equal(pullPanel.architecture.disabled, true);
    assert.equal(downloadPanel.architecture.disabled, true);
    group.update({ platform: 'linux/arm64' });
    resolveLookup(platformResponse());
    await new Promise(setImmediate);
    assert.equal(pull.current().platform, 'linux/arm64');
    assert.equal(download.current().platform, 'linux/arm64');
  } finally {
    Object.assign(globalThis, original);
  }
});

test('initial shared state restores a nondefault source and platform after async loading', async () => {
  const original = { Option: globalThis.Option, fetch: globalThis.fetch, window: globalThis.window };
  globalThis.Option = class { constructor(textContent, value) { this.textContent = textContent; this.value = value; } };
  globalThis.window = { location: { host: 'proxy.test' } };
  let requestedSource;
  globalThis.fetch = async (url) => {
    if (url === '/api/sources') return { ok: true, json: async () => ({ sources: [
      { id: 'mirror-gcr', label: 'Docker Hub' }, { id: 'ghcr', label: 'GitHub' }
    ] }) };
    requestedSource = new URL(url, 'https://proxy.test').searchParams.get('source');
    return { ok: true, headers: { get: () => 'ghcr' }, json: async () => ({ platforms: ['linux/amd64', 'linux/arm64/v8'] }) };
  };
  try {
    const store = createSelectionStore();
    store.update({ image: 'owner/image:latest', source: 'ghcr', platform: 'linux/arm64/v8' });
    const panelState = panel();
    const selection = createImageSelection({ panel: panelState,
      locale: () => ({ waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', noPlatforms: 'None' }),
      messages: () => ({ automatic: 'Auto' }), flash: () => {}, store
    });
    selection.init();
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    assert.equal(requestedSource, 'ghcr');
    assert.equal(selection.current().image, 'owner/image:latest');
    assert.equal(selection.current().source, 'ghcr');
    assert.equal(selection.current().platform, 'linux/arm64/v8');
  } finally { Object.assign(globalThis, original); }
});


test('source catalog shares pending and successful requests and retries after failure', async t => {
  let calls = 0, resolveResponse;
  t.mock.method(globalThis, 'fetch', () => {
    calls++;
    return new Promise(resolve => { resolveResponse = resolve; });
  });
  const store = createSelectionStore();
  const first = store.lookupSources();
  assert.equal(store.lookupSources(), first);
  assert.equal(calls, 1);
  const failure = assert.rejects(first, /无法读取镜像源/);
  resolveResponse(Response.json({ error: 'Unavailable' }, { status: 503 }));
  await failure;
  const retry = store.lookupSources();
  assert.equal(calls, 2);
  const data = { sources: [{ id: 'mirror-gcr', label: 'Docker Hub' }] };
  resolveResponse(Response.json(data));
  assert.deepEqual(await retry, data);
  store.update({ image: 'nginx:latest', source: 'mirror-gcr' });
  assert.equal(store.lookupSources(), retry, 'choice changes retain the source catalog');
  assert.equal(calls, 2);
});

test('queue selection retries source loading and disposal ignores pending resolution', async () => {
  const original = { Option: globalThis.Option, fetch: globalThis.fetch, window: globalThis.window };
  globalThis.Option = class { constructor(textContent, value) { this.textContent = textContent; this.value = value; } };
  globalThis.window = { location: { host: 'proxy.test' } };
  let catalogCalls = 0, ready = 0, release;
  globalThis.fetch = async url => {
    if (url === '/api/sources') {
      if (++catalogCalls === 1) throw new Error('offline');
      return { ok: true, json: async () => ({ sources: [{ id: 'mirror-gcr', label: 'Docker Hub' }] }) };
    }
    return new Promise(resolve => { release = () => resolve({ ok: true, headers: { get: () => 'mirror-gcr' }, json: async () => ({ platforms: ['linux/amd64'] }) }); });
  };
  try {
    const store = createSelectionStore(); store.update({ image: 'nginx:latest' });
    const controls = panel();
    const selection = createImageSelection({ panel: controls, store,
      locale: () => ({ waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', noPlatforms: 'None' }),
      messages: () => ({ automatic: 'Auto' }), flash: () => {}, onReady: () => ready++ });
    selection.init(); await new Promise(setImmediate);
    assert.equal(catalogCalls, 1);
    await selection.reloadSources(); await new Promise(setImmediate);
    assert.equal(catalogCalls, 2);
    assert.equal(typeof release, 'function');
    selection.dispose(); release(); await new Promise(setImmediate);
    assert.equal(ready, 0, 'removed queue jobs cannot become ready or auto-start');
  } finally { Object.assign(globalThis, original); }
});

test('reparsing refetches platforms after success or failure while preserving catalog and platform choice', async t => {
  const original = { Option: globalThis.Option, window: globalThis.window };
  t.after(() => Object.assign(globalThis, original));
  globalThis.Option = class { constructor(textContent, value) { this.textContent = textContent; this.value = value; } };
  globalThis.window = { location: { host: 'proxy.test' } };
  let catalogs = 0, ready = 0, failed = 0;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/sources') {
      catalogs++;
      return Response.json({ sources: [{ id: 'mirror-gcr', label: 'Docker Hub' }] });
    }
    requests.push({ url, options });
    if (requests.length === 2) return Response.json({ error: 'temporarily unavailable' }, { status: 503 });
    return Response.json({ platforms: requests.length === 1 ? ['linux/amd64', 'linux/arm64/v8'] : ['linux/arm64/v8', 'linux/arm64/v9'] },
      { headers: { 'x-dockerboost-source': 'mirror-gcr' } });
  });
  const store = createSelectionStore();
  store.update({ image: 'nginx:latest', platform: 'linux/arm64/v8' });
  const controls = panel();
  const selection = createImageSelection({ panel: controls, store,
    locale: () => ({ waitingPlatforms: 'Waiting', loadingPlatforms: 'Loading', noPlatforms: 'None' }),
    messages: () => ({ automatic: 'Auto' }), flash: () => {}, onReady: () => ready++, onError: () => failed++ });
  t.after(() => selection.dispose());
  selection.init(); await new Promise(setImmediate);
  assert.equal(ready, 1);
  assert.equal(controls.architecture.value, 'linux/arm64/v8');
  await selection.reloadSources(); await new Promise(setImmediate);
  assert.equal(failed, 1, 'manual refresh must not reuse the successful platform response');
  await selection.reloadSources(); await new Promise(setImmediate);
  assert.equal(ready, 2, 'another refresh recovers from an HTTP failure');
  assert.equal(catalogs, 1, 'all attempts retain the shared source catalog');
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.url === requests[0].url));
  assert.ok(requests.slice(1).every(request => request.options.cache === 'no-store'));
  assert.deepEqual(controls.architecture.options.map(option => option.value), ['linux/arm64/v8', 'linux/arm64/v9']);
  assert.equal(controls.architecture.value, 'linux/arm64/v8');
});
