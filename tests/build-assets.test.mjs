import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('built page image references resolve to emitted assets, including both download progress icons', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
  const html = await readFile(new URL('dist/index.html', root), 'utf8');
  const sources = [...html.matchAll(/<img\b[^>]*\bsrc="(\/[^\"]+)"/g)].map(match => match[1]);
  const downloadIcon = html.match(/<img\b[^>]*class="download-progress-icon"[^>]*>/)?.[0];
  assert.match(downloadIcon || '', /\bsrc="\/docker-icon-[^"]+\.svg"/, 'the download progress icon must have a versioned image source');
  assert.ok(sources.length > 0);
  for (const source of sources) {
    await assert.doesNotReject(access(new URL(`dist${source}`, root)), `Missing image asset: ${source}`);
  }
  const favicon = html.match(/<link\b[^>]*rel="icon"[^>]*href="([^"]+)"/)?.[1];
  assert.ok(favicon, 'the page favicon must reference an emitted image');
  await assert.doesNotReject(access(new URL(`dist${favicon}`, root)));
});
