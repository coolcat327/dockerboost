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
