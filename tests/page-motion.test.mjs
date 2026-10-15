import assert from 'node:assert/strict';
import test from 'node:test';
import { initPageMotion } from '../src/client/page-motion.js';

function environment(t) {
  const eventTarget = () => {
    const listeners = new Map();
    return { addEventListener(type, fn) { listeners.set(type, fn); }, emit(type, event) { listeners.get(type)?.(event); } };
  };
  const element = () => {
    const classes = new Set();
    const properties = new Map();
    return { ...eventTarget(), properties, classList: { add: (s) => classes.add(s), remove: (s) => classes.delete(s), contains: (s) => classes.has(s), toggle(s, on) { if (on) classes.add(s); else classes.delete(s); } }, style: { setProperty: (k, v) => properties.set(k, v), removeProperty: (k) => properties.delete(k) }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  };
  const root = element();
  const hero = element();
  const stage = element();
  const reduced = { ...eventTarget(), matches: false };
  const pointer = { ...eventTarget(), matches: true };
  const frames = new Map();
  let sequence = 0;
  let intersection;
  const document = { ...eventTarget(), hidden: false, documentElement: root, querySelector: (s) => s === '.hero' ? hero : stage };
  class IntersectionObserver { constructor(fn) { intersection = fn; } observe() {} }
  const window = { matchMedia: (q) => q.includes('reduce') ? reduced : pointer, IntersectionObserver };
  for (const [name, value] of Object.entries({ document, window, IntersectionObserver, requestAnimationFrame: (fn) => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: (id) => frames.delete(id) })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
  initPageMotion();
  return { root, hero, stage, reduced, pointer, frames, document, intersect: (visible) => intersection([{ isIntersecting: visible }]), flush: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn()); } };
}

test('hidden pages cancel queued pointer writes and reset decorative transforms', (t) => {
  const e = environment(t);
  e.hero.emit('pointermove', { clientX: 100, clientY: 100 });
  e.document.hidden = true;
  e.document.emit('visibilitychange');
  e.flush();
  assert.equal(e.root.classList.contains('motion-paused'), true);
  assert.equal(e.hero.properties.size, 0);
  e.document.hidden = false;
  e.document.emit('visibilitychange');
  assert.equal(e.root.classList.contains('motion-paused'), false);
});

test('pointer updates coalesce, stay bounded and stop when preferences change', (t) => {
  const e = environment(t);
  for (let i = 0; i < 10; i++) e.hero.emit('pointermove', { clientX: 400, clientY: -30 });
  assert.equal(e.frames.size, 1);
  e.flush();
  assert.equal(e.hero.properties.get('--art-x'), '6px');
  assert.equal(e.hero.properties.get('--art-y'), '-6px');
  e.reduced.matches = true;
  e.reduced.emit('change');
  e.hero.emit('pointermove', { clientX: 20, clientY: 20 });
  assert.equal(e.frames.size, 0);
  assert.equal(e.hero.properties.size, 0);
});

test('leaving the Hero pauses the background while the workspace remains interactive', (t) => {
  const e = environment(t);
  e.intersect(false);
  assert.equal(e.root.classList.contains('motion-paused'), true);
  e.stage.emit('pointermove', { clientX: 40, clientY: 50 });
  e.flush();
  assert.equal(e.stage.classList.contains('has-pointer'), true);
  e.stage.emit('pointerleave');
  assert.equal(e.stage.classList.contains('has-pointer'), false);
  e.intersect(true);
  assert.equal(e.root.classList.contains('motion-paused'), false);
});
