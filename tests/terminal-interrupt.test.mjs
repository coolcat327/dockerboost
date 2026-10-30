import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Ctrl+C in a terminal stops downloads and progress output does not overlap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dockerboost-interrupt-'));
  try {
    await mkdir(join(dir, 'bin'));
    const helper = join(dir, 'download.sh');
    await writeFile(helper, await readFile(resolve('public/download-images.sh')));
    await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs'); const a=process.argv.slice(2), out=a[a.indexOf('-o')+1], url=a.at(-1);
if (url.endsWith('/api/download-plan')) fs.writeFileSync(out,JSON.stringify({image:'nginx:latest',repository:'library/nginx',source:'auto',config:{digest:'sha256:'+'a'.repeat(64),size:3},layers:['b','c','d'].map(c=>({digest:'sha256:'+c.repeat(64),size:3}))}));
else { fs.appendFileSync(process.env.MARKER, JSON.stringify({pid:process.pid,args:a})+'\\n'); setInterval(()=>{},1000); }
`, {mode:0o755});
    const python = `import os, pty, signal, time, json, select
pid, fd = pty.fork()
if pid == 0:
 os.execvp('sh', ['sh', '-c', 'sh "$HELPER" https://example.com nginx:latest linux/amd64 auto && echo finished'])
deadline = time.monotonic() + 5
while time.monotonic() < deadline:
 if os.path.exists(os.environ['MARKER']) and len(open(os.environ['MARKER']).readlines()) >= 3: break
 time.sleep(.02)
if not os.path.exists(os.environ['MARKER']) or len(open(os.environ['MARKER']).readlines()) < 3: os.killpg(pid, signal.SIGKILL); raise Exception('three downloads did not start')
data = [json.loads(line) for line in open(os.environ['MARKER'])]
output = b''
deadline = time.monotonic() + 3
while time.monotonic() < deadline and b'0/3' not in output:
 if select.select([fd], [], [], .2)[0]: output += os.read(fd, 65536)
assert b'Download details' in output and b'Image' in output and b'Layers' in output and b'0/3' in output and b'+---' in output, output
os.write(fd, b'\\x03')
deadline = time.monotonic() + 3
while time.monotonic() < deadline:
 done, status = os.waitpid(pid, os.WNOHANG)
 if done: break
 time.sleep(.02)
else:
 os.killpg(pid, signal.SIGKILL); os.waitpid(pid, 0); raise Exception('Ctrl+C did not stop the script')
deadline = time.monotonic() + 3
while time.monotonic() < deadline:
 if not os.path.exists(os.environ['HELPER']): break
 time.sleep(.02)
else: raise Exception('download script did not finish cleanup')
for item in data:
 try: os.kill(item['pid'], 0)
 except ProcessLookupError: pass
 else: os.kill(item['pid'], signal.SIGKILL); raise Exception('curl remained running')
 assert any(arg.startswith('-') and 's' in arg and 'S' in arg for arg in item['args']) or ('--silent' in item['args'] and '--show-error' in item['args']), 'curl progress meter was not disabled'
`;
    const result = spawnSync('python3', ['-c', python], {cwd:dir, encoding:'utf8', timeout:12000, env:{...process.env, TERM:'xterm', PATH:`${join(dir,'bin')}:${process.env.PATH}`, HELPER:helper, MARKER:join(dir,'marker')}});
    assert.equal(result.status, 0, result.stderr);
    const files = await readdir(dir);
    assert.ok(!files.includes('download.sh'));
    assert.ok(!files.some(name => name.startsWith('.dockerboost-download.')));
    assert.ok(!files.some(name => name.startsWith('.dockerboost-queue.')));
  } finally { await rm(dir, {recursive:true, force:true}); }
});

test('terminal summary starts below the finished progress table', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dockerboost-display-'));
  try {
    await mkdir(join(dir, 'bin'));
    const helper = join(dir, 'download.sh');
    await writeFile(helper, await readFile(resolve('public/download-images.sh')));
    await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs'); const a=process.argv.slice(2), out=a[a.indexOf('-o')+1], url=a.at(-1);
if (url.endsWith('/api/download-plan')) fs.writeFileSync(out,JSON.stringify({image:'nginx:latest',repository:'library/nginx',source:'auto',config:{digest:'sha256:'+'a'.repeat(64),size:3},layers:[]}));
else fs.writeFileSync(out,'abc');
`, {mode:0o755});
    const python = `import os, pty, select
pid, fd = pty.fork()
if pid == 0: os.execvp('sh', ['sh', os.environ['HELPER'], 'https://example.com', 'nginx:latest', 'linux/amd64', 'auto'])
data = b''
while True:
 try:
  chunk = os.read(fd, 65536)
  if not chunk: break
  data += chunk
 except OSError: break
_, status = os.waitpid(pid, 0)
assert os.waitstatus_to_exitcode(status) == 0, data
assert b'\x1b[2J' in data and data.index(b'\x1b[2J') < data.index(b'Download details'), data
before, summary = data.split(b'Download summary', 1)
assert b'+' + b'-' * 10 in before, data
assert before.rstrip(b' \\r\\n').endswith(b'+'), data
assert b'| Size' in summary and b'| Time' in summary and b'| Speed' in summary, summary
`;
    const result = spawnSync('python3', ['-c', python], {cwd:dir, encoding:'utf8', timeout:12000, env:{...process.env, TERM:'xterm', PATH:`${join(dir,'bin')}:${process.env.PATH}`, HELPER:helper}});
    assert.equal(result.status, 0, result.stderr);
  } finally { await rm(dir, {recursive:true, force:true}); }
});
