import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveFilename, imageReference } from '../src/client/common/image-reference.js';

const context = { mirrorHost: 'docker.example', acceleratedSource: 'mirror-gcr', sources: [
  { id: 'mirror-gcr', label: 'mirror.gcr.io', host: 'mirror.gcr.io', naming: 'docker-hub', requiresNamespace: false },
  { id: 'ghcr', label: 'ghcr.io', host: 'ghcr.io', naming: 'native', requiresNamespace: true },
  { id: 'k8s', label: 'registry.k8s.io', host: 'registry.k8s.io', naming: 'native', requiresNamespace: false }
] };

test('normalizes Docker Hub shorthand and preserves tags', () => {
  const image = imageReference('redis:7-alpine', { ...context, source: 'auto' });
  assert.match(image.accelerated, /^docker\.example\/[a-z0-9]/, 'Docker repository path must start with an alphanumeric character');
  assert.deepEqual(image, {
    original: 'redis:7-alpine', repository: 'library/redis', reference: '7-alpine', source: 'auto',
    upstream: 'library/redis:7-alpine', accelerated: 'docker.example/r/mirror-gcr/library/redis:7-alpine'
  });
});

test('matches a pasted registry.k8s.io reference to the k8s source', () => {
  const image = imageReference('registry.k8s.io/kube-proxy:v1.28.4', { ...context, source: 'auto', acceleratedSource: 'k8s' });
  assert.deepEqual(image, {
    original: 'registry.k8s.io/kube-proxy:v1.28.4', repository: 'kube-proxy', reference: 'v1.28.4', source: 'k8s',
    upstream: 'kube-proxy:v1.28.4', accelerated: 'docker.example/r/k8s/kube-proxy:v1.28.4'
  });
});

test('keeps native registry repository paths and rejects missing namespaces', () => {
  const image = imageReference('owner/image@sha256:abc', { ...context, source: 'ghcr', acceleratedSource: 'ghcr' });
  assert.equal(image.repository, 'owner/image');
  assert.equal(image.accelerated, 'docker.example/r/ghcr/owner/image@sha256:abc');
  assert.throws(() => imageReference('redis', { ...context, source: 'ghcr' }), /ghcr\.io/);
});

test('uses configured repository rules for a newly added source', () => {
  const sources = [...context.sources, { id: 'custom', label: 'custom.example', host: 'custom.example', naming: 'docker-hub', requiresNamespace: false }];
  const image = imageReference('alpine:3', { ...context, sources, source: 'custom', acceleratedSource: 'custom' });
  assert.equal(image.repository, 'library/alpine');
  assert.equal(image.accelerated, 'docker.example/r/custom/library/alpine:3');
});

test('qualified registry hosts select their source and reject conflicting selectors', () => {
  const hub = imageReference('docker.io/nginx:latest', { ...context, source: 'auto' });
  assert.equal(hub.source, 'mirror-gcr');
  assert.equal(hub.repository, 'library/nginx');
  const ghcr = imageReference('ghcr.io/team/app:1', { ...context, source: 'auto', acceleratedSource: 'ghcr' });
  assert.equal(ghcr.source, 'ghcr');
  assert.equal(ghcr.repository, 'team/app');
  assert.throws(() => imageReference('ghcr.io/team/app:1', { ...context, source: 'k8s' }), /不一致/);
  assert.throws(() => imageReference('docker.io/nginx', { ...context, source: 'k8s' }), /不一致/);
});

test('creates safe archive filenames', () => {
  assert.equal(archiveFilename('owner/image:1.0', 'linux/arm64'), 'owner_image_1.0_linux_arm64.tar');
  assert.equal(archiveFilename('library/postgres:18', 'linux/arm64/v8'), 'postgres_18_linux_arm64_v8.tar');
});
