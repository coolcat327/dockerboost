import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePastedPull } from '../src/client/common/image-input.js';

test('extracts a single pull reference, preserving its tag', () => {
  assert.equal(parsePastedPull('docker pull nginx:alpine').image, 'nginx:alpine');
  assert.equal(parsePastedPull('docker pull --platform linux/arm64 docker.io/library/nginx:latest').image, 'library/nginx:latest');
});

test('extracts an explicit platform and rejects malformed platform options', () => {
  assert.deepEqual(parsePastedPull('docker pull --platform=linux/arm64 nginx:latest'), { image: 'nginx:latest', platform: 'linux/arm64' });
  assert.deepEqual(parsePastedPull('docker pull --platform "linux/arm64/v8" nginx'), { image: 'nginx', platform: 'linux/arm64/v8' });
  for (const command of ['docker pull --platform= nginx', 'docker pull --platform not-a-platform nginx', 'docker pull --platform']) assert.throws(() => parsePastedPull(command), /platform/);
});

test('rejects multiple commands or references', () => {
  for (const value of ['docker pull nginx; echo bad', 'docker pull nginx redis', 'docker pull nginx\ndocker pull redis']) {
    assert.throws(() => parsePastedPull(value));
  }
});
