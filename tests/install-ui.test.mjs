import test from 'node:test';
import assert from 'node:assert/strict';
import { feature } from '../src/client/features/install/index.js';
test('installation switches all labels and command hints without losing versions', async t => {
  const nodes = new Map();
  function node() { return { selectedOptions:[{ textContent:'x86_64 / amd64' }], value:'', textContent:'', innerHTML:'', dataset:{}, listeners:{}, style:{}, classList:{ toggle() {} }, addEventListener(event,fn) { this.listeners[event]=fn; }, replaceChildren() { this.value=''; }, add(option) { this.value ||= option.value; }, setAttribute() {}, removeAttribute() {}, querySelector() { return node(); } }; }
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector,node()); return nodes.get(selector); }, querySelectorAll() { return labels; } };
  const labels = ['online','offline','download','reload','installHelp','cpu'].map(key => ({ dataset:{ installText:key } }));
  panel.querySelector('#install-arch').value='x86_64';
  const previousOption = globalThis.Option, previousWindow = globalThis.window;
  t.after(() => { globalThis.Option = previousOption; globalThis.window = previousWindow; });
  globalThis.Option = function(label,value) { this.value=value; };
  globalThis.window = { location:{ origin:'https://example.com' } };
  t.mock.method(globalThis,'fetch',async () => Response.json({ docker:['28.1.1'], compose:'2.35.1' }));
  const instance = feature.init({ panel });
  assert.equal(panel.querySelector('#install-download').disabled, true);
  await panel.querySelector('#install-arch').listeners.change();
  await new Promise(resolve => setImmediate(resolve));
  instance.setLanguage(feature.messages.en);
  assert.equal(labels[0].innerHTML,'Online installation');
  assert.equal(panel.querySelector('#install-status').textContent,'Versions ready.');
  assert.match(panel.querySelector('#install-package-tree').textContent,/docker-28.1.1.tgz/);
  assert.match(panel.querySelector('#install-package-tree').textContent,/readme.md/);
  assert.equal(panel.querySelector('#install-package-name').textContent, 'docker-offline-x86_64-docker-28.1.1-compose-2.35.1.tar');
  assert.match(labels[4].innerHTML, /Download on an online Linux host/);
  assert.match(panel.querySelector('#install-command').textContent, /^curl /);
  assert.match(panel.querySelector('#install-command').textContent, /&& sh \.download-docker\.sh/);
  instance.setLanguage(feature.messages['zh-CN']);
  assert.match(labels[4].innerHTML, /在联网 Linux 机器下载/);
  assert.match(panel.querySelector('#install-command').textContent, /^curl /);
  assert.equal(panel.querySelector('#install-docker').value,'28.1.1');
  panel.querySelector('#install-docker').value = '27.0.0';
  panel.querySelector('#install-docker').listeners.change();
  assert.match(panel.querySelector('#install-command').textContent, /'27\.0\.0'/);
  assert.doesNotMatch(panel.querySelector('#install-command').textContent, /expires=|24 小时/);
  assert.equal(labels[2].innerHTML, '下载');
  assert.equal(labels[3].innerHTML, '刷新');
});

