import { config } from '../config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, access, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('built page image references resolve to emitted assets, including both download progress icons', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
  const html = await readFile(new URL('dist/index.html', root), 'utf8');
  assert.doesNotMatch(html, /__CONFIG_[A-Za-z]+__/);
  for (const url of Object.values(config.site.links)) assert.ok(html.includes(url), `Missing page link: ${url}`);
  assert.ok(html.includes(`class="footer-author">${config.site.author}`));
  const sources = [...html.matchAll(/<img\b[^>]*\bsrc="(\/[^\"]+)"/g)].map(match => match[1]);
  const downloadIcon = html.match(/<img\b[^>]*class="download-progress-icon"[^>]*>/)?.[0];
  assert.match(downloadIcon || '', /\bsrc="\/assets\/[^/]+\/docker-icon\.svg"/, 'the download progress icon must have a versioned image source');
  assert.ok(sources.length > 0);
  for (const source of sources) {
    await assert.doesNotReject(access(new URL(`dist${source}`, root)), `Missing image asset: ${source}`);
  }
  const githubUse = html.match(/<use href="([^"#]+)#github-mark"/)?.[1];
  assert.match(githubUse || '', /^\/assets\/[^/]+\/github-icon\.svg$/);
  const githubSvg = await readFile(new URL(`dist${githubUse}`, root), 'utf8');
  assert.match(githubSvg, /id="github-mark"/);
  const favicon = html.match(/<link\b[^>]*rel="icon"[^>]*href="([^"]+)"/)?.[1];
  assert.ok(favicon, 'the page favicon must reference an emitted image');
  await assert.doesNotReject(access(new URL(`dist${favicon}`, root)));
});

test('versioned resources use the intended cache rules', async () => {
  const html = await readFile(new URL('dist/index.html', root), 'utf8');
  const version = html.match(/\/assets\/([A-Za-z0-9_-]+)\/app\.bundle\.js/)?.[1];
  assert.match(version || '', /^[a-z]{8}$/);
  for (const name of ['download-images.sh', 'download-docker.sh', 'docker-icon.svg', 'github-icon.svg', 'app.css', 'image-export-worker.js', 'command-manual.json']) {
    assert.ok((await readFile(new URL(`dist/assets/${version}/${name}`, root))).length > 0, name);
  }
  for (const name of ['download-images.sh', 'download-docker.sh']) {
    await assert.rejects(access(new URL(`dist/${name}`, root)));
  }
  await assert.rejects(access(new URL(`dist/assets/${version}/_headers`, root)));
  const headers = await readFile(new URL('public/_headers', root), 'utf8');
  assert.match(headers, /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  const edge = JSON.parse(await readFile(new URL('edgeone.json', root), 'utf8'));
  for (const path of ['/assets/*']) {
    const value = edge.headers.find(rule => rule.source === path)?.headers.find(header => header.key === 'Cache-Control')?.value;
    assert.equal(value, 'public, max-age=31536000, immutable');
  }
});

test('page loads ESM chunks lazily while download worker remains standalone', async () => {
  const html = await readFile(new URL('dist/index.html', root), 'utf8');
  assert.match(html, /<script type="module" src="\/assets\/[^/]+\/app\.bundle\.js"><\/script>/);
  const appPath = html.match(/src="(\/assets\/[^/]+\/app\.bundle\.js)"/)?.[1];
  const app = await readFile(new URL(`dist${appPath}`, root), 'utf8');
  assert.doesNotMatch(app, /docker logs --tail 100 -f web/, 'manual entries must not be bundled in the app');
  assert.match(app, /command-manual\.json/);
  const imports = [...app.matchAll(/import\("(\.\/chunks\/[^"]+)"\)/g)].map(match => match[1]);
  assert.ok(imports.includes('./chunks/converter.js'), 'converter must remain a lazy chunk without a filename hash');
  const appUrl = new URL(`dist${appPath}`, root);
  const chunks = await readdir(new URL('./chunks/', appUrl));
  assert.ok(chunks.includes('converter.js'));
  for (const name of chunks) assert.doesNotMatch(name, /-[A-Z0-9]{8}\.js$/, `unexpected filename hash: ${name}`);
  // Follow both static and dynamic relative imports, including imports inside chunks.
  const visited = new Set();
  const checkImports = async url => {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = await readFile(url, 'utf8');
    for (const [, path] of source.matchAll(/(?:from|import)\s*(?:\(\s*)?["'](\.[^"']+)["']/g)) {
      const dependency = new URL(path, url);
      assert.ok(dependency.href.startsWith(new URL('./', appUrl).href), `import leaves release directory: ${path}`);
      await checkImports(dependency);
    }
  };
  await checkImports(appUrl);
  assert.ok(visited.has(new URL('./chunks/converter.js', appUrl).href));
  const workerPath = html.match(/name="image-export-worker" content="([^"]+)"/)?.[1];
  const worker = await readFile(new URL(`dist${workerPath}`, root), 'utf8');
  assert.doesNotMatch(worker, /\bimport\s*[{"']/);
});
