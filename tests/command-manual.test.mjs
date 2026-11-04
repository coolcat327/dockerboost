import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, searchCommands } from '../src/client/features/manual/catalog.js';
const commands = JSON.parse(await readFile(new URL('../public/command-manual.json', import.meta.url), 'utf8'));
const search = (...args) => searchCommands(commands, ...args);
test('catalog contains distinct Docker and Compose entries with bilingual content and official links', () => {
  assert.equal(new Set(commands.map(command => command.id)).size, commands.length);
  for (const family of ['docker', 'compose']) {
    assert.ok(commands.filter(command => command.family === family).length >= 15);
    for (const word of ['run', 'logs', 'exec']) assert.ok(search(word, family).length);
  }
  for (const item of commands) {
    assert.ok(item.summary['zh-CN']); assert.ok(item.summary.en); assert.ok(item.examples.length);
    for (const example of item.examples) { assert.ok(example.code.startsWith(item.command) || (item.command === 'docker compose config' && example.code.startsWith('docker compose -f ') && example.code.endsWith(' config'))); assert.ok(example.description['zh-CN']); assert.ok(example.description.en); }
    assert.ok(item.usage); assert.equal(new URL(item.url).hostname, 'docs.docker.com');
  }
});
test('search matches commands, Chinese or English tasks, and options within the selected scope', () => {
  assert.ok(search('端口', 'docker').some(item => item.command === 'docker run'));
  assert.ok(search('logs --tail', 'compose').some(item => item.command === 'docker compose logs'));
  assert.ok(search('BUILD --no-cache', 'compose').some(item => item.command === 'docker compose build'));
  assert.ok(search('ports', 'docker').length);
  assert.deepEqual(search('no-such-command-xyz'), []);
  assert.equal(search('   ').length, commands.length);
});

test('examples explain the actual log command and can be searched', () => {
  const item = commands.find(command => command.command === 'docker logs');
  assert.equal(item.examples[0].code, 'docker logs --tail 100 -f web');
  assert.match(item.examples[0].description['zh-CN'], /web.*100.*持续/);
  assert.ok(search('日志 100').some(command => command.command === 'docker logs'));
  for (const name of ['docker search', 'docker network inspect', 'docker volume prune', 'docker buildx build', 'docker context use', 'docker service logs']) {
    assert.ok(commands.some(command => command.command === name), name);
  }
});

test('catalog loads on demand from the release directory, retries failures and reuses success', async t => {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(url);
    if (requested.length === 1) return new Response('missing', { status: 404 });
    return Response.json(commands);
  });
  assert.equal(requested.length, 0);
  await assert.rejects(loadCatalog());
  const [first, second] = await Promise.all([loadCatalog(), loadCatalog()]);
  assert.deepEqual(first, commands);
  assert.equal(first, second);
  assert.deepEqual(requested, ['/assets/development/command-manual.json', '/assets/development/command-manual.json']);
  assert.equal(await loadCatalog(), first);
  assert.equal(requested.length, 2);
});
