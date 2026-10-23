import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { batchCommands } from '../src/client/features/download/compose.js';

for (const failure of ['', 'fetch', 'execute']) {
  test(`batch terminal helper runs real shell, preserves parameters and cleans up (${failure || 'success'})`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dockerboost-batch-'));
    try {
      await mkdir(join(dir, 'bin'));
      await mkdir(join(dir, 'tmp'));
      const log = join(dir, 'requests.jsonl');
      await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const output = args[args.indexOf('-o') + 1];
if (args.at(-1).endsWith('/download-images.sh')) {
  fs.copyFileSync(process.env.HELPER, output);
} else {
  const count = fs.existsSync(process.env.LOG) ? fs.readFileSync(process.env.LOG, 'utf8').trim().split('\\n').length : 0;
  fs.appendFileSync(process.env.LOG, JSON.stringify(args) + '\\n');
  if (process.env.FAILURE === 'fetch' && count === 0) process.exit(22);
  fs.writeFileSync(output, '#!/bin/sh\\nexit ' + (process.env.FAILURE === 'execute' && count === 0 ? '7' : '0') + '\\n');
}
`, { mode: 0o755 });
      const entries = [
        { image: 'nginx:latest', platform: 'linux/arm64/v8', source: "mirror' $(touch injected)\nvalue" },
        { image: `redis@sha256:${'a'.repeat(64)}`, platform: 'linux/amd64', source: 'auto' },
      ];
      const result = spawnSync('sh', ['-c', batchCommands(entries, 'https://example.com')], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, TMPDIR: join(dir, 'tmp'), LOG: log, FAILURE: failure, HELPER: resolve('public/download-images.sh') },
      });
      assert.equal(result.status, failure === 'fetch' ? 22 : failure === 'execute' ? 7 : 0, result.stderr);
      const requests = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
      assert.equal(requests.length, failure ? 1 : 2, 'Failure must prevent later downloads');
      for (const [index, args] of requests.entries()) {
        assert.ok(args.includes('--get'));
        for (const [key, value] of Object.entries(entries[index])) assert.ok(args.includes(`${key}=${value}`));
        assert.equal(args.at(-1), 'https://example.com/api/download-script');
      }
      assert.deepEqual(await readdir(join(dir, 'tmp')), []);
      assert.ok(!(await readdir(dir)).includes('.download-images.sh'));
      assert.ok(!(await readdir(dir)).includes('injected'), 'Arguments must never execute shell input');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
