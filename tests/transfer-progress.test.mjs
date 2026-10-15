import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransferRate, formatDuration, formatImageMetadata, formatImageSize, formatTransferSpeed } from '../src/client/common/transfer-progress.js';

test('formats compressed image size and rejects unknown sizes', () => {
  assert.equal(formatImageSize(3 * 1024 * 1024), '3.0 MB');
  assert.equal(formatImageSize(512 * 1024), '512.0 KB');
  assert.equal(formatImageSize(-1), '');
});

test('formats image size and layer count after the architecture', () => {
  assert.equal(formatImageMetadata({ sizeBytes: 3 * 1024 * 1024, layers: 2 }, '层', ' 共 '), '2 层 共 3.0 MB');
  assert.equal(formatImageMetadata({ sizeBytes: 3 * 1024 * 1024, layers: 2 }, 'layers', ' · '), '2 layers · 3.0 MB');
  assert.equal(formatImageMetadata({ sizeBytes: null, layers: 2 }, 'layers'), '2 layers');
});

test('formats transfer speed in a readable unit', () => {
  assert.equal(formatTransferSpeed(1536), '1.5 KB/s');
  assert.equal(formatTransferSpeed(2.5 * 1024 * 1024), '2.5 MB/s');
});

test('calculates transfer speed from consecutive download updates', () => {
  const times = [1000, 1500, 2000];
  const rate = createTransferRate(() => times.shift());
  assert.equal(rate(0), '');
  assert.equal(rate(512 * 1024), '');
  assert.equal(rate(2 * 1024 * 1024), '2.0 MB/s');
});

test('formats total download time across seconds and minutes', () => {
  assert.equal(formatDuration(1250), '1.3秒');
  assert.equal(formatDuration(61_250), '1分1.3秒');
});
