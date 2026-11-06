import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const sceneSlugs = {
  offline: 'offline-docker-install',
  browser: 'offline-image-transfer',
  share: 'image-queue-sharing',
  batch: 'compose-batch-export',
};
const workflowSlugs = {traditional: 'traditional', boost: 'our'};
const filenames = new Map(Object.entries(sceneSlugs).flatMap(([scene, slug]) =>
  Object.entries(workflowSlugs).flatMap(([variant, workflow]) =>
    ['zh', 'en'].map(language => [
      `${scene}-${variant}-${language}`,
      `${slug}-${workflow}-${language}.gif`,
    ]),
  ),
));
const requested = process.argv.slice(2);
const ids = requested.length ? [...new Set(requested)] : [...filenames.keys()];
const selected = ids.map(id => {
  const filename = filenames.get(id);
  if (!filename) throw new Error(`Unknown composition: ${id}\nAvailable: ${[...filenames.keys()].join(', ')}`);
  return {id, filename};
});

const cwd = fileURLToPath(new URL('.', import.meta.url));
const output = fileURLToPath(new URL('../../docs/assets/workflow-demos/', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'dockerboost-animations-'));
const bundle = join(work, 'bundle');

function remotion(...args) {
  const result = spawnSync('pnpm', ['exec', 'remotion', ...args, '--log=error'], {cwd, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Remotion failed: ${args.join(' ')} (${result.signal ?? result.status})`);
}

try {
  remotion('bundle', 'src/index.ts', `--out-dir=${bundle}`);
  for (const [index, {id, filename}] of selected.entries()) {
    console.log(`[${index + 1}/${selected.length}] ${id} → ${filename}`);
    remotion('render', bundle, id, join(work, filename), '--codec=gif', '--image-format=png', '--scale=0.875', '--concurrency=4');
  }
  mkdirSync(output, {recursive: true});
  for (const {filename} of selected) copyFileSync(join(work, filename), join(output, filename));
} finally {
  rmSync(work, {recursive: true, force: true});
}
