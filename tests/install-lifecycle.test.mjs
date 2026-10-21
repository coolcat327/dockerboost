import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, realpath, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const { outputFiles } = await build({ stdin: { contents: "export * from './src/api/routes/install/bundle'", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm' });
const { installFiles } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

async function fixture(t) {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'dockerboost-lifecycle-')));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = join(temp, 'root');
  const bin = join(temp, 'tools');
  for (const dir of [bin, join(temp, 'docker'), ...['usr/bin', 'etc/systemd/system', 'var/lib', 'run'].map(p => join(root, p))]) await mkdir(dir, { recursive: true });
  const exe = (path, body) => writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  await exe(join(bin, 'id'), 'echo 0');
  await exe(join(bin, 'uname'), 'echo x86_64');
  await exe(join(bin, 'pgrep'), '[ "${RESIDUAL_CONTAINER:-}" = yes ]');
  for (const name of ['iptables', 'ip6tables']) await exe(join(bin, name), 'exit 0');
  await exe(join(bin, 'systemctl'), `
echo "$*" >> "$TEST_ROOT/service-calls"
case "$1" in
  cat) [ "\${EXISTING_SERVICE:-}" = yes ]; exit $? ;;
  is-active) [ -f "$TEST_ROOT/service-active" ] || [ "\${SERVICE_ACTIVE:-}" = yes ]; exit $? ;;
  enable)
    mkdir -p "$TEST_ROOT/etc/systemd/system/multi-user.target.wants"
    ln -sf "$TEST_ROOT/etc/systemd/system/docker.service" "$TEST_ROOT/etc/systemd/system/multi-user.target.wants/docker.service"
    [ "\${FAIL_START:-}" != yes ] || exit 1
    touch "$TEST_ROOT/service-active" ;;
  stop) rm -f "$TEST_ROOT/service-active" ;;
  disable) rm -f "$TEST_ROOT/etc/systemd/system/multi-user.target.wants/docker.service" "$TEST_ROOT/service-active" ;;
  *) exit 0 ;;
esac`);
  for (const name of ['docker', 'dockerd', 'docker-proxy', 'containerd', 'runc']) await exe(join(temp, 'docker', name), name === 'docker' ? 'if [ "$1" = --host ]; then shift 2; fi; if [ "$1" = ps ]; then [ "${DOCKER_PS_FAIL:-}" != yes ] || exit 1; [ "${RUNNING_CONTAINERS:-}" != yes ] || echo container-id; exit 0; fi; echo Docker-test' : name === 'dockerd' ? 'if [ "$1" = --validate ] && [ "${FAIL_VALIDATE:-}" = yes ]; then exit 1; fi; echo Docker-test' : 'echo Docker-test');
  await exe(join(temp, 'docker-compose'), 'echo Compose-test');
  assert.equal(spawnSync('tar', ['-czf', 'docker-29.9.0.tgz', 'docker'], { cwd: temp }).status, 0);
  const files = installFiles('x86_64', '29.9.0', '5.6.0', 'https://example.com');
  for (const [name, data] of Object.entries(files)) {
    // Exercise real generated scripts and real filesystem operations in an isolated root.
    const script = data.replace(/\/(?:usr|etc|var|run)(?=[/\s"';]|$)/g, match => `${root}${match}`);
    await writeFile(join(temp, name), script);
  }
  const run = (name, extra = {}, cwd = temp) => spawnSync('/bin/sh', [name], {
    cwd, input: '\n\n\n\n\n', encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${root}/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin`, TEST_ROOT: root, ...extra }
  });
  return { temp, root, run, install: extra => run('offline_install_docker.sh', extra), uninstall: () => run('offline_uninstall_docker.sh') };
}
const success = result => assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const absent = path => assert.rejects(access(path), { code: 'ENOENT' });

test('uninstall without a record and repeated uninstall never touch an existing Docker', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'usr/bin/docker'), 'user Docker');
  await writeFile(join(f.root, 'etc/systemd/system/docker.service'), 'user service');
  success(f.uninstall()); success(f.uninstall());
  assert.equal(await readFile(join(f.root, 'usr/bin/docker'), 'utf8'), 'user Docker');
  await absent(join(f.root, 'service-calls'));
});

test('repeat install preserves edited configuration; uninstall backs it up and reinstall reuses it', async t => {
  const f = await fixture(t);
  success(f.install());
  const edited = '{"log-level":"debug","data-root":"/srv/custom-docker"}\n';
  await writeFile(join(f.root, 'etc/docker/daemon.json'), edited, { mode: 0o640 });
  const calls = await readFile(join(f.root, 'service-calls'), 'utf8');
  success(f.install());
  assert.equal(await readFile(join(f.root, 'service-calls'), 'utf8'), calls);
  success(f.uninstall()); success(f.uninstall());
  const backup = join(f.temp, 'daemon.json.bak');
  assert.equal(await readFile(backup, 'utf8'), edited);
  await absent(join(f.root, 'etc/docker/daemon.json'));
  for (const p of ['usr/bin/docker', 'usr/bin/docker-compose', 'usr/local/lib/docker', 'etc/systemd/system/docker.service']) await absent(join(f.root, p));
  await absent(join(f.temp, 'install-state'));
  const installed = f.install();
  success(installed);
  assert.match(installed.stdout, /直接使用备份配置/);
  assert.doesNotMatch(installed.stdout, /Docker 数据目录/);
  assert.equal(await readFile(join(f.root, 'etc/docker/daemon.json'), 'utf8'), edited);
  success(f.uninstall());
});

test('conflicting containerd, compose or vendor service prevents any managed writes', async t => {
  for (const path of ['usr/bin/containerd', 'usr/local/lib/docker/cli-plugins/docker-compose', 'usr/bin/docker-compose']) {
    const f = await fixture(t);
    await mkdir(join(f.root, path, '..'), { recursive: true });
    await writeFile(join(f.root, path), 'user program');
    assert.notEqual(f.install().status, 0);
    await absent(join(f.root, 'usr/bin/docker'));
    success(f.uninstall());
    assert.equal(await readFile(join(f.root, path), 'utf8'), 'user program');
  }
  const f = await fixture(t);
  assert.notEqual(f.install({ EXISTING_SERVICE: 'yes' }).status, 0);
  await absent(join(f.root, 'usr/bin/docker'));
});

test('modified config, config symlink and service overrides are backed up or removed without content checks', async t => {
  for (const useLink of [false, true]) {
    const f = await fixture(t);
    success(f.install());
    const config = join(f.root, 'etc/docker/daemon.json');
    const edited = '{"debug":true}';
    if (useLink) {
      await writeFile(join(f.root, 'external-config'), edited);
      await rm(config);
      await symlink(join(f.root, 'external-config'), config);
    } else await writeFile(config, edited);
    await writeFile(join(f.root, 'etc/systemd/system/docker.service'), 'custom service');
    await mkdir(join(f.root, 'etc/systemd/system/docker.service.d'));
    await writeFile(join(f.root, 'etc/systemd/system/docker.service.d/override.conf'), 'custom override');
    success(f.uninstall());
    assert.equal(await readFile(join(f.temp, 'daemon.json.bak'), 'utf8'), edited);
    await absent(join(f.root, 'etc/systemd/system/docker.service.d'));
    if (useLink) assert.equal(await readFile(join(f.root, 'external-config'), 'utf8'), edited);
  }
});

test('failed service startup retains a rollback record and uninstall recovers', async t => {
  const f = await fixture(t);
  assert.notEqual(f.install({ FAIL_START: 'yes' }).status, 0);
  assert.notEqual(f.install().status, 0);
  success(f.uninstall()); success(f.uninstall());
  await absent(join(f.root, 'usr/bin/docker'));
  success(f.install()); success(f.uninstall());
});

test('partial installation can roll back without touching files never installed', async t => {
  const f = await fixture(t);
  success(f.install());
  await writeFile(join(f.temp, 'install-state/status'), 'pending\n');
  await rm(join(f.root, 'usr/bin/runc'));
  success(f.uninstall());
  await absent(join(f.root, 'usr/bin/docker'));
});

test('running containers prevent uninstall before disable and file removal', async t => {
  const f = await fixture(t);
  success(f.install());
  const result = f.run('offline_uninstall_docker.sh', { RUNNING_CONTAINERS: 'yes' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /运行中的容器/);
  assert.doesNotMatch(await readFile(join(f.root, 'service-calls'), 'utf8'), /disable/);
  await access(join(f.root, 'usr/bin/docker'));
  success(f.uninstall());
});

test('changed enable link is removed without following its target', async t => {
  const f = await fixture(t);
  success(f.install());
  const target = join(f.root, 'external-service');
  await writeFile(target, 'user service');
  const link = join(f.root, 'etc/systemd/system/multi-user.target.wants/docker.service');
  await rm(link);
  await symlink(target, link);
  success(f.uninstall());
  assert.equal(await readFile(target, 'utf8'), 'user service');
});

test('replacing a parent directory with a symlink prevents rollback', async t => {
  const f = await fixture(t);
  success(f.install());
  const directory = join(f.root, 'etc/docker');
  await rename(directory, `${directory}-moved`);
  await symlink(`${directory}-moved`, directory);
  assert.notEqual(f.uninstall().status, 0);
  assert.doesNotMatch(await readFile(join(f.root, 'service-calls'), 'utf8'), /disable/);
});

test('a partial uninstall keeps the latest backup and can finish on retry', async t => {
  const f = await fixture(t);
  success(f.install());
  const config = await readFile(join(f.root, 'etc/docker/daemon.json'), 'utf8');
  await writeFile(join(f.temp, 'daemon.json.bak'), config);
  await rm(join(f.root, 'etc/docker/daemon.json'));
  await rm(join(f.root, 'usr/bin/runc'));
  await writeFile(join(f.temp, 'install-state/status'), 'uninstalling\n');
  success(f.uninstall()); success(f.uninstall());
  assert.equal(await readFile(join(f.temp, 'daemon.json.bak'), 'utf8'), config);
});

test('unreachable active daemon blocks uninstall before backup, stopping services or removal', async t => {
  const f = await fixture(t);
  success(f.install());
  const result = f.run('offline_uninstall_docker.sh', { DOCKER_PS_FAIL: 'yes' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /无法确认容器运行状态/);
  assert.doesNotMatch(await readFile(join(f.root, 'service-calls'), 'utf8'), /disable/);
  await absent(join(f.temp, 'daemon.json.bak'));
});

test('an occupied lifecycle lock blocks both scripts without touching user files', async t => {
  const f = await fixture(t);
  await mkdir(join(f.temp, '.offline-install.lock'));
  await writeFile(join(f.root, 'usr/bin/docker'), 'user Docker');
  assert.notEqual(f.install().status, 0);
  assert.notEqual(f.uninstall().status, 0);
  assert.equal(await readFile(join(f.root, 'usr/bin/docker'), 'utf8'), 'user Docker');
  await access(join(f.temp, '.offline-install.lock'));
  await absent(join(f.root, 'service-calls'));
});


test('saved configuration validation failure preserves the backup and does not start Docker', async t => {
  const f = await fixture(t);
  success(f.install()); success(f.uninstall());
  const backup = join(f.temp, 'daemon.json.bak');
  const contents = await readFile(backup, 'utf8');
  await writeFile(join(f.root, 'service-calls'), '');
  const result = f.install({ FAIL_VALIDATE: 'yes' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(await readFile(join(f.root, 'service-calls'), 'utf8'), /enable/);
  assert.equal(await readFile(backup, 'utf8'), contents);
  success(f.uninstall());
});

test('live-restore container processes block uninstall even when the service is inactive', async t => {
  const f = await fixture(t);
  success(f.install());
  await rm(join(f.root, 'service-active'));
  const result = f.run('offline_uninstall_docker.sh', { DOCKER_PS_FAIL: 'yes', RESIDUAL_CONTAINER: 'yes' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /仍在运行的容器进程/);
  assert.doesNotMatch(await readFile(join(f.root, 'service-calls'), 'utf8'), /disable/);
});


test('both scripts resolve local records and backups from their own folder when called elsewhere', async t => {
  const f = await fixture(t);
  success(f.run('../offline_install_docker.sh', {}, f.root));
  await access(join(f.temp, 'install-state/format'));
  await absent(join(f.root, 'install-state'));
  await mkdir(join(f.root, 'var/lib/docker'));
  await writeFile(join(f.root, 'var/lib/docker/user-data'), 'retain');
  success(f.run('../offline_uninstall_docker.sh', {}, f.root));
  await absent(join(f.temp, 'install-state'));
  await absent(join(f.temp, '.offline-install.lock'));
  await access(join(f.temp, 'daemon.json.bak'));
  assert.equal(await readFile(join(f.root, 'var/lib/docker/user-data'), 'utf8'), 'retain');
});
