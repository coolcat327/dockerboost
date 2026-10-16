import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { archiveEntries, writeArchive } from '../src/client/features/download/archive-format.js';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const extract = (archive, name) => {
  const result = spawnSync('tar', ['-xOf', '-', name], { input: archive });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
};

test('browser archive opens as tar and contains consistent OCI and Docker metadata', async () => {
  const config = Buffer.from('{"architecture":"amd64","os":"linux"}');
  const layer = Buffer.from('layer contents');
  const configDigest = sha256(config);
  const layerDigest = sha256(layer);
  const manifest = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { digest: `sha256:${configDigest}`, size: config.length },
    layers: [{ digest: `sha256:${layerDigest}`, size: layer.length }]
  };
  const entries = await archiveEntries(manifest, 'library/nginx', 'latest', 'nginx:latest');
  entries.push([`blobs/sha256/${configDigest}`, new Blob([config])]);
  entries.push([`blobs/sha256/${layerDigest}`, new Blob([layer])]);
  const chunks = [];
  await writeArchive({ write: async (chunk) => chunks.push(Buffer.from(chunk)) }, entries);
  const archive = Buffer.concat(chunks);

  const listing = spawnSync('tar', ['-tf', '-'], { input: archive });
  assert.equal(listing.status, 0, listing.stderr.toString());
  assert.deepEqual(listing.stdout.toString().trim().split('\n'), entries.map(([name]) => name));

  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const manifestDigest = sha256(manifestBytes);
  const index = JSON.parse(extract(archive, 'index.json'));
  const dockerManifest = JSON.parse(extract(archive, 'manifest.json'));
  const repositories = JSON.parse(extract(archive, 'repositories'));
  assert.equal(index.manifests[0].digest, `sha256:${manifestDigest}`);
  assert.equal(index.manifests[0].size, manifestBytes.length);
  assert.equal(index.manifests[0].annotations['org.opencontainers.image.ref.name'], 'nginx:latest');
  assert.equal(dockerManifest[0].Config, `blobs/sha256/${configDigest}`);
  assert.deepEqual(dockerManifest[0].Layers, [`blobs/sha256/${layerDigest}`]);
  assert.deepEqual(dockerManifest[0].RepoTags, ['nginx:latest']);
  assert.equal(repositories['library/nginx'].latest, configDigest);
  assert.deepEqual(extract(archive, `blobs/sha256/${manifestDigest}`), manifestBytes);
  assert.deepEqual(extract(archive, `blobs/sha256/${configDigest}`), config);
  assert.deepEqual(extract(archive, `blobs/sha256/${layerDigest}`), layer);
});

test('library TAR encoding preserves Unicode long paths, empty files and block boundaries', async () => {
  const names = ['empty', 'one', 'before-block', 'block', 'after-block', `${'目录/'.repeat(40)}镜像层.bin`];
  const sizes = [0, 1, 511, 512, 513, 3];
  const entries = names.map((name, index) => [name, new Blob([new Uint8Array(sizes[index]).fill(index)])]);
  const parts = [];
  await writeArchive({ write: async value => parts.push(Buffer.from(value)) }, entries);
  const archive = Buffer.concat(parts);
  const listing = spawnSync('tar', ['-tf', '-'], { input: archive });
  assert.equal(listing.status, 0, listing.stderr.toString());
  assert.deepEqual(listing.stdout.toString().trim().split('\n'), names);
  for (let index = 0; index < entries.length; index++) assert.deepEqual(extract(archive, names[index]), Buffer.alloc(sizes[index], index));
});

test('an archive with an incomplete source aborts the OPFS transaction', async () => {
  const { MemoryDirectory } = await import('./helpers/opfs.mjs');
  const { writeOpfsFile } = await import('../src/client/common/opfs-file-writer.js');
  const handle = await new MemoryDirectory().getFileHandle('archive.tar', { create: true });
  await writeOpfsFile(handle, writer => writer.write(new TextEncoder().encode('previous committed file')));
  const source = { size: 3, stream: () => new Response('ab').body };
  await assert.rejects(writeOpfsFile(handle, writer => writeArchive(writer, [['layer', source]])));
  assert.equal(await (await handle.getFile()).text(), 'previous committed file');
});

test('disk failure cancels the active source before archive production settles', async () => {
  const failure = new Error('disk is full');
  let cancelled = false;
  const source = { size: 16 * 1024 * 1024, stream: () => new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(65536)); },
    cancel() { cancelled = true; }
  }) };
  await assert.rejects(writeArchive({ write: async () => { throw failure; } }, [['layer', source]]), error => error === failure);
  assert.equal(cancelled, true);
});

test('pause during archive output cancels its source and preserves caller-owned close/abort', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const source = { size: 16 * 1024 * 1024, stream: () => new ReadableStream({
    pull(stream) { stream.enqueue(new Uint8Array(65536)); },
    cancel() { cancelled = true; }
  }) };
  await assert.rejects(writeArchive({ write: async () => { controller.abort(); } }, [['layer', source]], { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(cancelled, true);
  const early = new AbortController(); early.abort();
  await assert.rejects(writeArchive({ write() { assert.fail('an aborted archive cannot write'); } }, [], { signal: early.signal }), { name: 'AbortError' });
});
