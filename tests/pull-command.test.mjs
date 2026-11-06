import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pullCommand } from '../src/client/features/pull/pull-command.js';

test('pull command preserves every argument literally without executing shell syntax', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dockerboost-pull-quote-'));
  try {
    writeFileSync(join(dir, 'docker'), `#!${process.execPath}\nrequire('node:fs').appendFileSync(process.env.LOG, JSON.stringify(process.argv.slice(2)) + '\\n');\n`, { mode: 0o755 });
    const image = { accelerated: "host'$(touch PWNED)/r/mock/nginx:latest", original: "nginx'$(touch PWNED):latest" };
    const platform = 'linux/amd64; touch PWNED';
    const result = spawnSync('sh', ['-c', pullCommand(image, platform)], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, LOG: join(dir, 'args') } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(dir, 'PWNED')), false);
    assert.deepEqual(readFileSync(join(dir, 'args'), 'utf8').trim().split('\n').map(JSON.parse), [
      ['pull', '--platform', platform, image.accelerated], ['tag', image.accelerated, image.original], ['image', 'rm', image.accelerated]
    ]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('digest pulls tag only when the original reference includes a tag', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const accelerated = `mirror/r/hub/library/nginx@${digest}`;
  const tagged = pullCommand({ accelerated, original: `nginx:stable@${digest}` }, 'linux/amd64');
  assert.match(tagged, new RegExp(`docker tag '[^']+' 'nginx:stable'`));
  const untagged = pullCommand({ accelerated, original: `nginx@${digest}` }, 'linux/amd64');
  assert.match(untagged, /^docker pull /);
  assert.doesNotMatch(untagged, /docker tag|docker image rm/);
});
