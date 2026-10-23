import test from 'node:test';
import assert from 'node:assert/strict';
import { matchBatchPlatform } from '../src/client/features/download/batch-platform.js';

test('bulk architecture resolves to the actual platform including its variant', () => {
  const platforms = ['linux/amd64', 'linux/arm/v7', 'linux/arm64/v8', 'linux/s390x'];
  assert.equal(matchBatchPlatform(platforms, 'linux/arm64'), 'linux/arm64/v8');
  assert.equal(matchBatchPlatform(platforms, 'linux/amd64'), 'linux/amd64');
  assert.equal(matchBatchPlatform(platforms, 'linux/arm/v7'), 'linux/arm/v7');
  assert.equal(matchBatchPlatform(platforms, 'linux/s390x'), 'linux/s390x');
  assert.equal(matchBatchPlatform(platforms, 'linux/arm64/v9'), '');
  assert.equal(matchBatchPlatform(['linux/arm/v7'], 'linux/arm64'), '');
  assert.equal(matchBatchPlatform(['windows/arm64'], 'linux/arm64'), '');
  assert.equal(matchBatchPlatform([], 'linux/arm64'), '');
});

test('exact platform is preferred over a variant even when returned later', () => {
  assert.equal(matchBatchPlatform(['linux/arm64/v8', 'linux/arm64'], 'linux/arm64'), 'linux/arm64');
});
