import test from 'node:test';
import assert from 'node:assert/strict';
import { commands, searchCommands } from '../src/client/features/manual/catalog.js';
test('catalog contains distinct Docker and Compose entries with bilingual content and official links', () => {
  assert.equal(new Set(commands.map(command => command.id)).size, commands.length);
  for (const family of ['docker', 'compose']) {
    assert.ok(commands.filter(command => command.family === family).length >= 15);
    for (const word of ['run', 'logs', 'exec']) assert.ok(searchCommands(word, family).length);
  }
  for (const item of commands) {
    assert.ok(item.summary['zh-CN']); assert.ok(item.summary.en); assert.ok(item.examples.length);
    assert.ok(item.usage); assert.equal(new URL(item.url).hostname, 'docs.docker.com');
  }
});
test('search matches commands, Chinese or English tasks, and options within the selected scope', () => {
  assert.ok(searchCommands('端口', 'docker').some(item => item.command === 'docker run'));
  assert.ok(searchCommands('logs --tail', 'compose').some(item => item.command === 'docker compose logs'));
  assert.ok(searchCommands('BUILD --no-cache', 'compose').some(item => item.command === 'docker compose build'));
  assert.ok(searchCommands('ports', 'docker').length);
  assert.deepEqual(searchCommands('no-such-command-xyz'), []);
  assert.equal(searchCommands('   ').length, commands.length);
});
