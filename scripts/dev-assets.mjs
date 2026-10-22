import { fileURLToPath } from 'node:url';
import { readdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { context } from 'esbuild';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
let pending = false;
let running;
async function rebuild() {
  pending = true;
  if (running) return running;
  running = (async () => {
    while (pending) {
      pending = false;
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Build exited with ${code}`)));
      });
    }
  })();
  try { await running; } finally { running = undefined; }
}
await rebuild();
// Poll source metadata so development also works with restricted filesystem watchers.
async function fingerprint(path) {
  const info = await stat(path);
  if (!info.isDirectory()) return `${path}:${info.mtimeMs}:${info.size}`;
  const entries = (await readdir(path)).sort();
  return (await Promise.all(entries.map(name => fingerprint(`${path}/${name}`)))).join('|');
}
const inputs = ['src', 'public', 'scripts', 'config.js', 'package.json', 'pnpm-lock.yaml', 'wrangler.jsonc', 'edgeone.json', 'edge-functions'];
const snapshot = async () => (await Promise.all(inputs.map(fingerprint))).join('|');
let previous = await snapshot();
let polling = false;
const timer = setInterval(async () => {
  if (polling) return;
  polling = true;
  try {
    const current = await snapshot();
    if (current !== previous) { previous = current; await rebuild(); }
  } catch (error) { console.error(error); }
  finally { polling = false; }
}, 1000);
const server = await context({ stdin: { contents: '', loader: 'js' }, write: false });
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 5173);
await server.serve({ servedir: 'dist', host: '127.0.0.1', port });
console.log(`Frontend assets: http://127.0.0.1:${port}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  clearInterval(timer);
  await server.dispose();
  process.exit();
});
