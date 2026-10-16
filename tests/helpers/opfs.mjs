const missing = () => Object.assign(new Error('missing'), { name: 'NotFoundError' });
export class MemoryDirectory {
  kind = 'directory';
  files = new Map();
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.files.has(name) && create) this.files.set(name, new MemoryDirectory());
    const entry = this.files.get(name);
    if (!entry || entry.kind !== 'directory') throw missing();
    return entry;
  }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name) && create) this.files.set(name, { kind: 'file', blob: new Blob() });
    const entry = this.files.get(name);
    if (!entry || entry.kind !== 'file') throw missing();
    return {
      kind: 'file',
      getFile: async () => entry.blob,
      async createWritable() {
        const parts = [];
        return { async write(bytes) { parts.push(typeof bytes === 'string' ? bytes : bytes.slice()); }, async close() { entry.blob = new Blob(parts); }, async abort() {} };
      }
    };
  }
  async removeEntry(name) { if (!this.files.delete(name)) throw missing(); }
  async *entries() { yield* this.files; }
}
