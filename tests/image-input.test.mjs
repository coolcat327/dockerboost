import test from 'node:test';
import assert from 'node:assert/strict';
import { pastedImage } from '../src/client/shared/image-input.js';

test('extracts a single pull reference, preserving its tag', () => {
  assert.equal(pastedImage('docker pull nginx:alpine'), 'nginx:alpine');
  assert.equal(pastedImage('docker pull --platform linux/arm64 docker.io/library/nginx:latest'), 'library/nginx:latest');
});

test('rejects multiple commands or references', () => {
  for (const value of ['docker pull nginx; echo bad', 'docker pull nginx redis', 'docker pull nginx\ndocker pull redis']) {
    assert.throws(() => pastedImage(value));
  }
});
