import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the real app, language and share code without starting tool business logic.
const { outputFiles } = await build({
  entryPoints: [new URL('../src/client/app.js', import.meta.url).pathname],
  bundle: true, format: 'esm', write: false,
  plugins: [{ name: 'tool-fixtures', setup(builder) {
    builder.onResolve({ filter: /^\.\/(features\/index|page-motion)\.js$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path.includes('features')
      ? 'export const features = globalThis.appTestFeatures;'
      : 'export const initPageMotion = () => {};' }));
  } }],
});
let revision = 0;
const startApp = () => import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}#${++revision}`);

function element() {
  const listeners = new Map(), attributes = new Map(), classes = new Set();
  return {
    children: [], dataset: {}, lastChild: { textContent: '' }, isConnected: true,
    offsetLeft: 0, offsetWidth: 120, clientWidth: 720, scrollLeft: 0,
    classList: {
      add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle(name, force) { const active = force ?? !classes.has(name); if (active) classes.add(name); else classes.delete(name); },
    },
    style: { setProperty() {} },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
    emit(name, event = {}) { for (const callback of listeners.get(name) || []) callback(event); },
    setAttribute: (name, value) => attributes.set(name, value), getAttribute: name => attributes.get(name),
    append(...children) { children.forEach(child => { child.isConnected = this.isConnected; }); this.children.push(...children); },
    prepend(child) { child.isConnected = this.isConnected; this.children.unshift(child); },
    replaceChildren(...children) { this.children = children; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() { this.focused = true; }, scrollIntoView() {},
  };
}

function environment(t, { hash = '', pathname = '/', search = '', failId, failLanguage = false } = {}) {
  const ids = ['install', 'setup', 'pull', 'download', 'convert', 'manual'];
  const tabs = new Map(ids.map(id => [id, element()])), panels = new Map(ids.map(id => [id, element()]));
  const contexts = new Map(), instances = new Map(), initCalls = [], historyWrites = [];
  const features = ids.map(id => ({
    id, selectionGroup: ['pull', 'download'].includes(id) ? 'image' : undefined,
    messages: { 'zh-CN': { tab: id }, en: { tab: id } },
    init(context) {
      initCalls.push(id); contexts.set(id, context);
      if (id === failId && !failLanguage) throw new Error('init failed');
      const instance = { activations: 0, languages: [], value: '',
        onActivate() { this.activations++; },
        setLanguage(message) { if (id === failId && failLanguage) throw new Error('language failed'); this.languages.push(message); },
      };
      instances.set(id, instance);
      return instance;
    },
  }));
  const chinese = element(), english = element();
  chinese.dataset.language = 'zh-CN'; english.dataset.language = 'en';
  const document = { ...element(), documentElement: { lang: 'zh-CN' },
    querySelector(selector) {
      const match = selector.match(/data-(tab|panel)="([^"]+)"/);
      return match ? (match[1] === 'tab' ? tabs : panels).get(match[2]) : element();
    },
    querySelectorAll: selector => selector === '.language' ? [chinese, english] : [],
    createElement: () => ({ ...element(), isConnected: false }),
  };
  let reloads = 0;
  const window = { ...element(), location: { hash, pathname, search, reload() { reloads++; } },
    history: { state: null, replaceState(state, title, path) { historyWrites.push(path); window.location.hash = ''; } },
  };
  for (const [name, value] of Object.entries({ document, window, appTestFeatures: features,
    localStorage: { getItem: () => 'zh-CN', setItem() {} }, navigator: { language: 'zh-CN' },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name]; });
  }
  t.mock.method(console, 'error', () => {});
  return { tabs, panels, contexts, instances, features, initCalls, historyWrites, window, english, reloads: () => reloads };
}

