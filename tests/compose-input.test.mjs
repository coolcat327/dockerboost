import test from 'node:test';
import assert from 'node:assert/strict';
import { bindComposeInput } from '../src/client/common/compose-input.js';

function setup() {
  const control = () => ({ value: '', files: [], events: {}, classList: { add() {}, remove() {} }, addEventListener(name, fn) { this.events[name] = fn; } });
  const input = control(), upload = control(), parsed = [], errors = [];
  bindComposeInput({ input, upload, delay: 5, onChange() {}, onParse: () => parsed.push(input.value), onError: error => errors.push(error.message) });
  return { input, upload, parsed, errors };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const pause = () => new Promise(resolve => setTimeout(resolve, 15));
const file = (name, text, size = text.length) => ({ name, size, text: async () => text });

test('pasted/typed input is parsed once after editing pauses; IME waits for composition', async () => {
  const { input, parsed } = setup();
  input.value = 'old'; input.events.input();
  input.value = 'latest'; input.events.input(); await pause();
  assert.deepEqual(parsed, ['latest']);
  input.events.compositionstart(); input.value = 'composing'; input.events.input(); await pause();
  assert.deepEqual(parsed, ['latest']);
  input.events.compositionend(); await pause(); assert.deepEqual(parsed, ['latest', 'composing']);
});

test('file selection and file drop parse immediately and enforce one supported file under 1 MiB', async () => {
  const { input, upload, parsed, errors } = setup();
  upload.files = [file('compose.yaml', 'uploaded')]; upload.events.change(); await tick();
  assert.deepEqual(parsed, ['uploaded']);
  let prevented = false;
  input.events.drop({ dataTransfer: { types: ['Files'], files: [file('compose.yml', 'dropped')] }, preventDefault() { prevented = true; } }); await tick();
  assert.equal(prevented, true); assert.deepEqual(parsed, ['uploaded', 'dropped']);
  for (const files of [[file('compose.yaml', '', 1024 * 1024 + 1)], [file('wrong.png', '')], [file('a.yml', ''), file('b.yml', '')]]) {
    upload.files = files; upload.events.change(); await tick();
  }
  assert.equal(errors.length, 3); assert.equal(parsed.length, 2);
});

test('a slow file read cannot overwrite newer text or a later upload', async () => {
  const { input, upload, parsed } = setup(); let resolve;
  upload.files = [{ name: 'old.yml', size: 10, text: () => new Promise(done => { resolve = done; }) }];
  upload.events.change(); input.value = 'new edit'; input.events.input(); resolve('old file'); await pause();
  assert.equal(input.value, 'new edit'); assert.deepEqual(parsed, ['new edit']);
});
