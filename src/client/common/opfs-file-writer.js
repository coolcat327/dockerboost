// Own the writable lifecycle so failed or stopped writes never commit partial files.
export async function writeOpfsFile(handle, produce, { signal } = {}) {
  signal?.throwIfAborted();
  const writable = await handle.createWritable();
  try {
    signal?.throwIfAborted();
    const result = await produce({
      async write(chunk) {
        signal?.throwIfAborted();
        await writable.write(chunk);
        signal?.throwIfAborted();
      }
    });
    signal?.throwIfAborted();
    await writable.close();
    return result;
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

// Keep hashing, byte validation and progress reporting in each feature's callbacks.
export async function writeOpfsStream(handle, stream, { signal, onChunk, onComplete } = {}) {
  if (!stream) throw new Error('没有返回下载数据流。');
  const reader = stream.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    return await writeOpfsFile(handle, async writable => {
      let received = 0;
      for (;;) {
        signal?.throwIfAborted();
        const { value, done } = await reader.read();
        signal?.throwIfAborted();
        if (done) break;
        await writable.write(value);
        received += value.byteLength;
        await onChunk?.(value, received);
      }
      await onComplete?.(received);
      return received;
    }, { signal });
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
