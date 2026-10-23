import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDownload } from '../src/client/common/download-retry.js';

test('downloads stop after three exponential retries and retain the final error', async () => {
  const signal = new AbortController().signal;
  const waits = [], notices = [], attempts = [];
  const errors = Array.from({ length: 4 }, (_, index) => new Error(`failure ${index}`));
  await assert.rejects(retryDownload(async attempt => {
    attempts.push(attempt);
    throw errors[attempt];
  }, { signal, wait: async delay => waits.push(delay), onRetry: (error, retry) => notices.push([error, retry]) }), error => error === errors[3]);
  assert.deepEqual(attempts, [0, 1, 2, 3]);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  assert.deepEqual(notices.map(([, retry]) => retry.attempt), [1, 2, 3]);
});

test('retry starts only after failed attempt cleanup and stops immediately on success', async () => {
  let cleaned = false, calls = 0;
  const result = await retryDownload(async attempt => {
    calls++;
    if (attempt) { assert.equal(cleaned, true); return 'archive'; }
    try { throw new Error('network'); }
    finally { await new Promise(setImmediate); cleaned = true; }
  }, { signal: new AbortController().signal, wait: async () => assert.equal(cleaned, true) });
  assert.equal(result, 'archive');
  assert.equal(calls, 2);
});

test('stopping during the real backoff cancels the timer without another attempt', async () => {
  const controller = new AbortController();
  let notify, calls = 0;
  const notice = new Promise(resolve => { notify = resolve; });
  const result = retryDownload(async () => { calls++; throw new Error('network'); }, {
    signal: controller.signal, onRetry: () => notify()
  });
  await notice;
  controller.abort();
  await assert.rejects(result, error => error.name === 'AbortError');
  assert.equal(calls, 1);
});

test('an active cancellation never schedules a retry; new manual downloads reset the budget', async () => {
  const controller = new AbortController();
  let notices = 0;
  await assert.rejects(retryDownload(async () => { controller.abort(); controller.signal.throwIfAborted(); }, {
    signal: controller.signal, onRetry: () => notices++
  }), error => error.name === 'AbortError');
  assert.equal(notices, 0);
  const attempts = [];
  await retryDownload(async attempt => { attempts.push(attempt); return 'saved'; }, { signal: new AbortController().signal });
  assert.deepEqual(attempts, [0]);
});