test('installation can stop a pending request, clean its task and download again', async t => {
  const nodes = new Map();
  const node = () => ({ selectedOptions: [{ textContent: 'x86_64 / amd64' }], value: '', dataset: {}, style: {}, listeners: {}, classList: { toggle() {} },
    addEventListener(event, fn) { this.listeners[event] = fn; }, replaceChildren() { this.value = ''; },
    add(option) { this.value ||= option.value; }, setAttribute() {}, removeAttribute() {}, querySelector() { return node(); } });
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }, querySelectorAll() { return []; } };
  panel.querySelector('#install-arch').value = 'x86_64';
  const previousOption = globalThis.Option, previousWindow = globalThis.window;
  t.after(() => { globalThis.Option = previousOption; globalThis.window = previousWindow; });
  globalThis.Option = function(label, value) { this.value = value; };
  globalThis.window = { location: { origin: 'https://example.com' } };
  let removed = 0, requests = 0, pendingSignal, progressMode = false;
  const progressMessages = [];
  const job = { async getFileHandle() { return {
    async createWritable() { return {
      async write() {
        progressMessages.push(['#install-status', '#install-speed', '#install-detail'].map(selector => panel.querySelector(selector).textContent).join(' · '));
        if (progressMessages.length === 2) await panel.querySelector('#install-download').listeners.click();
      }, async close() {}, async abort() {}
    }; }, async getFile() { return new Blob(); }
  }; } }; 
  const jobs = { async *entries() {}, async getDirectoryHandle() { return job; }, async removeEntry() { removed++; } };
  const root = { async *entries() {}, async getDirectoryHandle(name) {
    if (name === 'dockerboost-downloads') return jobs;
    throw new DOMException('Missing', 'NotFoundError');
  } };
  const previousStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { async getDirectory() { return root; } } });
  t.after(() => {
    if (previousStorage) Object.defineProperty(navigator, 'storage', previousStorage);
    else delete navigator.storage;
  });
  t.mock.method(globalThis, 'fetch', async (url, { signal } = {}) => {
    assert.notEqual(url, '/version.json', 'downloads use their embedded release version');
    if (url.includes('/catalog')) return Response.json({ docker: ['28.1.1'], compose: '2.35.1' });
    if (progressMode) {
      if (url.includes('/plan')) return Response.json({ files: {} });
      const size = url.includes('kind=docker') ? 1048576 : 2097152;
      return new Response(new Uint8Array(size), { headers: { 'content-length': String(size) } });
    }
    requests++; pendingSignal = signal;
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const instance = feature.init({ panel });
  await panel.querySelector('#install-arch').listeners.change();
  const tick = () => new Promise(resolve => setImmediate(resolve));
  await tick();
  const button = panel.querySelector('#install-download');
  for (let attempt = 0; attempt < 2; attempt++) {
    const running = button.listeners.click();
    await tick();
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, attempt ? 'Stop download' : '停止下载');
    instance.setLanguage(feature.messages.en);
    assert.equal(button.textContent, 'Stop download');
    await button.listeners.click();
    assert.equal(pendingSignal.aborted, true);
    await running;
    assert.equal(removed, attempt + 1);
    assert.equal(button.textContent, 'Download');
    assert.equal(panel.querySelector('#install-status').textContent, 'Download stopped');
    assert.equal(panel.querySelector('#install-arch').disabled, false);
  }
  assert.equal(requests, 2);
  progressMode = true;
  await button.listeners.click();
  assert.match(progressMessages[1], /33% · 1\.0 MB \/ 3\.0 MB .*docker-compose/);
  assert.equal(removed, 3);
  assert.equal(panel.querySelector('#install-status').textContent, 'Download stopped');
});

test('catalog waits for architecture selection and refetches the same architecture without cache', async t => {
  const nodes = new Map();
  const node = () => ({ value: '', selectedOptions: [{ textContent: 'x86_64 / amd64' }], dataset: {}, style: {}, listeners: {}, classList: { toggle() {} },
    addEventListener(event, fn) { this.listeners[event] = fn; }, replaceChildren() { this.value = ''; },
    add(option) { this.value ||= option.value; }, setAttribute() {}, removeAttribute() {}, querySelector() { return node(); } });
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }, querySelectorAll() { return []; } };
  const previousOption = globalThis.Option, previousWindow = globalThis.window;
  t.after(() => { globalThis.Option = previousOption; globalThis.window = previousWindow; });
  globalThis.Option = function(label, value) { this.value = value; };
  globalThis.window = { location: { origin: 'https://example.com' } };
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return Response.json({ docker: ['28.1.1'], compose: '2.35.1' });
  });
  const instance = feature.init({ panel });
  instance.setLanguage(feature.messages.en);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 0);
  assert.equal(panel.querySelector('#install-reload').disabled, true);
  assert.equal(panel.querySelector('#install-docker').disabled, true);
  assert.equal(panel.querySelector('#install-status').textContent, 'Select CPU architecture');
  for (let attempt = 0; attempt < 2; attempt++) {
    const arch = panel.querySelector('#install-arch');
    arch.value = 'x86_64';
    await arch.listeners.change();
    assert.equal(arch.value, '', 'the display option allows selecting the same architecture again');
    assert.equal(requests.length, attempt + 1);
    assert.match(requests[attempt].url, /arch=x86_64/);
    assert.equal(requests[attempt].options.cache, 'no-store');
    assert.equal(panel.querySelector('#install-download').disabled, false);
    assert.match(panel.querySelector('#install-command').textContent, /'x86_64'/);
  }
});

