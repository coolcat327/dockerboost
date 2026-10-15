// Incremental SHA-256 keeps file hashing independent of the file size.
const k = new Uint32Array(64);
const initial = [];
for (let n = 2, i = 0; i < 64; n++) {
  let prime = true;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
  if (prime) { if (i < 8) initial.push((Math.sqrt(n) % 1 * 2 ** 32) >>> 0); k[i++] = (Math.cbrt(n) % 1 * 2 ** 32) >>> 0; }
}
const rotate = (x, n) => (x >>> n) | (x << (32 - n));
export class Sha256 {
  state = new Uint32Array(initial);
  block = new Uint8Array(64);
  used = 0;
  length = 0;
  compress() {
    const w = new Uint32Array(64), view = new DataView(this.block.buffer);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i-15], b = w[i-2];
      w[i] = w[i-16] + (rotate(a,7)^rotate(a,18)^(a>>>3)) + w[i-7] + (rotate(b,17)^rotate(b,19)^(b>>>10));
    }
    let [a,b,c,d,e,f,g,h] = this.state;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) >>> 0;
      const t2 = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    [a,b,c,d,e,f,g,h].forEach((v,i) => { this.state[i] += v; });
  }
  update(bytes) {
    this.length += bytes.length;
    for (let offset = 0; offset < bytes.length;) {
      const count = Math.min(64-this.used, bytes.length-offset);
      this.block.set(bytes.subarray(offset,offset+count),this.used);
      this.used += count; offset += count;
      if (this.used === 64) { this.compress(); this.used = 0; }
    }
    return this;
  }
  hex() {
    const bits = BigInt(this.length)*8n;
    const padding = new Uint8Array(this.used < 56 ? 64-this.used : 128-this.used);
    padding[0] = 128;
    new DataView(padding.buffer).setBigUint64(padding.length-8,bits);
    this.update(padding);
    return Array.from(this.state,v => v.toString(16).padStart(8,'0')).join('');
  }
}
