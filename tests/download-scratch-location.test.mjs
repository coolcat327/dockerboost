import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('terminal download scratch directories live beside the script and are removed on failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dockerboost-location-'));
  try {
    const scripts = join(root, 'scripts');
    const cwd = join(root, 'cwd');
    const bin = join(root, 'bin');
    await Promise.all([mkdir(scripts), mkdir(cwd), mkdir(bin)]);
    await writeFile(join(bin, 'curl'), `#!${process.execPath}\nconst fs = require('node:fs');\nfs.writeFileSync(process.env.MARKER, JSON.stringify(fs.readdirSync(process.env.SCRIPTS)));\nprocess.exit(1);\n`, { mode: 0o755 });
    for (const [file, args, prefixes] of [
      ['download-images.sh', ['https://example.com', 'nginx', 'linux/amd64', 'auto'], ['.dockerboost-queue.', '.dockerboost-download.']],
      ['download-docker.sh', ['https://example.com', 'x86_64', '28.1.1', '2.35.1', 'build'], ['.dockerboost-install.']],
    ]) {
      const helper = join(scripts, file);
      await writeFile(helper, await readFile(resolve('public', file)));
      const result = spawnSync('sh', [helper, ...args], { cwd, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MARKER: join(root, 'marker'), SCRIPTS: scripts } });
      assert.notEqual(result.status, 0);
      const during = JSON.parse(await readFile(join(root, 'marker'), 'utf8'));
      for (const prefix of prefixes) assert.ok(during.some(name => name.startsWith(prefix)), `${prefix} missing`);
      assert.deepEqual(await readdir(scripts), []);
      assert.deepEqual(await readdir(cwd), []);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
