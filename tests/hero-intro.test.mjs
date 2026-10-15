import assert from 'node:assert/strict';
import test from 'node:test';
import { initHeroIntro } from '../src/client/hero-intro.js';

function environment(t, { width = 390, reduce = false, hash = '' } = {}) {
  const target = () => {
    const listeners = new Map();
    return { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name), emit: (name) => listeners.get(name)?.() };
  };
  const classes = new Set();
  const animations = [];
  const overlays = [];
  const reduced = { ...target(), matches: reduce };
  const animate = (frames, options) => {
    const animation = { frames, options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  };
  const art = { ...target(), complete: true, naturalWidth: 560, animate, parent: 'hero', getBoundingClientRect: () => ({ left: 20, top: 120, width: width - 40, height: 200 }), cloneNode: () => ({ style: {}, removeAttribute() {}, animate }) };
  const root = { classList: { add: (s) => classes.add(s), remove: (s) => classes.delete(s) } };
  const document = { ...target(), hidden: false, documentElement: root, querySelector: () => art, body: { append: (e) => overlays.push(e) }, createElement: () => ({ setAttribute() {}, append(child) { this.child = child; }, animate, remove() { this.removed = true; } }) };
  const window = { ...target(), scrollY: 0, innerWidth: width, innerHeight: 844, matchMedia: () => reduced };
  for (const [name, value] of Object.entries({ document, window, location: { hash } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
  return { art, root, classes, document, window, reduced, overlays, animations };
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
  test(`intro skips for ${options.reduce ? 'reduced motion' : 'direct share links'}`, (t) => {
    const e = environment(t, options);
    initHeroIntro();
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
