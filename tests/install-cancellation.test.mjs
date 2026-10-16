import test from 'node:test';
import assert from 'node:assert/strict';
import { writeArchive } from '../src/client/features/download/archive-format.js';

test('stopping archive packing cancels the payload stream and skips remaining entries', async () => {
  const controller = new AbortController();
  let writes = 0, cancelled = false, produced = 0, nextOpened = false;
  const size = 16 * 1024 * 1024;
  const payload = { size, stream: () => new ReadableStream({
    pull(stream) {
      const length = Math.min(65536, size - produced);
      stream.enqueue(new Uint8Array(length));
      produced += length;
      if (produced === size) stream.close();
    },
    cancel() { cancelled = true; }
  }) };
  await assert.rejects(writeArchive({ async write() {
    if (++writes === 2) controller.abort();
  } }, [['payload', payload], ['next', { size: 1, stream() { nextOpened = true; return new Response('x').body; } }]], { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(writes, 2);
  assert.equal(cancelled, true);
  assert.equal(nextOpened, false);
  assert.ok(produced < size);
});
