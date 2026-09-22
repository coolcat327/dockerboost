import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Resolve paths from the project, even when invoked from another directory.
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await cp(new URL('../public/', import.meta.url), new URL('../dist/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: {
    'app.bundle': 'src/client/app.js',
    'browser-export-worker': 'src/client/browser-export-worker.js',
    app: 'src/client/styles/index.css',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  logLevel: 'info',
});
