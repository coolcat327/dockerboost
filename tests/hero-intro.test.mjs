import assert from 'node:assert/strict';
import test from 'node:test';
import { initHeroIntro } from '../src/client/hero-intro.js';

function environment(t, { width = 390, reduce = false, hash = '', hidden = false } = {}) {
  const target = () => {
    const listeners = new Map();
    return { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name), emit: (name) => listeners.get(name)?.() };
  };
  const classes = new Set();
  const animations = [];
  const overlays = [];
  const frames = [];
  const reduced = { ...target(), matches: reduce };
  const animate = (frames, options) => {
    const animation = { frames, options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  };
  const art = { ...target(), complete: true, naturalWidth: 560, animate, parent: 'hero', getBoundingClientRect: () => ({ left: 20, top: 120, width: width - 40, height: 200 }), cloneNode: () => ({ style: {}, removeAttribute() {}, animate }) };
  const root = { classList: { add: (s) => classes.add(s), remove: (s) => classes.delete(s) } };
  const document = { ...target(), hidden, documentElement: root, querySelector: () => art, body: { append: (e) => overlays.push(e) }, createElement: () => ({ setAttribute() {}, append(child) { this.child = child; }, animate, remove() { this.removed = true; } }) };
  const window = { ...target(), scrollY: 0, innerWidth: width, innerHeight: 844, matchMedia: () => reduced };
  for (const [name, value] of Object.entries({ document, window, location: { hash }, requestAnimationFrame: fn => frames.push(fn) })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
  return { art, root, classes, document, window, reduced, overlays, animations, paint: () => frames.splice(0).forEach(fn => fn()) };
}

for (const width of [390, 1440]) {
  test(`center intro retains the real art and cancels cleanly on scroll at ${width}px`, (t) => {
    const e = environment(t, { width });
    initHeroIntro();
    assert.equal(e.art.parent, 'hero');
    assert.equal(e.classes.has('hero-intro-active'), true);
    assert.equal(e.animations[0].options.delay, 400);
    assert.equal(e.animations[0].options.duration, 1050);
    assert.match(e.animations[0].frames[0].transform, /translate/);
    e.window.emit('scroll');
    assert.equal(e.overlays[0].removed, true);
    assert.equal(e.classes.has('hero-intro-active'), false);
    assert.equal(e.animations.every((a) => a.cancelled), true);
  });
}
for (const options of [{ reduce: true }, { hash: '#download?image=nginx' }]) {
  test(`intro skips for ${options.reduce ? 'reduced motion' : 'direct share links'}`, async (t) => {
    const e = environment(t, options);
    await initHeroIntro();
    assert.equal(e.overlays.length, 0);
    assert.equal(e.classes.size, 0);
  });
}
test('interaction and a changed motion preference immediately reveal the original', (t) => {
  const e = environment(t);
  initHeroIntro();
  e.reduced.matches = true;
  e.reduced.emit('change');
  e.window.emit('pointerdown');
  assert.equal(e.overlays[0].removed, true);
  assert.equal(e.classes.size, 0);
});

test('mobile browser height changes preserve intro while width changes cancel it', (t) => {
  const e = environment(t);
  initHeroIntro();
  e.window.innerHeight = 760;
  e.window.emit('resize');
  assert.equal(e.classes.has('hero-intro-active'), true);
  e.window.innerWidth = 844;
  e.window.emit('resize');
  assert.equal(e.classes.has('hero-intro-active'), false);
});
test('background tools load immediately while intro waits until visible and starts only once', async (t) => {
  const e = environment(t, { hidden: true });
  await initHeroIntro();
  assert.equal(e.overlays.length, 0);
  e.document.hidden = false;
  e.document.emit('visibilitychange');
  e.document.emit('visibilitychange');
  assert.equal(e.overlays.length, 1);
  assert.equal(e.classes.has('hero-intro-active'), true);
  e.window.emit('pagehide');
});

test('cold images and their decorative copy decode before tools are released after a paint', async (t) => {
  const e = environment(t);
  e.art.complete = false;
  let decodeArt, decodeCopy;
  e.art.decode = () => new Promise(resolve => { decodeArt = resolve; });
  const clone = e.art.cloneNode();
  clone.decode = () => new Promise(resolve => { decodeCopy = resolve; });
  e.art.cloneNode = () => clone;
  let ready = false;
  const startup = initHeroIntro().then(() => { ready = true; });
  e.art.emit('load');
  assert.equal(e.overlays.length, 0);
  decodeArt(); await Promise.resolve();
  assert.equal(e.overlays.length, 0);
  decodeCopy(); await Promise.resolve();
  assert.equal(e.overlays.length, 1);
  assert.equal(ready, false);
  e.paint(); await Promise.resolve();
  assert.equal(ready, false);
  e.paint(); await startup;
  assert.equal(ready, true);
  assert.equal(e.animations.every(a => !a.cancelled), true, 'tools load while the intro is still playing');
  assert.deepEqual(e.animations[1].frames.map(frame => frame.opacity), [1, 1, 0]);
  e.window.emit('pagehide');
});

test('interaction while decoding releases tools and prevents a late intro', async (t) => {
  const e = environment(t);
  let decoded;
  e.art.decode = () => new Promise(resolve => { decoded = resolve; });
  const startup = initHeroIntro();
  e.window.emit('pointerdown');
  await startup;
  decoded(); await Promise.resolve();
  assert.equal(e.overlays.length, 0);
});

test('a failed decode releases tools without covering the page', async (t) => {
  const e = environment(t);
  e.art.decode = () => Promise.reject(new Error('decode failed'));
  await initHeroIntro();
  assert.equal(e.overlays.length, 0);
  assert.equal(e.classes.size, 0);
});

test('slow images time out without delaying tools indefinitely', async (t) => {
  const e = environment(t);
  e.art.complete = false;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let ready = false;
  const startup = initHeroIntro().then(() => { ready = true; });
  t.mock.timers.tick(1499); await Promise.resolve();
  assert.equal(ready, false);
  t.mock.timers.tick(1); await startup;
  e.art.emit('load');
  assert.equal(e.overlays.length, 0);
});
