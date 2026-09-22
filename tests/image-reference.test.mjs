import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveFilename, imageReference } from '../src/client/image-reference.js';

const context = { mirrorHost: 'docker.example', acceleratedSource: 'mirror-gcr', sources: [{ id: 'ghcr', label: 'ghcr.io', host: 'ghcr.io' }, { id: 'k8s', label: 'registry.k8s.io', host: 'registry.k8s.io' }] };

test('normalizes Docker Hub shorthand and preserves tags', () => {
  const image = imageReference('redis:7-alpine', { ...context, source: 'auto' });
  assert.deepEqual(image, {
    original: 'redis:7-alpine', repository: 'library/redis', reference: '7-alpine', source: 'auto',
    upstream: 'library/redis:7-alpine', accelerated: 'docker.example/mirror-gcr/library/redis:7-alpine'
  });
});

test('matches a pasted registry.k8s.io reference to the k8s source', () => {
  const image = imageReference('registry.k8s.io/kube-proxy:v1.28.4', { ...context, source: 'auto', acceleratedSource: 'k8s' });
  assert.deepEqual(image, {
    original: 'registry.k8s.io/kube-proxy:v1.28.4', repository: 'kube-proxy', reference: 'v1.28.4', source: 'k8s',
    upstream: 'kube-proxy:v1.28.4', accelerated: 'docker.example/k8s/kube-proxy:v1.28.4'
  });
});

test('keeps native registry repository paths and rejects missing namespaces', () => {
  const image = imageReference('owner/image@sha256:abc', { ...context, source: 'ghcr', acceleratedSource: 'ghcr' });
  assert.equal(image.repository, 'owner/image');
  assert.equal(image.accelerated, 'docker.example/ghcr/owner/image@sha256:abc');
  assert.throws(() => imageReference('redis', { ...context, source: 'ghcr' }), /ghcr\.io/);
});

test('creates safe archive filenames', () => {
  assert.equal(archiveFilename('owner/image:1.0', 'linux/arm64'), 'owner_image_1.0_linux_arm64.tar');
});
