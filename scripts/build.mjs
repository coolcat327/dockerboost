import { config } from '../config.js';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths from the project, even when invoked from another directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const publicDir = resolve(root, 'public');
const sourceHtml = await readFile(new URL('../src/client/index.html', import.meta.url), 'utf8');
const heroTag = sourceHtml.match(/<img\b[^>]*\bclass="[^"]*\bboost-art\b[^"]*"[^>]*>/)?.[0];
const heroSource = heroTag?.match(/\bsrc="(\/hero-[a-z0-9-]+\.svg)"/)?.[1];
if (!heroSource) throw new Error('Hero image must reference a root-level hero-*.svg in src/client/index.html');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const hasFixedPath = (name) => name.startsWith('_') || /\.html?$/i.test(name);
for (const entry of await readdir(publicDir, { recursive: true, withFileTypes: true })) {
  if (entry.isDirectory() || !hasFixedPath(entry.name)) continue;
  const source = resolve(entry.parentPath, entry.name);
  await cp(source, resolve(dist, relative(publicDir, source)));
}

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
const version = Array.from(versionHash.digest().subarray(0, 8), byte => String.fromCharCode(97 + byte % 26)).join('');

// Publish static resources under the versioned namespace.
const assetDir = resolve(dist, 'assets', version);
await mkdir(assetDir, { recursive: true });
await cp(publicDir, assetDir, {
  recursive: true,
  filter: (source) => {
    const path = relative(publicDir, source);
    const name = basename(source);
    return !path || (!hasFixedPath(name) &&
      (dirname(source) !== publicDir || !/^hero-[a-z0-9-]+\.svg$/.test(name) || `/${name}` === heroSource));
  },
});

const buildOptions = {
  absWorkingDir: root,
  outdir: assetDir,
  bundle: true,
  minify: true,
  define: { __DOCKERBOOST_VERSION__: JSON.stringify(version) },
  target: 'es2020',
  metafile: true,
  logLevel: 'info',
};
const result = await build({
  ...buildOptions,
  entryPoints: {
    'tools.bundle': 'src/client/app.js',
    app: 'src/client/styles/index.css',
  },
  external: ['./fonts/*'],
  format: 'esm',
  // Split at loading stages (intro, tools, converter), not at every tool tab.
  // esbuild may share large dependencies such as YAML between those stages.
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
});

const outputFor = (entryPoint) => {
  const output = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint === entryPoint)?.[0];
  if (!output) throw new Error(`No build output found for ${entryPoint}`);
  return `/${output.replace(/^dist\//, '')}`;
};

// Build the intro separately so even bundler runtime helpers cannot become
// blocking requests before its first frame. Source code still imports app.js.
const bootstrapResult = await build({
  ...buildOptions,
  entryPoints: { 'app.bundle': 'src/client/bootstrap.js' },
  format: 'esm',
  plugins: [{
    name: 'tool-stage-url',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/app\.js$/ }, () => ({ path: `./${basename(outputFor('src/client/app.js'))}`, external: true }));
    },
  }],
});
Object.assign(result.metafile.outputs, bootstrapResult.metafile.outputs);

// Keep request counts reviewable as features and shared dependencies evolve.
const pageScripts = Object.entries(result.metafile.outputs).filter(([path]) => path.endsWith('.js'));
const startupScripts = new Set();
const includeStaticImports = (path) => {
  if (startupScripts.has(path)) return;
  startupScripts.add(path);
  for (const dependency of result.metafile.outputs[path].imports) {
    if (!dependency.external && dependency.kind !== 'dynamic-import') includeStaticImports(dependency.path);
  }
};
for (const [path, metadata] of pageScripts) {
  if (['src/client/bootstrap.js', 'src/client/app.js'].includes(metadata.entryPoint)) includeStaticImports(path);
}
if (pageScripts.length > 5 || startupScripts.size > 4) {
  throw new Error(`Too many browser JS files: ${pageScripts.length} total, ${startupScripts.size} at startup. Consolidate loading stages or review the request budget.`);
}
console.log(`Browser JS: ${pageScripts.length}/5 files, ${startupScripts.size}/4 at startup; converter loads on input. Download worker: 1 standalone file.`);

// The download worker remains a standalone classic worker; only the page uses ESM chunks.
const workerResult = await build({
  ...buildOptions,
  entryPoints: ['src/client/features/download/image-export-worker.js'],
  format: 'iife',
});
Object.assign(result.metafile.outputs, workerResult.metafile.outputs);

const iconPath = `/assets/${version}/docker-icon.svg`;
const githubIconPath = `/assets/${version}/github-icon.svg`;
const heroPath = `/assets/${version}${heroSource}`;

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
  .replaceAll('/fonts/', `/assets/${version}/fonts/`)
  .replaceAll('/app.css', outputFor('src/client/styles/index.css'))
  .replaceAll('/app.bundle.js', outputFor('src/client/bootstrap.js'))
  .replaceAll('/image-export-worker.js', outputFor('src/client/features/download/image-export-worker.js'))
  .replaceAll('/docker-icon.svg', iconPath)
  .replaceAll('/github-icon.svg', githubIconPath)
  .replaceAll('/converter-licenses.txt', `/assets/${version}/converter-licenses.txt`)
  .replaceAll(`"${heroSource}"`, `"${heroPath}"`);
await writeFile(index, html);
