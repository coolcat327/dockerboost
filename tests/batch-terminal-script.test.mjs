import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { batchCommands } from '../src/client/features/download/compose.js';

test('static image helper downloads plans and blobs without requesting dynamic scripts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dockerboost-batch-'));
  try {
    await mkdir(join(dir, 'bin'));
    await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs');
const a = process.argv.slice(2), out = a[a.indexOf('-o') + 1], url = a.at(-1);
fs.appendFileSync(process.env.LOG, JSON.stringify(a) + '\\n');
if (url.endsWith('/download-images.sh')) fs.copyFileSync(process.env.HELPER, out);
else if (url.endsWith('/api/download-plan')) fs.writeFileSync(out, JSON.stringify({image:'nginx:latest',repository:'library/nginx',source:'auto',config:{digest:'sha256:'+ 'a'.repeat(64),size:3},layers:[]}));
else fs.writeFileSync(out, 'abc');
`, { mode: 0o755 });
    const result = spawnSync('sh', ['-c', batchCommands([{ image: 'nginx:latest', platform: 'linux/arm64/v8', source: 'auto' }], 'https://example.com')], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, LOG: join(dir, 'log'), HELPER: resolve('public/download-images.sh') } });
    assert.equal(result.status, 0, result.stderr);
    const requests = (await readFile(join(dir, 'log'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(requests.some(args => args.at(-1).endsWith('/api/download-plan')));
    assert.ok(requests.every(args => !args.at(-1).endsWith('/api/download-script')));
    assert.ok((await readdir(dir)).includes('nginx_latest_linux_arm64_v8.tar'));
    assert.ok(!(await readdir(dir)).includes('.download-images.sh'));
    assert.equal(spawnSync('tar', ['-tf', join(dir, 'nginx_latest_linux_arm64_v8.tar')]).status, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

for (const fail of [false, true]) {
  test(`image blobs run at most three at once and ${fail ? 'stop after failure' : 'complete'} `, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dockerboost-concurrency-'));
    try {
      await mkdir(join(dir, 'bin'));
      await writeFile(join(dir, 'bin/sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const helper = join(dir, 'download.sh');
      await writeFile(helper, await readFile(resolve('public/download-images.sh')));
      await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs');
const a = process.argv.slice(2), out = a[a.indexOf('-o') + 1], url = a.at(-1);
if (url.endsWith('/api/download-plan')) {
  const blobs = Array.from({length: 12}, (_, i) => ({digest:'sha256:' + i.toString(16).padStart(64,'0'),size:3}));
  fs.writeFileSync(out, JSON.stringify({image:'nginx:latest',repository:'library/nginx',source:'auto',config:blobs[0],layers:blobs.slice(1)}));
} else {
  fs.appendFileSync(process.env.LOG, 'start ' + Date.now() + '\\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
  fs.appendFileSync(process.env.LOG, 'end ' + Date.now() + '\\n');
  if (process.env.FAIL && url.endsWith('0'.repeat(64))) process.exit(22);
  fs.writeFileSync(out, 'abc');
}
`, { mode: 0o755 });
      const result = spawnSync('sh', [helper, 'https://example.com', 'nginx:latest', 'linux/amd64', 'auto'], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, LOG: join(dir, 'log'), FAIL: fail ? '1' : '' },
      });
      assert.equal(result.status, fail ? 1 : 0, result.stderr);
      const events = (await readFile(join(dir, 'log'), 'utf8')).trim().split('\n').map(line => line.split(' ')).sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] === 'end' ? -1 : 1));
      let active = 0, peak = 0, starts = 0;
      for (const [event] of events) { active += event === 'start' ? 1 : -1; if (event === 'start') starts++; peak = Math.max(peak, active); }
      assert.ok(peak > 1 && peak <= 3, `peak concurrency: ${peak}`);
      assert.equal(starts, fail ? 6 : 12);
      const files = await readdir(dir);
      assert.equal(files.includes('nginx_latest_linux_amd64.tar'), !fail);
      assert.ok(!files.some(name => name.startsWith('.dockerboost-download.')));
      assert.ok(!files.includes('download.sh'));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

