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
  const hero = sources.find(source => /\/hero-/.test(source));
  assert.ok(hero);
  assert.ok(html.includes(`rel="preload" as="image" href="${hero}" fetchpriority="high"`), 'hero preload must use the same versioned URL as the image');
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
  await assert.rejects(access(new URL('dist/fonts', root)), { code: 'ENOENT' });
  const sourceFonts = await readdir(new URL('public/fonts/', root));
  const publishedFonts = await readdir(new URL(`dist/assets/${version}/fonts/`, root));
  assert.deepEqual(publishedFonts.sort(), sourceFonts.sort());
  await assert.rejects(access(new URL(`dist/assets/${version}/_headers`, root)));
  const headers = await readFile(new URL('dist/_headers', root), 'utf8');
  assert.match(headers, /\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  const edge = JSON.parse(await readFile(new URL('edgeone.json', root), 'utf8'));
  for (const path of ['/assets/*']) {
    const value = edge.headers.find(rule => rule.source === path)?.headers.find(header => header.key === 'Cache-Control')?.value;
    assert.equal(value, 'public, max-age=31536000, immutable');
  }
});

test('page groups tool interfaces within the request budget and defers the conversion engine', async () => {
  const html = await readFile(new URL('dist/index.html', root), 'utf8');
  assert.match(html, /<script type="module" src="\/assets\/[^/]+\/app\.bundle\.js"><\/script>/);
  const appPath = html.match(/src="(\/assets\/[^/]+\/app\.bundle\.js)"/)?.[1];
  const app = await readFile(new URL(`dist${appPath}`, root), 'utf8');
  assert.doesNotMatch(app, /docker logs --tail 100 -f web/, 'manual entries must not be bundled in the app');
  assert.doesNotMatch(app, /command-manual\.json/);
  const appImport = app.match(/import\("(\.\/tools\.js)"\)/)?.[1];
  assert.ok(appImport, 'the lightweight hero entry must load the tool app dynamically');
  assert.doesNotMatch(app, /\/install-|\/download-/, 'tool registrations must stay out of the hero entry');
  const appUrl = new URL(`dist${appPath}`, root);
  const tools = await readFile(new URL(appImport, appUrl), 'utf8');
  const imports = [...tools.matchAll(/import\("(\.\/[^"]+)"\)/g)].map(match => match[1]);
  assert.equal(imports.length, 1, 'tool interfaces must share one bundle with only the heavy engine deferred');
  assert.match(imports[0], /^\.\/chunks\/converter-[^/]+\.js$/);
  const chunks = await readdir(new URL('./chunks/', appUrl));
  assert.ok(!chunks.some(name => /^(install|setup|pull|download|convert|manual)-/.test(name)), 'tabs must not create separate interface chunks');
  // Follow both static and dynamic relative imports, including imports inside chunks.
  const graph = new Map();
  const checkImports = async url => {
    if (graph.has(url.href)) return;
    const dependencies = [];
    graph.set(url.href, dependencies);
    const source = await readFile(url, 'utf8');
    for (const [, , dynamic, path] of source.matchAll(/\b(from|import\s*(\()?)\s*["'](\.[^"']+)["']/g)) {
      const dependency = new URL(path, url);
      assert.ok(dependency.href.startsWith(new URL('./', appUrl).href), `import leaves release directory: ${path}`);
      dependencies.push({ url: dependency, dynamic: Boolean(dynamic) });
      await checkImports(dependency);
    }
  };
  await checkImports(appUrl);
  const toolsUrl = new URL(appImport, appUrl);
  const converterUrl = new URL(imports[0], toolsUrl);
  assert.ok(graph.has(converterUrl.href));
  assert.equal(graph.get(appUrl.href).filter(({ dynamic }) => !dynamic).length, 0, 'intro must have no static tool dependencies');
  const startup = new Set();
  const includeStatic = url => {
    if (startup.has(url.href)) return;
    startup.add(url.href);
    for (const dependency of graph.get(url.href)) if (!dependency.dynamic) includeStatic(dependency.url);
  };
  includeStatic(appUrl);
  includeStatic(toolsUrl);
  assert.ok(startup.size <= 4, `startup must stay within 4 JS requests, got ${startup.size}`);
  assert.ok(!startup.has(converterUrl.href), 'engine must stay out of the complete startup dependency graph');
  assert.ok(graph.size <= 5, `page must stay within 5 JS files, got ${graph.size}`);
  const scripts = [...(await readdir(new URL('./', appUrl))).filter(name => name.endsWith('.js')), ...chunks.filter(name => name.endsWith('.js'))];
  assert.ok(scripts.length <= 6, 'all emitted JS, including the worker, must stay within 6 files');
  assert.equal(scripts.length, graph.size + 1, 'no orphan feature chunks should be emitted');
  const { convert } = await import(converterUrl.href);
  assert.match(convert('docker run --name web -p 8080:80 nginx:alpine', 'run-to-compose').output, /image: nginx:alpine/);
  const workerPath = html.match(/name="image-export-worker" content="([^"]+)"/)?.[1];
  const worker = await readFile(new URL(`dist${workerPath}`, root), 'utf8');
  assert.doesNotMatch(worker, /\bimport\s*[{"']/);
});

test('loading the combined registry does not initialize tools or request business data', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('tool registration must not fetch data'); });
  // Node has no document/window/Worker: eager DOM setup or worker creation would fail here.
  const { features } = await import('../src/client/features/index.js');
  assert.deepEqual(features.map(({ id }) => id), ['install', 'setup', 'pull', 'download', 'convert', 'manual']);
  for (const feature of features) {
    assert.equal(typeof feature.init, 'function');
    assert.ok(feature.messages['zh-CN'] && feature.messages.en);
    assert.equal(feature.load, undefined);
  }
  assert.equal(features.find(({ id }) => id === 'pull').selectionGroup, 'image');
  assert.equal(features.find(({ id }) => id === 'download').selectionGroup, 'image');
});