test('tab activation is synchronous and instances, state and shared selection survive switching', async t => {
  const e = environment(t);
  await startApp();
  assert.deepEqual(e.initCalls, ['install']);
  e.tabs.get('setup').emit('click');
  assert.deepEqual(e.initCalls, ['install', 'setup'], 'no promise or loading phase before init');
  e.instances.get('setup').value = 'keep this input';
  e.tabs.get('install').emit('click');
  e.tabs.get('setup').emit('click');
  assert.equal(e.instances.get('setup').value, 'keep this input');
  assert.equal(e.instances.get('setup').activations, 2);
  assert.deepEqual(e.initCalls, ['install', 'setup']);
  e.english.emit('click');
  assert.equal(e.instances.get('setup').languages.at(-1), e.features[1].messages.en);
  let prevented = false;
  e.tabs.get('setup').emit('keydown', { key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(e.tabs.get('pull').focused, true);
  assert.equal(e.tabs.get('pull').getAttribute('aria-selected'), 'true');
  e.tabs.get('download').emit('click');
  assert.equal(e.contexts.get('pull').selectionStore, e.contexts.get('download').selectionStore);
  assert.equal(e.initCalls.includes('manual'), false);
  assert.ok([...e.panels.values()].every(panel => panel.children.length === 0), 'successful tools need no loading or error nodes');
});

for (const failLanguage of [false, true]) {
  test(`${failLanguage ? 'language setup' : 'initialization'} failure is isolated, translated and never initialized twice`, async t => {
    const e = environment(t, { failId: 'setup', failLanguage });
    await startApp();
    e.tabs.get('setup').emit('click');
    const panel = e.panels.get('setup'), status = panel.children[0];
    assert.equal(panel.classList.contains('feature-failed'), true);
    assert.equal(status.className, 'feature-error-status');
    assert.equal(status.getAttribute('role'), 'status');
    assert.match(status.children[0].textContent, /初始化失败/);
    const [message, retry] = status.children;
    retry.focus();
    e.english.emit('click');
    assert.match(status.children[0].textContent, /Could not initialize/);
    assert.equal(status.children[1].textContent, 'Refresh page');
    assert.equal(status.children[0], message);
    assert.equal(status.children[1], retry, 'language changes preserve the error controls');
    assert.equal(retry.focused, true);
    e.tabs.get('install').emit('click');
    e.tabs.get('setup').emit('click');
    assert.equal(e.initCalls.filter(id => id === 'setup').length, 1);
    assert.equal(e.instances.get('install').activations, 2);
    assert.equal(panel.children.length, 1, 'error node must be reused');
    status.children[1].emit('click');
    assert.equal(e.reloads(), 1);
  });
}

for (const failId of [undefined, 'download']) {
  test(`shared link targets only its destination and ${failId ? 'survives failed' : 'clears after successful'} initialization`, async t => {
    const hash = '#download?image=nginx%3Alatest&source=auto&platform=linux%2Farm64';
    const e = environment(t, { hash, pathname: '/tools', search: '?view=compact', failId });
    await startApp();
    assert.deepEqual(e.initCalls, ['download']);
    const { image, source, platform } = e.contexts.get('download').selectionStore.snapshot();
    assert.deepEqual({ image, source, platform }, { image: 'nginx:latest', source: 'auto', platform: 'linux/arm64' });
    assert.equal(e.contexts.get('download').selectionStore.snapshot().platformIntent, 'linux/arm64');
    assert.deepEqual(e.historyWrites, failId ? [] : ['/tools?view=compact']);
    assert.equal(e.window.location.hash, failId ? hash : '');
  });
}

test('queue share activates only download and leaves fragment cleanup to the queue restorer', async t => {
  const hash = '#download-batch?data=fixture';
  const e = environment(t, { hash });
  await startApp();
  assert.deepEqual(e.initCalls, ['download']);
  assert.equal(e.contexts.get('download').sharedBatchHash, hash);
  assert.deepEqual(e.historyWrites, []);
  assert.equal(e.window.location.hash, hash);
});

test('copy does not mark changed content as copied while clipboard access is pending', async t => {
  const e = environment(t);
  const toast = element(), target = { ...element(), innerText: 'old command' }, button = element();
  button.dataset.copy = 'command';
  let finish;
  const clipboard = new Promise(resolve => { finish = resolve; });
  const originalQuery = globalThis.document.querySelector;
  globalThis.document.querySelector = selector => selector === '#toast' ? toast : originalQuery(selector);
  globalThis.document.getElementById = id => id === 'command' ? target : null;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLTextAreaElement');
  Object.defineProperty(globalThis, 'HTMLTextAreaElement', { configurable: true, value: class {} });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'HTMLTextAreaElement', descriptor); else delete globalThis.HTMLTextAreaElement; });
  globalThis.navigator.clipboard = { writeText: () => clipboard };
  await startApp();
  globalThis.document.emit('click', { target: { closest: () => button } });
  target.innerText = 'new command';
  finish();
  await new Promise(setImmediate);
  assert.equal(button.classList.contains('is-copied'), false);
  assert.equal(toast.textContent, '内容已变化，请重新复制');
  assert.ok(e.instances.has('install'));
});


test('the tools and language switching remain usable when local storage is unavailable', async t => {
  const e = environment(t);
  t.mock.method(globalThis.localStorage, 'getItem', () => { throw new DOMException('Storage blocked', 'SecurityError'); });
  t.mock.method(globalThis.localStorage, 'setItem', () => { throw new DOMException('Storage blocked', 'SecurityError'); });
  await startApp();
  assert.deepEqual(e.initCalls, ['install']);
  e.english.emit('click');
  assert.equal(document.documentElement.lang, 'en');
  e.tabs.get('setup').emit('click');
  assert.equal(e.instances.get('setup').languages.at(-1), e.features[1].messages.en);
});
