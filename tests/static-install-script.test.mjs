import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('static installer helper downloads a plan and produces a verifiable bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dockerboost-static-install-'));
  try {
    await mkdir(join(dir, 'bin'));
    await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs'); const a=process.argv.slice(2), out=a[a.indexOf('-o')+1], url=a.at(-1);
fs.appendFileSync(process.env.LOG, JSON.stringify(a)+'\\n');
if (url.endsWith('/plan')) fs.writeFileSync(out, JSON.stringify({files:Object.fromEntries(['readme.md','daemon.json','docker.service','install_docker.sh','uninstall_docker.sh'].map(x=>[x,'content\\n']))}));
else fs.writeFileSync(out,'asset');
`, {mode: 0o755});
    const helper = join(dir, '.download-docker.sh');
    await writeFile(helper, await readFile(resolve('public/download-docker.sh')));
    const result = spawnSync('sh', [helper, 'https://example.com', 'x86_64', '28.1.1', '2.35.1', 'build'], {cwd:dir, encoding:'utf8', env:{...process.env, PATH:`${join(dir,'bin')}:${process.env.PATH}`, LOG:join(dir,'log')}});
    assert.equal(result.status, 0, result.stderr);
    const name = 'docker-offline-x86_64-docker-28.1.1-compose-2.35.1';
    assert.equal(spawnSync('tar', ['-xf', `${name}.tar`], {cwd:dir}).status, 0);
    assert.equal(spawnSync('sha256sum', ['-c', 'SHA256SUMS'], {cwd:join(dir,name)}).status, 0);
    assert.equal(await readFile(join(dir,name,'readme.md'),'utf8'), 'content\n');
    const requests = (await readFile(join(dir,'log'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(requests.every(args => !args.at(-1).includes('/script')));
    assert.ok(requests.filter(args => args.at(-1).endsWith('/asset')).every(args => args.includes('-fsSL') && args.includes('--retry')));
    assert.match(result.stdout, /Downloading: docker-28\.1\.1\.tgz/);
    assert.match(result.stdout, /Downloaded: docker-compose/);
    assert.match(result.stdout, /Creating bundle/);
    assert.ok(!(await readdir(dir)).includes('.download-docker.sh'));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('interactive download uses one progress bar and Ctrl+C stops the transfer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dockerboost-install-interrupt-'));
  try {
    await mkdir(join(dir, 'bin'));
    const helper = join(dir, 'download.sh');
    await writeFile(helper, await readFile(resolve('public/download-docker.sh')));
    await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs'); const a=process.argv.slice(2), out=a[a.indexOf('-o')+1], url=a.at(-1);
if (url.endsWith('/plan')) fs.writeFileSync(out, JSON.stringify({files:Object.fromEntries(['readme.md','daemon.json','docker.service','install_docker.sh','uninstall_docker.sh'].map(x=>[x,'content\\n']))}));
else { fs.writeFileSync(process.env.MARKER, JSON.stringify({pid:process.pid,args:a})); setInterval(()=>{},1000); }
`, {mode:0o755});
    const python = `import os, pty, signal, time, json
pid, fd = pty.fork()
if pid == 0:
 os.execvp('sh', ['sh', os.environ['HELPER'], 'https://example.com', 'aarch64', '29.9.2', '5.6.1', 'build'])
deadline = time.monotonic() + 5
while not os.path.exists(os.environ['MARKER']) and time.monotonic() < deadline: time.sleep(.02)
if not os.path.exists(os.environ['MARKER']): os.killpg(pid, signal.SIGKILL); raise Exception('download did not start')
data = json.load(open(os.environ['MARKER']))
assert '--progress-bar' in data['args'], 'interactive progress bar missing'
os.write(fd, b'\\x03')
deadline = time.monotonic() + 3
while time.monotonic() < deadline:
 done, status = os.waitpid(pid, os.WNOHANG)
 if done: break
 time.sleep(.02)
else:
 os.killpg(pid, signal.SIGKILL); os.waitpid(pid, 0); raise Exception('Ctrl+C did not stop the script')
time.sleep(.1)
try: os.kill(data['pid'], 0)
except ProcessLookupError: pass
else: os.kill(data['pid'], signal.SIGKILL); raise Exception('curl remained running')
`;
    const result = spawnSync('python3', ['-c', python], {cwd:dir, encoding:'utf8', timeout:12000, env:{...process.env, PATH:`${join(dir,'bin')}:${process.env.PATH}`, HELPER:helper, MARKER:join(dir,'marker')}});
    assert.equal(result.status, 0, result.stderr);
    const files = await readdir(dir);
    assert.ok(!files.includes('download.sh'));
    assert.ok(!files.some(name => name.startsWith('.dockerboost-install.')));
    assert.ok(!files.some(name => name.endsWith('.tar')));
  } finally { await rm(dir, {recursive:true, force:true}); }
});
