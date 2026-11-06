import { build } from 'esbuild';
import { readFile, mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const { outputFiles } = await build({ entryPoints: [new URL('../src/api/routes/download/image-archive-script.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { downloadScript } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
const temp = await mkdtemp(join(tmpdir(), 'dockerboost-script-test-'));
try {
  const bin = join(temp, 'bin');
  await mkdir(bin);
  // Substitute transport only; run the generated shell and real tar unchanged.
  await writeFile(join(bin, 'curl'), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "--output" ]; then printf abc > "$2"; shift 2; else shift; fi\ndone\n', { mode: 0o755 });
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  const layer = { digest: `sha256:${'b'.repeat(64)}`, size: 3 };
  assert.throws(() => downloadScript('https://mirror.example', 'library/nginx', 'nginx:latest', config, [layer, { ...layer, size: 4 }]), /大小冲突/);
  const script = downloadScript('https://mirror.example', 'library/nginx', 'nginx:latest', config, [layer]);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const run = (input) => spawnSync('sh', [], { cwd: temp, env, input, encoding: 'utf8' });
  const scriptFile = join(temp, '.download-image.sh');
  await writeFile(scriptFile, script, { mode: 0o755 });
  const result = spawnSync('sh', ['.download-image.sh'], { cwd: temp, env, encoding: 'utf8' });
  await assert.rejects(readFile(scriptFile), { code: 'ENOENT' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Downloading 2 blobs/);
  assert.match(result.stdout, /Verified 2 blobs/);
  assert.doesNotMatch(result.stdout, /\[1\/2\] Downloading/);
  assert.match(script, /--progress-bar/);
  assert.match(script, /--parallel/);
  assert.match(script, /--parallel-max 5/);
  const archive = join(temp, 'nginx_latest_linux_amd64.tar');
  const metadata = spawnSync('tar', ['-xOf', archive, 'manifest.json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(metadata.stdout)[0].RepoTags, ['nginx:latest']);
  const blob = spawnSync('tar', ['-xOf', archive, `blobs/sha256/${'b'.repeat(64)}`], { encoding: 'utf8' });
  assert.equal(blob.stdout, 'abc');
  assert.notEqual(run(script).status, 0, 'Existing archive must not be overwritten');
  // Another process can create the output after the initial existence check.
  const realTar = spawnSync('which', ['tar'], { encoding: 'utf8' }).stdout.trim();
  await writeFile(join(bin, 'tar'), `#!/bin/sh\n${realTar} "$@"\nprintf competing > "$PWD/nginx_race_linux_amd64.tar"\n`, { mode: 0o755 });
  const race = run(downloadScript('https://mirror.example', 'library/nginx', 'nginx:race', config, [layer]));
  assert.notEqual(race.status, 0, 'A concurrent archive must not be reported as saved');
  assert.match(race.stderr, /File already exists/);
  assert.doesNotMatch(race.stdout, /Saved:/);
  assert.equal(await readFile(join(temp, 'nginx_race_linux_amd64.tar'), 'utf8'), 'competing');
  await rm(join(bin, 'tar'));
  const longImage = `${'a'.repeat(200)}/${'b'.repeat(40)}:${'t'.repeat(40)}`;
  const longResult = run(downloadScript('https://mirror.example', 'library/nginx', longImage, config, [layer]));
  assert.equal(longResult.status, 0, longResult.stderr);
  const longArchive = (await readdir(temp)).find(name => name.startsWith('a'.repeat(100)) && name.endsWith('.tar'));
  assert.ok(longArchive && Buffer.byteLength(longArchive) <= 240);
  const longMetadata = spawnSync('tar', ['-xOf', join(temp, longArchive), 'manifest.json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(longMetadata.stdout)[0].RepoTags, [longImage]);
  const bad = downloadScript('https://mirror.example', 'library/nginx', 'nginx:broken', config, [{ ...layer, size: 4 }]);
  await writeFile(scriptFile, bad, { mode: 0o755 });
  assert.notEqual(spawnSync('sh', ['.download-image.sh'], { cwd: temp, env }).status, 0, 'Truncated layer must fail');
  await assert.rejects(readFile(scriptFile), { code: 'ENOENT' });
  await assert.rejects(readFile(join(temp, 'nginx_broken_linux_amd64.tar')));
  assert.deepEqual((await readdir(temp)).filter(name => name.startsWith('.dockerboost-download.')), []);
  console.log('PASS: shell execution, tar metadata/layers, overwrite refusal, truncated download rejection');
} finally {
  await rm(temp, { recursive: true, force: true });
}
