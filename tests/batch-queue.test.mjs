import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchQueue } from '../src/client/features/download/batch-queue.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
test('batch queue defaults to five active jobs, deduplicates submissions and fills freed slots', async () => {
  const releases = new Map(); let active = 0, peak = 0;
  const queue = createBatchQueue(job => new Promise(resolve => { active++; peak = Math.max(peak, active); releases.set(job, () => { active--; resolve(); }); }));
  const jobs = Array.from({ length: 8 }, () => ({}));
  jobs.forEach(job => { queue.add(job); queue.add(job); }); await tick();
  assert.equal(releases.size, 5); assert.equal(jobs[5].state, 'queued');
  releases.get(jobs[0])(); await tick(); assert.equal(releases.size, 6);
  for (const job of jobs) { releases.get(job)?.(); await tick(); }
  assert.equal(peak, 5); assert.ok(jobs.every(job => job.state === 'done')); assert.equal(queue.busy, false);
});
test('individual cancellation waits for cleanup before freeing a slot and supports retry', async () => {
  let finish;
  const queue = createBatchQueue((_job, signal) => new Promise((resolve, reject) => {
    finish = () => signal.aborted ? reject(new Error('cancelled')) : resolve();
  }), () => {}, 1);
  const first = {}, second = {}; queue.add(first); queue.add(second); await tick();
  queue.stop(first); assert.equal(second.state, 'queued'); finish(); await tick();
  assert.equal(first.state, 'stopped'); assert.equal(second.state, 'running'); finish(); await tick();
  queue.add(first); await tick(); finish(); await tick(); assert.equal(first.state, 'done');
});
test('stop all cancels queued work without starting it; failures can be retried', async () => {
  let count = 0;
  const queue = createBatchQueue(async () => { count++; throw new Error('network'); }, () => {}, 1);
  const a = {}, b = {}; queue.add(a); queue.add(b); queue.stopAll(); await tick();
  assert.equal(count, 0); assert.equal(b.state, 'stopped'); assert.equal(a.state, 'stopped');
  queue.add(a); await tick(); assert.equal(a.state, 'failed'); assert.equal(a.error, 'network');
  queue.add(a); await tick(); assert.equal(count, 2);
});
