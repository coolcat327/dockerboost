import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkApiBoundaries } from '../scripts/check-api-boundaries.mjs';

async function fixture(t, contents) {
  const root = await mkdtemp(join(tmpdir(), 'dockerboost-api-boundaries-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(contents)) {
    await mkdir(dirname(join(root, name)), { recursive: true }); await writeFile(join(root, name), source);
  }
  return root;
}
test('API boundaries allow module entry points and module-local/common imports', async t => {
  const root = await fixture(t, {
    'index.ts': "import {routes} from './routes/a/index';",
    'routes/a/index.ts': "export {routes} from './handlers';",
    'routes/a/handlers.ts': "import type {Env} from '../../common/types'; export const routes = {};",
    'common/types.ts': 'export type Env = {};'
  });
  assert.deepEqual(await checkApiBoundaries(root), []);
});
test('API boundaries reject common-to-route and cross-module static, type and dynamic imports', async t => {
  const root = await fixture(t, {
    'index.ts': "import './routes/a/internal';",
    'routes/a/index.ts': "export * from '../b/index'; type Hidden = import('../b/internal').Secret; void import('../b/internal');",
    'routes/a/internal.ts': '',
    'routes/b/index.ts': '',
    'routes/b/internal.ts': 'export type Secret = string;',
    'common/types.ts': "export * from '../routes/a/index';"
  });
  const errors = await checkApiBoundaries(root);
  assert.equal(errors.length, 5);
  assert.ok(errors.some(error => error.includes('common 不能依赖')));
  assert.ok(errors.some(error => error.includes('入口只能引用')));
});
test('API boundaries reject flat routes and missing module entry points', async t => {
  const root = await fixture(t, { 'routes/flat.ts': '', 'routes/module/handler.ts': '' });
  const errors = await checkApiBoundaries(root);
  assert.equal(errors.length, 2);
  assert.ok(errors.some(error => error.includes('缺少公开路由入口')));
});