test('browser bundle keeps every file under one folder with working relative checksums', async t => {
  const { spawnSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const nodes = new Map();
  const node = () => ({ selectedOptions: [{ textContent: 'x86_64 / amd64' }], value: '', dataset: {}, style: {}, listeners: {}, classList: { toggle() {} },
    addEventListener(event, fn) { this.listeners[event] = fn; }, replaceChildren() { this.value = ''; },
    add(option) { this.value ||= option.value; }, setAttribute() {}, removeAttribute() {}, querySelector() { return node(); } });
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }, querySelectorAll() { return []; } };
  panel.querySelector('#install-arch').value = 'x86_64';
  const previous = { Option: globalThis.Option, window: globalThis.window, document: globalThis.document };
  t.after(() => Object.assign(globalThis, previous));
  globalThis.Option = function(label, value) { this.value = value; };
  globalThis.window = { location: { origin: 'https://example.com' } };
  globalThis.document = { body: { append() {} }, createElement() { return { click() {}, remove() {} }; } };
  const blobs = new Map();
  const job = { async getFileHandle(name) { return {
    async createWritable() {
      const chunks = [];
      return { async write(bytes) { chunks.push(bytes.slice()); }, async close() { blobs.set(name, new Blob(chunks)); }, async abort() {} };
    }, async getFile() { return blobs.get(name); }
  }; } };
  const jobs = { async *entries() {}, async getDirectoryHandle() { return job; }, async removeEntry() {} };
  const root = { async *entries() {}, async getDirectoryHandle(name) {
    if (name === 'dockerboost-downloads') return jobs;
    throw new DOMException('Missing', 'NotFoundError');
  } };
  const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { async getDirectory() { return root; } } });
  t.after(() => { if (storageDescriptor) Object.defineProperty(navigator, 'storage', storageDescriptor); else delete navigator.storage; });
  let saved;
  t.mock.method(URL, 'createObjectURL', blob => { saved = blob; return 'blob:test'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', callback => { timers.push(callback); return 0; });
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.includes('/catalog')) return Response.json({ docker: ['28.1.1'], compose: '2.35.1' });
    if (url.includes('/plan')) return Response.json({ files: { 'readme.md': 'guide', 'install_docker.sh': '#!/bin/sh\n', 'uninstall_docker.sh': '#!/bin/sh\n' } });
    const bytes = url.includes('kind=docker') ? new Uint8Array([1, 2, 3]) : new Uint8Array([4, 5]);
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
  });
  feature.init({ panel });
  await panel.querySelector('#install-arch').listeners.change();
  await new Promise(resolve => setImmediate(resolve));
  await panel.querySelector('#install-download').listeners.click();
  assert.ok(saved, panel.querySelector('#install-status').textContent);
  const archive = Buffer.from(await saved.arrayBuffer());
  const folder = 'docker-offline-x86_64-docker-28.1.1-compose-2.35.1';
  const listing = spawnSync('tar', ['-tf', '-'], { input: archive, encoding: 'utf8' });
  assert.equal(listing.status, 0, listing.stderr);
  assert.ok(listing.stdout.trim().split('\n').every(name => name.startsWith(`${folder}/`)));
  const extract = name => {
    const result = spawnSync('tar', ['-xOf', '-', `${folder}/${name}`], { input: archive });
    assert.equal(result.status, 0, result.stderr.toString());
    return result.stdout;
  };
  for (const line of extract('SHA256SUMS').toString().trim().split('\n')) {
    const [hash, name] = line.split('  ');
    assert.equal(createHash('sha256').update(extract(name)).digest('hex'), hash);
  }
  for (const callback of timers) callback();
});

test('installation retries three times with clean tasks before exposing final failure', async t => {
  const nodes = new Map();
  const node = () => ({ value: '', selectedOptions: [{ textContent: 'x86_64 / amd64' }], dataset: {}, style: {}, listeners: {}, classList: { toggle() {} },
    addEventListener(event, fn) { this.listeners[event] = fn; }, replaceChildren() { this.value = ''; },
    add(option) { this.value ||= option.value; }, setAttribute() {}, removeAttribute() {}, querySelector() { return node(); } });
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }, querySelectorAll() { return []; } };
  const previous = { Option: globalThis.Option, window: globalThis.window };
  t.after(() => Object.assign(globalThis, previous));
  globalThis.Option = function(label, value) { this.value = value; };
  globalThis.window = { location: { origin: 'https://example.com' } };
  let created = 0, cleaned = 0, plans = 0;
  const jobs = { async *entries() {}, async getDirectoryHandle() {
    assert.equal(created, cleaned, 'previous task must finish cleanup before retry');
    created++; return {};
  }, async removeEntry() { cleaned++; } };
  const root = { async *entries() {}, async getDirectoryHandle(name) {
    if (name === 'dockerboost-downloads') return jobs;
    throw new DOMException('Missing', 'NotFoundError');
  } };
  const storageDescriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { async getDirectory() { return root; } } });
  t.after(() => { if (storageDescriptor) Object.defineProperty(navigator, 'storage', storageDescriptor); else delete navigator.storage; });
  const delays = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { delays.push(delay); queueMicrotask(callback); return 0; });
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.includes('/catalog')) return Response.json({ docker: ['28.1.1'], compose: '2.35.1' });
    plans++;
    throw new Error(`network error ${plans}`);
  });
  feature.init({ panel });
  panel.querySelector('#install-arch').value = 'x86_64';
  await panel.querySelector('#install-arch').listeners.change();
  await new Promise(setImmediate);
  await panel.querySelector('#install-download').listeners.click();
  assert.equal(plans, 4);
  assert.equal(created, 4);
  assert.equal(cleaned, 4);
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.equal(panel.querySelector('#install-status').textContent, '下载失败');
  assert.equal(panel.querySelector('#install-detail').textContent, 'network error 4');
  assert.equal(panel.querySelector('#install-download').textContent, '下载');
});
