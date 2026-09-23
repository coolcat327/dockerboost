import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExport } from '../src/client/features/download/export-client.js';

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
