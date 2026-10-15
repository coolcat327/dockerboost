import test from 'node:test';
import assert from 'node:assert/strict';
import { writeOpfsFile, writeOpfsStream } from '../src/client/common/opfs-file-writer.js';

function fixture({ writeError, closeError, abortError } = {}) {
  const events = [];
  return { events, handle: { async createWritable() { return {
    async write(chunk) { events.push(['write', [...chunk]]); if (writeError) throw writeError; },
    async close() { events.push(['close']); if (closeError) throw closeError; },
    async abort() { events.push(['abort']); if (abortError) throw abortError; }
  }; } } };
}

test('stream writes report cumulative bytes and validate before committing', async () => {
  const { handle, events } = fixture();
  const progress = [];
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array([1, 2]));
    controller.enqueue(new Uint8Array([3])); controller.close();
  } });
  const bytes = await writeOpfsStream(handle, stream, {
    onChunk(chunk, received) { progress.push(received); },
    onComplete(received) { assert.equal(received, 3); assert.equal(events.length, 2); }
  });
  assert.equal(bytes, 3);
  assert.deepEqual(progress, [2, 3]);
  assert.deepEqual(events, [['write', [1, 2]], ['write', [3]], ['close']]);
  assert.equal(stream.locked, false);
});

test('stopping a pending stream read cancels the source and aborts the file', async () => {
  const { handle, events } = fixture();
  const controller = new AbortController();
  let cancelCount = 0;
  const stream = new ReadableStream({ cancel() { cancelCount++; } });
  const pending = writeOpfsStream(handle, stream, { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cancelCount, 1);
  assert.deepEqual(events, [['abort']]);
  assert.equal(stream.locked, false);
});

test('write failures cancel the source and preserve the original error even if abort fails', async () => {
  const error = new Error('Disk full');
  const { handle, events } = fixture({ writeError: error, abortError: new Error('Abort failed') });
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel() { cancelled = true; } });
  await assert.rejects(writeOpfsStream(handle, stream), thrown => thrown === error);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
  assert.deepEqual(events, [['write', [1]], ['abort']]);
});

test('validation failure aborts instead of committing a truncated file', async () => {
  const { handle, events } = fixture();
  const stream = new Blob(['short']).stream();
  await assert.rejects(writeOpfsStream(handle, stream, {
    onComplete() { throw new Error('Incomplete'); }
  }), /Incomplete/);
  assert.equal(events.at(-1)[0], 'abort');
  assert.equal(events.some(([event]) => event === 'close'), false);
});

test('packing and close failures use the same abort lifecycle', async () => {
  for (const failOnClose of [false, true]) {
    const error = new Error('Packing failed');
    const { handle, events } = fixture({ closeError: failOnClose ? error : undefined });
    await assert.rejects(writeOpfsFile(handle, async writable => {
      await writable.write(new Uint8Array([1]));
      if (!failOnClose) throw error;
    }), thrown => thrown === error);
    assert.equal(events.at(-1)[0], 'abort');
  }
});

test('opening a writable failure still releases the stream reader', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(writeOpfsStream({ async createWritable() { throw new Error('Cannot open'); } }, stream), /Cannot open/);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});
