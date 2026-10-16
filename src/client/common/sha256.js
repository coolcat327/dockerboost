import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Keep callers independent of the incremental hash implementation.
export class Sha256 {
  #hash = sha256.create();
  update(bytes) { this.#hash.update(bytes); return this; }
  hex() { return bytesToHex(this.#hash.digest()); }
}
