import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSetupCommand } from '../src/client/features/setup/setup-command.js';

test('pasting setup command without jq leaves the current shell open', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dockerboost-setup-'));
  try {
    const config = join(dir, 'daemon.json');
    const script = join(dir, 'setup.sh');
    writeFileSync(config, '{}\n');
    writeFileSync(script, createSetupCommand('https://mirror.example', config));
    const result = spawnSync('/bin/sh', ['-c', '. "$1"; printf "shell-alive\n"', 'sh', script], {
      encoding: 'utf8',
      env: { PATH: dir },
    });
    assert.match(result.stderr, /jq is required/);
    assert.match(result.stdout, /shell-alive/);
    assert.equal(readFileSync(config, 'utf8'), '{}\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup command backs up the original config before replacing it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dockerboost-setup-'));
  try {
    const config = join(dir, 'daemon.json');
    const script = join(dir, 'setup.sh');
    const original = '{"debug":true}\n';
    const updated = '{"debug":true,"registry-mirrors":["https://mirror.example"]}\n';
    writeFileSync(config, original);
    writeFileSync(script, createSetupCommand('https://mirror.example', config));
    writeFileSync(join(dir, 'jq'), `#!/bin/sh\nprintf '%s\\n' '${updated.trim()}'\n`);
    writeFileSync(join(dir, 'systemctl'), '#!/bin/sh\n[ "$1 $2" = "restart docker" ]\n');
    chmodSync(join(dir, 'jq'), 0o755);
    chmodSync(join(dir, 'systemctl'), 0o755);
    const result = spawnSync('/bin/sh', [script], {
      encoding: 'utf8',
      env: { PATH: `${dir}:/usr/bin:/bin` },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(config, 'utf8'), updated);
    assert.equal(readFileSync(`${config}.bak`, 'utf8'), original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('jq failure leaves the config and backup untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dockerboost-setup-'));
  try {
    const config = join(dir, 'daemon.json');
    const script = join(dir, 'setup.sh');
    writeFileSync(config, '{"debug":true}\n');
    writeFileSync(script, createSetupCommand('https://mirror.example', config));
    writeFileSync(join(dir, 'jq'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(dir, 'jq'), 0o755);
    const result = spawnSync('/bin/sh', [script], {
      encoding: 'utf8',
      env: { PATH: `${dir}:/usr/bin:/bin` },
    });
    assert.equal(result.status, 1);
    assert.equal(readFileSync(config, 'utf8'), '{"debug":true}\n');
    assert.equal(existsSync(`${config}.bak`), false);
    assert.deepEqual(readdirSync(dir).sort(), ['daemon.json', 'jq', 'setup.sh']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('existing daemon.json.tmp is never overwritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dockerboost-setup-'));
  try {
    const config = join(dir, 'daemon.json');
    const script = join(dir, 'setup.sh');
    const temp = join(dir, 'daemon.json.tmp');
    writeFileSync(config, '{}\n');
    writeFileSync(temp, 'keep me\n');
    writeFileSync(script, createSetupCommand('https://mirror.example', config));
    writeFileSync(join(dir, 'jq'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'jq'), 0o755);
    const result = spawnSync('/bin/sh', [script], {
      encoding: 'utf8',
      env: { PATH: `${dir}:/usr/bin:/bin` },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /daemon\.json\.tmp already exists/);
    assert.equal(readFileSync(temp, 'utf8'), 'keep me\n');
    assert.equal(readFileSync(config, 'utf8'), '{}\n');
    assert.equal(existsSync(`${config}.bak`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test('setup command only adds the current site and preserves existing mirrors in order', (t) => {
  const jq = spawnSync('jq', ['--version']);
  if (jq.status !== 0) { t.skip('jq is not installed'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'dockerboost-setup-'));
  try {
    const config = join(dir, 'daemon.json');
    const origin = 'https://mirror.example';
    const existing = ['https://existing.example', 'https://docker.1ms.run'];
    writeFileSync(config, JSON.stringify({ debug: true, 'registry-mirrors': [origin, ...existing, origin] }));
    writeFileSync(join(dir, 'systemctl'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'systemctl'), 0o755);
    const result = spawnSync('/bin/sh', ['-c', createSetupCommand(origin, config)], {
      encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    const updated = JSON.parse(readFileSync(config, 'utf8'));
    assert.deepEqual(updated['registry-mirrors'], [...existing, origin]);
    assert.equal(updated.debug, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('setup command treats quotes and shell syntax in values as literal data', t => {
  if (spawnSync('jq', ['--version']).status !== 0) { t.skip('jq is not installed'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'dockerboost-setup-quote-'));
  try {
    const config = join(dir, "daemon '$(touch PWNED).json");
    const origin = "https://a'b.example/$(touch PWNED)";
    writeFileSync(config, '{}\n');
    writeFileSync(join(dir, 'systemctl'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'systemctl'), 0o755);
    const result = spawnSync('/bin/sh', ['-c', createSetupCommand(origin, config)], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(config, 'utf8'))['registry-mirrors'], [origin]);
    assert.equal(existsSync(join(dir, 'PWNED')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
