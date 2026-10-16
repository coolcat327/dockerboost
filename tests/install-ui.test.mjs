import test from 'node:test';
import assert from 'node:assert/strict';
import { feature } from '../src/client/features/install/index.js';
test('installation switches all labels and command hints without losing versions', async t => {
  const nodes = new Map();
  function node() { return { value:'', textContent:'', innerHTML:'', dataset:{}, listeners:{}, style:{}, classList:{ toggle() {} }, addEventListener(event,fn) { this.listeners[event]=fn; }, replaceChildren() { this.value=''; }, add(option) { this.value ||= option.value; }, setAttribute() {}, querySelector() { return node(); } }; }
  const panel = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector,node()); return nodes.get(selector); }, querySelectorAll() { return labels; } };
  const labels = ['online','offline','download','reload','installHelp','cpu'].map(key => ({ dataset:{ installText:key } }));
  panel.querySelector('#install-arch').value='x86_64';
  const previousOption = globalThis.Option, previousWindow = globalThis.window;
  t.after(() => { globalThis.Option = previousOption; globalThis.window = previousWindow; });
  globalThis.Option = function(label,value) { this.value=value; };
  globalThis.window = { location:{ origin:'https://example.com' } };
  t.mock.method(globalThis,'fetch',async () => Response.json({ docker:['28.1.1'], compose:'2.35.1' }));
  const instance = feature.init({ panel });
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
  assert.match(panel.querySelector('#install-command').textContent, /docker=27.0.0/);
  assert.doesNotMatch(panel.querySelector('#install-command').textContent, /expires=|24 小时/);
  assert.equal(labels[2].innerHTML, '下载');
  assert.equal(labels[3].innerHTML, '刷新');
});

test('installation can stop a pending request, clean its task and download again', async t => {
  const nodes = new Map();
  const node = () => ({ value: '', dataset: {}, style: {}, listeners: {}, classList: { toggle() {} },
    addEventListener(event, fn) { this.listeners[event] = fn; }, replaceChildren() { this.value = ''; },
    add(option) { this.value ||= option.value; }, setAttribute() {}, querySelector() { return node(); } });
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
        progressMessages.push(panel.querySelector('#install-status').textContent);
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
    assert.equal(panel.querySelector('#install-status').textContent, 'Download cancelled');
    assert.equal(panel.querySelector('#install-arch').disabled, false);
  }
  assert.equal(requests, 2);
  progressMode = true;
  await button.listeners.click();
  assert.match(progressMessages[1], /33% · 1\.0\/3\.0 MB · docker-compose/);
  assert.equal(removed, 3);
  assert.equal(panel.querySelector('#install-status').textContent, 'Download cancelled');
});
