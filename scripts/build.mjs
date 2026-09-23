import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths from the project, even when invoked from another directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = new URL('../dist/', import.meta.url);
const publicDir = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const sourceHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const heroTag = sourceHtml.match(/<img\b[^>]*\bclass="[^"]*\bboost-art\b[^"]*"[^>]*>/)?.[0];
const heroSource = heroTag?.match(/\bsrc="(\/hero-[a-z0-9-]+\.svg)"/)?.[1];
if (!heroSource) throw new Error('Hero image must reference a root-level hero-*.svg in public/index.html');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('../public/', import.meta.url), dist, {
  recursive: true,
  filter: (source) => dirname(source) !== publicDir || !/^hero-[a-z0-9-]+\.svg$/.test(basename(source)) || `/${basename(source)}` === heroSource,
});

const result = await build({
  absWorkingDir: root,
  entryPoints: {
    'app.bundle': 'src/client/app.js',
    'browser-export-worker': 'src/client/features/download/browser-export-worker.js',
    app: 'src/client/styles/index.css',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  entryNames: '[name]-[hash]',
  metafile: true,
  logLevel: 'info',
});

const outputFor = (entryPoint) => {
  const output = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint === entryPoint)?.[0];
  if (!output) throw new Error(`No build output found for ${entryPoint}`);
  return `/${output.replace(/^dist\//, '')}`;
};

const icon = new URL('../dist/docker-icon.svg', import.meta.url);
const iconHash = createHash('sha256').update(await readFile(icon)).digest('hex').slice(0, 10);
const iconPath = `/docker-icon-${iconHash}.svg`;
await rename(icon, new URL(`../dist${iconPath}`, import.meta.url));

const hero = new URL(`../dist${heroSource}`, import.meta.url);
const heroHash = createHash('sha256').update(await readFile(hero)).digest('hex').slice(0, 10);
const heroPath = heroSource.replace(/\.svg$/, `-${heroHash}.svg`);
await rename(hero, new URL(`../dist${heroPath}`, import.meta.url));

const index = new URL('../dist/index.html', import.meta.url);
const html = (await readFile(index, 'utf8'))
  .replaceAll('/app.css', outputFor('src/client/styles/index.css'))
  .replaceAll('/app.bundle.js', outputFor('src/client/app.js'))
  .replaceAll('/browser-export-worker.js', outputFor('src/client/features/download/browser-export-worker.js'))
  .replaceAll('/docker-icon.svg', iconPath)
  .replace(`src="${heroSource}"`, `src="${heroPath}"`);
await writeFile(index, html);
