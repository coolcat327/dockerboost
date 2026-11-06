import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/client/features/convert/index.js'], bundle: true, write: false, format: 'esm', plugins: [{ name: 'converter-fixture', setup(builder) {
  builder.onResolve({ filter: /^\.\/converter\.js$/ }, () => ({ path: 'converter', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const convert = (...args) => globalThis.convertTest(...args);' }));
} }] });

test('conversion waits for IME composition while clearing the previous result', async t => {
  const node = () => ({ value: '', textContent: '', hidden: false, dataset: {}, listeners: {}, classList: { toggle() {}, remove() {} }, addEventListener(name, fn) { this.listeners[name] = fn; }, removeAttribute() {}, setAttribute() {}, replaceChildren() {} });
  const input = node(), output = node(), status = node(), notices = node(), form = node();
  const nodes = new Map([['#convert-input', input], ['#convert-output', output], ['[data-convert-status]', status], ['[data-convert-notices]', notices], ['form', form]]);
  const panel = { querySelector: key => nodes.get(key), querySelectorAll: () => [] };
  const previous = globalThis.convertTest;
  t.after(() => { if (previous === undefined) delete globalThis.convertTest; else globalThis.convertTest = previous; });
  const calls = [];
  globalThis.convertTest = (value, direction) => { calls.push([value, direction]); return { output: 'converted', warnings: [] }; };
  const { feature } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
  feature.init({ panel, messages: () => feature.messages['zh-CN'] });
  output.value = 'old result';
  input.listeners.compositionstart(); input.value = '拼'; input.listeners.input();
  assert.equal(output.value, ''); assert.deepEqual(calls, []);
  input.value = '拼写'; input.listeners.compositionend();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [['拼写', 'run-to-compose']]); assert.equal(output.value, 'converted');
});
