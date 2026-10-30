import test from 'node:test';
import assert from 'node:assert/strict';
import { composeImages, imageList, parseBatchImages } from '../src/client/common/batch-images.js';
import { batchCommands } from '../src/client/features/download/terminal-commands.js';
import { spawnSync } from 'node:child_process';

test('Compose groups services by image and platform, supports YAML aliases', () => {
  const result = composeImages('services:\n  web: &web\n    image: nginx:1.27\n  proxy: *web\n  arm:\n    image: nginx:1.27\n    platform: linux/arm64');
  assert.equal(result.images.length, 2);
  assert.deepEqual(result.images[0].services, ['web', 'proxy']);
  assert.equal(result.images[1].platform, 'linux/arm64');
});
test('Compose reports unresolved, build-only and extended services without losing valid ones', () => {
  const result = composeImages('services:\n  a:\n    image: redis:7\n  b:\n    image: ${IMAGE}\n  c:\n    build: .\n  d:\n    extends: other');
  assert.equal(result.images.length, 1);
  assert.equal(result.issues.length, 3);
});
test('Compose rejects malformed input, duplicate keys, include and invalid services', () => {
  for (const value of ['services: [a]', 'services: hello', 'services: {}\ninclude: other.yml', 'services:\n  a: {}\n  a: {}', 'services: [', 'x'.repeat(1024 * 1024 + 1)]) assert.throws(() => composeImages(value));
  assert.equal(composeImages('services:\n  a:\n    image: "nginx; touch bad"').issues.length, 1);
});
test('Compose preserves digest references and reports malformed platforms', () => {
  const digest = 'sha256:' + 'a'.repeat(64);
  assert.equal(composeImages(`services:\n  a:\n    image: redis@${digest}`).images[0].image, `redis@${digest}`);
  assert.equal(composeImages('services:\n  a:\n    image: nginx\n    platform: 42').issues.length, 1);
});
test('batch terminal command fetches one helper and lists deduplicated image parameters', () => {
  const entry = { image: 'nginx:latest', platform: 'linux/amd64' };
  const command = batchCommands([entry, { ...entry, source: 'auto' }, { ...entry, image: 'redis:7', platform: 'linux/arm64/v8' }], 'https://example.com');
  assert.equal((command.match(/curl -fsSL/g) || []).length, 1);
  assert.match(command, /https:\/\/example.com\/assets\/development\/download-images\.sh/);
  assert.match(command, /'nginx:latest' 'linux\/amd64' 'auto'/);
  assert.match(command, /'redis:7' 'linux\/arm64\/v8' 'auto'/);
  assert.equal((command.match(/'nginx:latest'/g) || []).length, 1);
  assert.equal(spawnSync('sh', ['-n'], { input: command }).status, 0);
  assert.equal(batchCommands([], 'https://example.com'), '');
});


test('batch input accepts Compose and deduplicated image lists', () => {
  assert.equal(parseBatchImages('services:\n  web:\n    image: nginx:latest').images[0].image, 'nginx:latest');
  const result = parseBatchImages(' nginx:latest \r\nredis:7\n\nnginx:latest\nbad image');
  assert.deepEqual(result.images.map(item => item.image), ['nginx:latest', 'redis:7']);
  assert.deepEqual(result.issues, ['Line 5: invalid image']);
  assert.throws(() => imageList('x'.repeat(1024 * 1024 + 1)));
});
