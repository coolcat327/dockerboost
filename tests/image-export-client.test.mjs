import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExport } from '../src/client/features/download/image-export-client.js';

class WorkerStub extends EventTarget {
  postMessage(payload) { this.payload = payload; }
  send(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
}

test('progress events do not fail or finish the download', async () => {
  const worker = new WorkerStub();
  const progress = [];
  let settled = false;
  const pending = runExport(worker, { repository: 'library/nginx' }, (event) => progress.push(event.phase));
  pending.then(() => { settled = true; }, () => { settled = true; });
  for (const phase of ['resolve', 'download', 'export', 'done']) worker.send({ phase });
  await Promise.resolve();
  assert.equal(settled, false);
  worker.send({ ok: true, result: { filename: 'nginx_latest.tar' } });
  assert.equal((await pending).filename, 'nginx_latest.tar');
  assert.deepEqual(progress, ['resolve', 'download', 'export', 'done']);
});

test('explicit worker errors retain their diagnostic message', async () => {
  const worker = new WorkerStub();
  const pending = runExport(worker, {}, () => {});
  worker.send({ phase: 'resolve' });
  worker.send({ ok: false, error: '镜像层下载不完整，请重试。' });
  await assert.rejects(pending, /镜像层下载不完整/);
});

test('aborting a download settles the pending export and ignores later progress', async () => {
  const worker = new WorkerStub();
  const controller = new AbortController();
  const progress = [];
  const pending = runExport(worker, {}, (event) => progress.push(event.phase), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  worker.send({ phase: 'download' });
  assert.deepEqual(progress, []);
});

test('a removed worker returning HTML is replaced by the current deployment worker', async t => {
  const { resolveImageExportWorker } = await import('../src/client/features/download/image-export-client.js');
  const requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(String(url));
    if (url === '/old-worker.js') return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
    if (url === '/') return new Response('<meta name="image-export-worker" content="/image-export-worker-CURRENT.js">');
    return new Response('self.onmessage = () => {};', { headers: { 'content-type': 'text/javascript' } });
  });
  const previousParser = globalThis.DOMParser;
  globalThis.DOMParser = class { parseFromString(html) { return { querySelector() { return { content: html.match(/content="([^"]+)"/)[1] }; } }; } };
  t.after(() => { globalThis.DOMParser = previousParser; });
  assert.equal(await resolveImageExportWorker('/old-worker.js'), '/image-export-worker-CURRENT.js');
  assert.deepEqual(requested, ['/old-worker.js', '/', '/image-export-worker-CURRENT.js']);
});

test('worker recovery respects stop requests', async t => {
  const { resolveImageExportWorker } = await import('../src/client/features/download/image-export-client.js');
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const pending = resolveImageExportWorker('/image-export-worker-OLD.js', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
