const activeJobs = new Set();

// Hold a cross-tab lock until the archive has been handed off and cleaned up.
export async function protectCacheJob(name, locks = navigator.locks) {
  activeJobs.add(name);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let acquired;
  const ready = new Promise(resolve => { acquired = resolve; });
  const task = locks ? locks.request(name, async () => { acquired(); await held; }) : null;
  if (task) await Promise.race([ready, task]);
  return async () => { release(); if (task) await task; activeJobs.delete(name); };
}

export async function clearCacheDirectories(root, { matches = () => true, keep = new Set(), lockName = name => name, locks = navigator.locks } = {}) {
  for await (const [name] of root.entries()) {
    if (!matches(name) || keep.has(name) || activeJobs.has(lockName(name))) continue;
    const remove = () => root.removeEntry(name, { recursive: true });
    if (locks) await locks.request(lockName(name), { ifAvailable: true }, async lock => { if (lock) await remove(); });
    else await remove();
  }
}

// Both download features sweep abandoned jobs using the same lifecycle.
export async function clearDownloadCaches({ storage = navigator.storage, locks = navigator.locks } = {}) {
  if (!storage?.getDirectory) return;
  const root = await storage.getDirectory();
  await clearCacheDirectories(root, { matches: name => name.startsWith('dockerboost-install-'), locks });
  try {
    const jobs = await root.getDirectoryHandle(downloadDirectory);
    await clearCacheDirectories(jobs, { lockName: downloadLock, locks });
  } catch (error) { if (error.name !== 'NotFoundError') throw error; }
  let sessions;
  try {
    const exports = await root.getDirectoryHandle('dockerboost-export');
    sessions = await exports.getDirectoryHandle('sessions');
  } catch (error) {
    if (error.name === 'NotFoundError') return;
    throw error;
  }
  await clearCacheDirectories(sessions, { lockName: name => `dockerboost-export-session-${name}`, locks });
}

// Browsers provide no completion callback for anchor downloads; retain the file briefly.
export function saveArchive(archive, filename, cleanup, { urlApi = URL, doc = document, schedule = setTimeout } = {}) {
  const url = urlApi.createObjectURL(archive);
  try {
    const link = doc.createElement('a');
    link.href = url; link.download = filename;
    doc.body.append(link); link.click(); link.remove();
  } catch (error) { urlApi.revokeObjectURL(url); throw error; }
  schedule(() => {
    urlApi.revokeObjectURL(url);
    void cleanup().catch(() => {});
  }, 60000);
}

export const downloadDirectory = 'dockerboost-downloads';
const downloadLock = name => `${downloadDirectory}:${name}`;

// Feature code owns payload production; this object owns the complete storage lifecycle.
export async function createDownloadTask(kind, { storage = navigator.storage, locks = navigator.locks, id = crypto.randomUUID(), save = saveArchive } = {}) {
  if (!/^[a-z0-9-]+$/.test(kind)) throw new Error('Invalid download task kind');
  await clearDownloadCaches({ storage, locks });
  const root = await storage.getDirectory();
  const jobs = await root.getDirectoryHandle(downloadDirectory, { create: true });
  const name = `${kind}-${id}`;
  const release = await protectCacheJob(downloadLock(name), locks);
  let directory;
  try { directory = await jobs.getDirectoryHandle(name, { create: true }); }
  catch (error) { await release(); throw error; }
  let handedOff = false, disposal;
  const dispose = () => disposal ||= (async () => {
    try { await jobs.removeEntry(name, { recursive: true }); }
    finally { await release(); }
  })();
  return {
    id: name,
    directory,
    save(archive, filename) {
      if (handedOff || disposal) throw new Error('Download task is already finished');
      save(archive, filename, dispose);
      handedOff = true;
    },
    async finish() { if (!handedOff) await dispose(); }
  };
}
