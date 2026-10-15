import test from 'node:test';
import assert from 'node:assert/strict';
import { writeArchive } from '../src/client/features/download/archive-format.js';

test('stopping archive packing cancels the payload stream and skips remaining entries', async () => {
  const controller = new AbortController();
  let writes = 0, cancelled = false;
  const payload = { size: 4, stream: () => new ReadableStream({
    pull(stream) { stream.enqueue(new Uint8Array(4)); },
    cancel() { cancelled = true; }
  }) };
  await assert.rejects(writeArchive({ async write() {
    if (++writes === 2) controller.abort();
  } }, [['payload', payload], ['next', new Uint8Array(1)]], { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(writes, 2);
  assert.equal(cancelled, true);
});
