import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
const { outputFiles } = await build({ stdin: { contents: "export * from './src/api/routes/install/handlers'; export * from './src/api/routes/install/bundle';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { catalogResponse, assetResponse, planResponse, scriptResponse, installFiles } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const handlers = { catalog: catalogResponse, asset: assetResponse, plan: planResponse, script: scriptResponse };
const req = async path => {
  const request = new Request(`https://example.com/api/install/${path}`);
  return handlers[new URL(request.url).pathname.split('/').at(-1)](request);
};
test('generated installer and download script are valid Bash and contain required files', async () => {
  const files = installFiles('aarch64', '28.1.1', '2.35.1', 'https://example.com');
  assert.equal(spawnSync('bash', ['-n'], { input: files['offline_install_docker.sh'] }).status, 0);
  assert.deepEqual(JSON.parse(files['daemon.json'])['registry-mirrors'], []);
  assert.doesNotMatch(files['offline_install_docker.sh'], /https:\/\/example\.com/);
  assert.match(files['offline_install_docker.sh'], /answer="\$2"/);
  assert.doesNotMatch(files['readme.md'], /juejin/);
  assert.match(files['readme.md'], /手动安装 Docker/);
  assert.match(files['readme.md'], /作者：coolcat/);
  assert.match(files['readme.md'], /网站：https:\/\/example\.com/);
  assert.match(files['readme.md'], /Linux aarch64.*Docker Engine 28\.1\.1.*Docker Compose 2\.35\.1/);
  assert.match(files['offline_install_docker.sh'], /cli-plugins\/docker-compose/);
  assert.match(files['offline_install_docker.sh'], /--validate/);
  assert.match(files['offline_install_docker.sh'], /install -m 755 "\$work"\/docker\/\* \/usr\/bin\//);
  assert.match(files['docker.service'], /ExecStart=\/usr\/bin\/dockerd/);
  assert.doesNotMatch(files['offline_install_docker.sh'], /\/usr\/local\/bin/);
  const response = await req(`script?arch=aarch64&docker=28.1.1&compose=2.35.1&version=Abcd123_`);
  const script = await response.text();
  assert.equal(spawnSync('sh', ['-n'], { input: script }).status, 0);
  const downloads = [...script.matchAll(/^curl .*'(https:\/\/[^']+)' -o /gm)].map(match => new URL(match[1]));
  assert.equal(downloads.length, 2);
  assert.deepEqual(downloads.map(url => url.searchParams.get('kind')), ['docker', 'compose']);
  for (const url of downloads) {
    assert.equal(url.origin, 'https://example.com');
    assert.equal(url.pathname, '/api/install/asset');
    assert.equal(url.searchParams.get('arch'), 'aarch64');
    assert.equal(url.searchParams.get('docker'), '28.1.1');
    assert.equal(url.searchParams.get('compose'), '2.35.1');
    assert.equal(url.searchParams.get('version'), 'Abcd123_');
  }
  assert.match(script, /SHA256SUMS/);
  assert.equal(response.status, 200);
  assert.doesNotMatch(script, /expires=/);
});
test('invalid inputs fail before fetching', async () => {
  for (const path of ['plan?arch=nope', 'plan?docker=1;id&compose=2.0.0', 'asset?docker=28.1.1&compose=2.35.1&kind=other']) await assert.rejects(req(path));
});
test('catalog uses the latest official release without the GitHub API', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const value = String(url);
    assert.ok(!value.includes('api.github.com'));
    if (value.endsWith('/latest')) {
      const response = new Response('release');
      Object.defineProperty(response, 'url', { value:'https://github.com/docker/compose/releases/tag/v2.35.1' });
      return response;
    }
    if (value.includes('/expanded_assets/')) return new Response('<a href="/docker/compose/releases/download/v2.35.1/docker-compose-linux-armv7">asset</a>');
    return new Response('<a href="docker-28.1.1.tgz"></a>');
  });
  assert.deepEqual(await (await req('catalog?arch=armhf')).json(), { docker:['28.1.1'], compose:'2.35.1' });
  await assert.rejects(req('catalog?arch=aarch64'), /没有 aarch64/);
});
test('asset returns upstream stream without buffering', async t => {
  const upstream = new Response('binary');
  t.mock.method(globalThis,'fetch', async url => { assert.match(String(url), /docker-compose-linux-x86_64$/); return upstream; });
  assert.equal((await req('asset?docker=28.1.1&compose=2.35.1&kind=compose')).body, upstream.body);
});

test('download script creates a complete verifiable tar without installing on download host', async () => {
  const { mkdtemp, writeFile, mkdir, rm, access, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'dockerboost-install-'));
  try {
    await mkdir(join(dir,'bin'));
    const scratch = join(dir, 'scratch');
    await mkdir(scratch);
    await writeFile(join(dir,'bin/curl'), '#!/usr/bin/env bash\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then printf binary > "$2"; exit; fi; shift; done\nexit 1\n', { mode:0o755 });
    const script = await (await req(`script?docker=28.1.1&compose=2.35.1`)).text();
    await writeFile(join(dir, '.download-docker.sh'), script, { mode: 0o755 });
    const result = spawnSync('sh', ['.download-docker.sh'], { cwd:dir, env:{ ...process.env, TMPDIR: scratch, PATH:`${join(dir,'bin')}:${process.env.PATH}` }, encoding:'utf8' });
    assert.equal(result.status,0,result.stderr);
    await assert.rejects(access(join(dir, '.download-docker.sh')), { code: 'ENOENT' });
    assert.deepEqual(await readdir(scratch), []);
    const archive = join(dir,'docker-offline-x86_64-docker-28.1.1-compose-2.35.1.tar');
    const listing = spawnSync('tar',['-tf',archive], { encoding:'utf8' });
    for (const file of ['readme.md','daemon.json','docker.service','offline_install_docker.sh','docker-compose','docker-28.1.1.tgz','SHA256SUMS']) assert.ok(listing.stdout.includes(file),file);
    spawnSync('tar',['-xf',archive],{ cwd:dir });
    assert.equal(spawnSync('sha256sum',['-c','SHA256SUMS'],{ cwd:dir }).status,0);
    await writeFile(join(dir, 'bin/curl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await writeFile(join(dir, '.download-docker.sh'), script);
    const failed = spawnSync('sh', ['.download-docker.sh'], {
      cwd: dir, env: { ...process.env, TMPDIR: scratch, PATH: `${join(dir, 'bin')}:${process.env.PATH}` }
    });
    assert.notEqual(failed.status, 0);
    await assert.rejects(access(join(dir, '.download-docker.sh')), { code: 'ENOENT' });
    assert.deepEqual(await readdir(scratch), []);
    await access(archive);

  } finally { await rm(dir,{ recursive:true,force:true }); }
});


test('pre-install validation resolves the bundled proxy before any system files are installed', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const temp = await mkdtemp(join(tmpdir(), 'docker-proxy-validation-'));
  try {
    await mkdir(join(temp, 'docker'));
    await writeFile(join(temp, 'docker', 'docker-proxy'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await writeFile(join(temp, 'docker-compose'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    // Reproduce dockerd's executable-path validation without running a Linux daemon on macOS.
    await writeFile(join(temp, 'docker', 'dockerd'), `#!/usr/bin/env bash
if [ "$1" = --version ]; then exit 0; fi
config="\${2#--config-file=}"
proxy=$(sed -n 's/.*"userland-proxy-path": "\\([^"]*\\)".*/\\1/p' "$config")
if [ -z "$proxy" ]; then
  echo 'invalid userland-proxy-path: userland-proxy is enabled, but userland-proxy-path is not set' >&2
  exit 1
fi
[[ "$proxy" = /* && -x "$proxy" ]] || exit 2
`, { mode: 0o755 });
    assert.equal(spawnSync('tar', ['-czf', 'docker-29.9.0.tgz', 'docker'], { cwd: temp }).status, 0);
    const files = installFiles('x86_64', '29.9.0', '5.6.0', 'https://example.com');
    const installer = files['offline_install_docker.sh'];
    const start = installer.indexOf('work=$(mktemp -d)');
    const end = installer.indexOf('# Configuration validation succeeded.');
    const result = spawnSync('bash', ['-euo', 'pipefail'], {
      cwd: temp, encoding: 'utf8',
      input: `data_root=/var/lib/docker\nmirror=\nlog_size=10m\nlog_files=3\nlive=true\n${installer.slice(start, end)}\ncat "$work/daemon.json"\n`
    });
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.equal(config['userland-proxy-path'], '/usr/bin/docker-proxy');
    assert.deepEqual(config['registry-mirrors'], []);
    assert.equal(JSON.parse(files['daemon.json'])['userland-proxy-path'], '/usr/bin/docker-proxy');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('missing firewall utilities stop the installer before unpacking or system changes', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'dockerboost-preflight-'));
  try {
    await mkdir(join(dir, 'bin'));
    for (const [name, body] of [['dirname', 'echo .'], ['id', 'echo 0'], ['systemctl', 'exit 0'], ['tar', 'exit 0']]) {
      await writeFile(join(dir, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    }
    const script = installFiles('x86_64', '29.9.0', '5.6.0', 'https://example.com')['offline_install_docker.sh'];
    const result = spawnSync('/bin/bash', ['-c', script], { cwd: dir, env: { ...process.env, PATH: join(dir, 'bin') }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /缺少 iptables/);
    assert.match(result.stderr, /离线主机需提前准备/);
    assert.doesNotMatch(result.stdout, /数据目录/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('installer prompts and validation accept defaults in sh and bash', () => {
  const installer = installFiles('x86_64', '29.9.0', '5.6.0', 'https://example.com')['offline_install_docker.sh'];
  const prompts = installer.slice(installer.indexOf('ask() {'), installer.indexOf('# Use a disposable directory'));
  for (const shell of ['sh', 'bash', '/bin/dash']) {
    for (const [input, expected, error] of [
      ['\n\n\n\n\n', '/var/lib/docker||10m|3|true', ''],
      ['/srv/docker\nhttps://mirror.example\n20m\n5\nfalse\n', '/srv/docker|https://mirror.example|20m|5|false', ''],
      ['/bad path\n', '', '数据目录无效'],
      ['\ninvalid\n', '', '镜像地址无效'],
      ['\n\n0m\n', '', '日志大小无效'],
      ['\n\n\n0\n', '', '日志数量无效'],
      ['\n\n\n\ninvalid\n', '', '请输入 true 或 false']
    ]) {
      const result = spawnSync(shell, ['-c', `set -eu
fail() { printf '%s\\n' "$*" >&2; exit 1; }
${prompts}
printf '%s|%s|%s|%s|%s' "$data_root" "$mirror" "$log_size" "$log_files" "$live"
`], { input, encoding: 'utf8' });
      assert.equal(result.status, error ? 1 : 0, `${shell}: ${result.stderr}`);
      assert.doesNotMatch(result.stderr, /not found|Illegal option/);
      if (error) assert.ok(result.stderr.includes(error), result.stderr);
      else assert.ok(result.stdout.endsWith(expected), result.stdout);
    }
  }
});
