import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Sha256 } from '../src/client/features/install/sha256.js';
test('incremental file hashes match SHA-256 across padding and chunk boundaries', () => {
  for (const size of [0,1,55,56,63,64,65,127,128,1000000]) {
    const bytes = randomBytes(size), hash = new Sha256();
    for (let i=0;i<size;i+=137) hash.update(bytes.subarray(i,i+137));
    assert.equal(hash.hex(),createHash('sha256').update(bytes).digest('hex'));
  }
});
