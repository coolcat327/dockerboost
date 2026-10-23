import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCacheDirectories, protectCacheJob } from '../src/client/common/browser-download-task.js';
const clearInstallCache = (root, locks) => clearCacheDirectories(root, { matches: name => name.startsWith('dockerboost-install-'), locks });
test('cleanup deletes abandoned installation jobs and preserves unrelated and active jobs', async () => {
  const removed = [];
  const root = {
    async *entries() { for (const name of ['dockerboost-install-old','dockerboost-install-live','dockerboost-export','other']) yield [name, {}]; },
    async removeEntry(name, options) { assert.equal(options.recursive,true); removed.push(name); }
  };
  const release = await protectCacheJob('dockerboost-install-live', null);
  await clearInstallCache(root,null);
  assert.deepEqual(removed,['dockerboost-install-old']);
  await release(); removed.length = 0;
  await clearInstallCache(root,null);
  assert.deepEqual(removed,['dockerboost-install-old','dockerboost-install-live']);
});
test('cleanup skips jobs locked by another tab', async () => {
  let removed = false;
  const root = { async *entries() { yield ['dockerboost-install-other-tab',{}]; }, async removeEntry() { removed=true; } };
  const locks = { async request(name, options, callback) { assert.equal(options.ifAvailable,true); await callback(null); } };
  await clearInstallCache(root, locks);
  assert.equal(removed,false);
});

test('image cache cleanup retains the current session and skips active sessions', async () => {
  const removed = [];
  const root = {
    async *entries() { for (const name of ['old','current','other-tab']) yield [name,{}]; },
    async removeEntry(name) { removed.push(name); }
  };
  const release = await protectCacheJob('dockerboost-export-session-other-tab', null);
  await clearCacheDirectories(root, { keep:new Set(['current']), lockName:name => `dockerboost-export-session-${name}`, locks:null });
  assert.deepEqual(removed,['old']);
  await release();
});

test('archive saving starts a download and cleans up only after handoff delay', async () => {
  const { saveArchive } = await import('../src/client/common/browser-download-task.js');
  const events = [];
  let callback;
  saveArchive(new Blob(['archive']), 'bundle.tar', async () => { events.push('cleanup'); }, {
    urlApi:{ createObjectURL() { return 'blob:test'; }, revokeObjectURL() { events.push('revoke'); } },
    doc:{ body:{ append() {} }, createElement() { return { click() { events.push('download'); }, remove() {} }; } },
    schedule(fn, delay) { assert.equal(delay,60000); callback=fn; }
  });
  assert.deepEqual(events,['download']);
  callback(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events,['download','revoke','cleanup']);
});

test('download tasks own both successful handoff and failed-job cleanup', async () => {
  const { createDownloadTask } = await import('../src/client/common/browser-download-task.js');
  const removed = [], directories = new Set();
  const jobs = {
    async *entries() { for (const name of directories) yield [name,{}]; },
    async getDirectoryHandle(name) { directories.add(name); return {}; },
    async removeEntry(name) { removed.push(name); directories.delete(name); }
  };
  const root = {
    async *entries() {},
    async getDirectoryHandle(name) {
      if (name === 'dockerboost-downloads') return jobs;
      throw Object.assign(new Error('missing'), { name:'NotFoundError' });
    }
  };
  const storage = { async getDirectory() { return root; } };
  let handoffCleanup;
  const options = { storage, locks:null, id:'test', save(archive, filename, cleanup) { handoffCleanup=cleanup; } };
  const success = await createDownloadTask('install',options);
  success.save(new Blob(['bundle']),'bundle.tar');
  await success.finish();
  assert.deepEqual(removed,[]);
  await handoffCleanup();
  assert.deepEqual(removed,['install-test']);
  const failure = await createDownloadTask('image',options);
  await failure.finish(); await failure.finish();
  assert.deepEqual(removed,['install-test','image-test']);
});

test('concurrent cache sweeps tolerate an abandoned directory already removed by another sweep', async () => {
  let removed = false;
  const root = {
    async *entries() { yield ['old', {}]; },
    async removeEntry() {
      if (removed) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      removed = true;
    }
  };
  await Promise.all([clearCacheDirectories(root, { locks:null }), clearCacheDirectories(root, { locks:null })]);
  assert.equal(removed, true);
  root.removeEntry = async () => { throw new Error('permission denied'); };
  await assert.rejects(clearCacheDirectories(root, { locks:null }), /permission denied/);
});
