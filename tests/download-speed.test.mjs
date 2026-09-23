import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransferRate, formatDuration, formatTransferSpeed } from '../src/client/download-speed.js';

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