for (const fail of [false, true]) {
test(`four image workers limit blobs and continue independent images (${fail ? 'failure' : 'success'})`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dockerboost-image-workers-'));
  try {
    await mkdir(join(dir, 'bin'));
    await writeFile(join(dir, 'bin/sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const helper = join(dir, 'download.sh');
    await writeFile(helper, await readFile(resolve('public/download-images.sh')));
    await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs');
const a = process.argv.slice(2), out = a[a.indexOf('-o') + 1], url = a.at(-1);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
if (url.endsWith('/api/download-plan')) {
  const image = a.find(x => x.startsWith('image=')).slice(6);
  fs.appendFileSync(process.env.LOG, 'plan ' + image + ' ' + Date.now() + '\\n');
  const blobs = Array.from({length: 5}, (_, i) => ({digest:'sha256:' + i.toString(16).padStart(64,'0'),size:3}));
  fs.writeFileSync(out, JSON.stringify({image,repository:image.split(':')[0],source:'auto',config:blobs[0],layers:blobs.slice(1)}));
} else {
  const image = url.match(/v2\\/([^/]+)\\/blobs/)[1];
  fs.appendFileSync(process.env.LOG, 'start ' + image + ' ' + Date.now() + '\\n');
  sleep(350);
  fs.appendFileSync(process.env.LOG, 'end ' + image + ' ' + Date.now() + '\\n');
  if (process.env.FAIL && image === 'image0' && url.endsWith('0'.repeat(64))) process.exit(22);
  fs.writeFileSync(out, 'abc');
}
`, { mode: 0o755 });
    const args = ['https://example.com'];
    for (let i = 0; i < 7; i++) args.push(`image${i}:latest`, 'linux/amd64', 'auto');
    const result = spawnSync('sh', [helper, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, LOG: join(dir, 'log'), FAIL: fail ? '1' : '' } });
    assert.equal(result.status, fail ? 1 : 0, result.stderr);
    const events = (await readFile(join(dir, 'log'), 'utf8')).trim().split('\n').map(line => { const [event, image, time] = line.split(' '); return {event, image: image.split(':')[0], time: Number(time)}; }).sort((a,b) => a.time - b.time || (a.event === 'end' ? -1 : 1));
    const active = new Map(), peakImages = new Set();
    let maxImages = 0, maxBlobs = 0;
    for (const {event, image} of events) {
      if (event === 'plan') continue;
      active.set(image, (active.get(image) || 0) + (event === 'start' ? 1 : -1));
      if (!active.get(image)) active.delete(image);
      maxImages = Math.max(maxImages, active.size);
      maxBlobs = Math.max(maxBlobs, ...active.values(), 0);
      if (event === 'start') peakImages.add(image);
    }
    assert.ok(maxImages > 1 && maxImages <= 4, `concurrent images: ${maxImages}`);
    assert.ok(maxBlobs > 1 && maxBlobs <= 3, `concurrent blobs per image: ${maxBlobs}`);
    assert.equal(peakImages.size, 7);
    assert.match(result.stdout, new RegExp(`Succeeded \\(${fail ? 6 : 7}\\)  Failed \\(${fail ? 1 : 0}\\)  Size [\\d.]+ MiB  Time (?:<1s|\\d+s)  Speed (?:-|[\\d.]+ M/s)\\n`));
    assert.match(result.stdout, /\| Size\s+\| Time\s+\| Speed\s+\|/);
    assert.match(result.stdout, /\| image1:latest\s+\| success\s+\| linux\/amd64\s+\|\s+[\d.]+ MiB\s+\|\s+(?:<1s|\d+s)\s+\|\s+(?:-|[\d.]+ M\/s)\s+\|/);
    if (fail) {
      assert.match(result.stdout, /\| image0:latest\s+\| failed\s+\| linux\/amd64\s+\|\s+[\d.]+ MiB\s+\|/);
      assert.match(result.stdout, /Unable to download or verify image blobs after retries/);
      assert.match(result.stdout, /sha256:0{64}/);
    }
    for (let i = 0; i < 7; i++) assert.equal((await readdir(dir)).includes(`image${i}_latest_linux_amd64.tar`), !(fail && i === 0));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
}

for (const exhausted of [false, true]) {
  test(`each blob retries errors and incomplete downloads with exponential backoff (${exhausted ? 'exhausted' : 'recovered'})`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dockerboost-retry-'));
    try {
      await mkdir(join(dir, 'bin'));
      const helper = join(dir, 'download.sh');
      await writeFile(helper, await readFile(resolve('public/download-images.sh')));
      await writeFile(join(dir, 'bin/sleep'), '#!/bin/sh\nprintf "%s\\n" "$1" >> "$DELAYS"\n', { mode: 0o755 });
      await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2), out = args[args.indexOf('-o') + 1], url = args.at(-1);
if (url.endsWith('/api/download-plan')) {
  fs.writeFileSync(out, JSON.stringify({image:'nginx:latest',repository:'library/nginx',source:'auto',config:{digest:'sha256:'+'a'.repeat(64),size:3},layers:[]}));
} else {
  if (args.includes('--retry')) process.exit(90);
  const count = fs.existsSync(process.env.COUNTER) ? Number(fs.readFileSync(process.env.COUNTER)) + 1 : 1;
  fs.writeFileSync(process.env.COUNTER, String(count));
  if (count === 1 || process.env.EXHAUSTED) process.exit(22);
  fs.writeFileSync(out, count < 4 ? 'ab' : 'abc');
}
`, { mode: 0o755 });
      const result = spawnSync('sh', [helper, 'https://example.com', 'nginx:latest', 'linux/amd64', 'auto'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, COUNTER: join(dir, 'counter'), DELAYS: join(dir, 'delays'), EXHAUSTED: exhausted ? '1' : '' } });
      assert.equal(result.status, exhausted ? 1 : 0, result.stderr);
      assert.equal(await readFile(join(dir, 'counter'), 'utf8'), '4');
      assert.equal(await readFile(join(dir, 'delays'), 'utf8'), '1\n2\n4\n');
      const files = await readdir(dir);
      assert.equal(files.includes('nginx_latest_linux_amd64.tar'), !exhausted);
      assert.ok(!files.some(name => name.startsWith('.dockerboost-download.')));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

for (const mode of ['metadata', 'exists']) {
  test(`summary explains ${mode === 'metadata' ? 'metadata errors' : 'existing archives'}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dockerboost-summary-'));
    try {
      await mkdir(join(dir, 'bin'));
      const helper = join(dir, 'download.sh');
      await writeFile(helper, await readFile(resolve('public/download-images.sh')));
      if (mode === 'exists') await writeFile(join(dir, 'nginx_latest_linux_amd64.tar'), 'original');
      await writeFile(join(dir, 'bin/curl'), `#!${process.execPath}
const fs = require('node:fs'); const a = process.argv.slice(2), out = a[a.indexOf('-o') + 1];
if (process.env.MODE === 'metadata') { process.stderr.write('HTTP 404\\n'); process.exit(22); }
fs.writeFileSync(out, JSON.stringify({image:'nginx:latest',repository:'library/nginx',source:'auto',config:{digest:'sha256:'+'a'.repeat(64),size:3},layers:[]}));
`, {mode:0o755});
      const result = spawnSync('sh', [helper, 'https://example.com', 'nginx:latest', 'linux/amd64', 'auto'], {cwd:dir, encoding:'utf8', env:{...process.env, PATH:`${join(dir,'bin')}:${process.env.PATH}`, MODE:mode}});
      assert.equal(result.status, 1);
      assert.match(result.stdout, /Succeeded \(0\)  Failed \(1\)  Size -  Time -  Speed -\n/);
      assert.match(result.stdout, mode === 'metadata' ? /Could not retrieve image metadata[\s\S]*HTTP 404/ : /Output already exists:/);
      if (mode === 'exists') assert.equal(await readFile(join(dir,'nginx_latest_linux_amd64.tar'),'utf8'), 'original');
    } finally { await rm(dir,{recursive:true,force:true}); }
  });
}
