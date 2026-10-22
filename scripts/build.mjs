import { config } from '../config.js';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths from the project, even when invoked from another directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = new URL('../dist/', import.meta.url);
const publicDir = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const sourceHtml = await readFile(new URL('../src/client/index.html', import.meta.url), 'utf8');
const heroTag = sourceHtml.match(/<img\b[^>]*\bclass="[^"]*\bboost-art\b[^"]*"[^>]*>/)?.[0];
const heroSource = heroTag?.match(/\bsrc="(\/hero-[a-z0-9-]+\.svg)"/)?.[1];
if (!heroSource) throw new Error('Hero image must reference a root-level hero-*.svg in src/client/index.html');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('../public/', import.meta.url), dist, {
  recursive: true,
  filter: (source) => dirname(source) !== publicDir || !/^hero-[a-z0-9-]+\.svg$/.test(basename(source)) || `/${basename(source)}` === heroSource,
});

// Include server templates as well as browser code in the download cache version.
const versionHash = createHash('sha256');
async function hashTree(relative) {
  for (const entry of (await readdir(resolve(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await hashTree(path);
    else if (entry.isFile()) { versionHash.update(path); versionHash.update(await readFile(resolve(root, path))); }
  }
}
for (const path of ['src', 'public', 'scripts', 'edge-functions']) await hashTree(path);
for (const path of ['config.js', 'package.json', 'pnpm-lock.yaml', 'wrangler.jsonc', 'edgeone.json']) {
  versionHash.update(path); versionHash.update(await readFile(resolve(root, path)));
}
const version = versionHash.digest().subarray(0, 6).toString('base64url');

const result = await build({
  absWorkingDir: root,
  entryPoints: {
    'app.bundle': 'src/client/app.js',
    'image-export-worker': 'src/client/features/download/image-export-worker.js',
    app: 'src/client/styles/index.css',
  },
  outdir: 'dist',
  bundle: true,
  minify: true,
  define: { __DOCKERBOOST_VERSION__: JSON.stringify(version) },
  format: 'iife',
  target: 'es2020',
  entryNames: `[name]-${version}`,
  metafile: true,
  logLevel: 'info',
});

const outputFor = (entryPoint) => {
  const output = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint === entryPoint)?.[0];
  if (!output) throw new Error(`No build output found for ${entryPoint}`);
  return `/${output.replace(/^dist\//, '')}`;
};

const icon = new URL('../dist/docker-icon.svg', import.meta.url);
const iconPath = `/docker-icon-${version}.svg`;
await rename(icon, new URL(`../dist${iconPath}`, import.meta.url));

const githubIconPath = `/github-icon-${version}.svg`;
await rename(new URL('../dist/github-icon.svg', import.meta.url), new URL(`../dist${githubIconPath}`, import.meta.url));

const hero = new URL(`../dist${heroSource}`, import.meta.url);
const heroPath = heroSource.replace(/\.svg$/, `-${version}.svg`);
await rename(hero, new URL(`../dist${heroPath}`, import.meta.url));

const index = new URL('../dist/index.html', import.meta.url);
const pageConfig = { author: config.site.author };
for (const [key, value] of Object.entries(config.site.links)) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`Page link ${key} must use HTTPS`);
  pageConfig[key] = url.href;
}
const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const html = sourceHtml
  .replace(/__CONFIG_([A-Za-z]+)__/g, (_, key) => {
    if (!Object.hasOwn(pageConfig, key)) throw new Error(`Unknown page config: ${key}`);
    return escapeHtml(pageConfig[key]);
  })
  .replaceAll('/app.css', outputFor('src/client/styles/index.css'))
  .replaceAll('/app.bundle.js', outputFor('src/client/app.js'))
  .replaceAll('/image-export-worker.js', outputFor('src/client/features/download/image-export-worker.js'))
  .replaceAll('/docker-icon.svg', iconPath)
  .replaceAll('/github-icon.svg', githubIconPath)
  .replace(`src="${heroSource}"`, `src="${heroPath}"`);
await writeFile(index, html);
