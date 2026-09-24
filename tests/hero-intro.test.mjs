import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

for (const [viewportWidth, hash] of [768, 390].flatMap((width) =>
  ['', '#download?image=nginx&source=auto&platform=linux/amd64'].map((value) => [width, value]))) {
  test(`intro preserves the Hero layout at ${viewportWidth}px with ${hash ? 'a share link' : 'the home URL'} and returns the art on scroll`, () => {
    const artWidth = Math.min(560, viewportWidth - 40);
    const artHeight = artWidth * 340 / 560;
    const listeners = new Map();
    const window = {
      scrollY: 0,
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type) { listeners.delete(type); },
    };
    const visual = {
      style: {},
      append(child) { child.parent = this; },
      querySelector() { return art; },
      getBoundingClientRect() {
        return { height: art.parent === this ? artHeight : Number.parseFloat(this.style.height) || 170 };
      },
    };
    const art = {
      complete: true,
      naturalWidth: 560,
      style: {},
      parent: visual,
      getBoundingClientRect() {
        return { left: (viewportWidth - artWidth) / 2, top: 108, width: artWidth, height: artHeight };
      },
      addEventListener() {},
      removeEventListener() {},
    };
    const body = { append(child) { child.parent = this; } };
    const content = [{ style: {} }];
    const document = {
      body,
      querySelector() { return visual; },
      querySelectorAll() { return content; },
    };
    const gsap = {
      matchMedia() { return { add(_query, callback) { callback(); } }; },
      set(target, properties) {
        for (const element of [target].flat()) {
          if (properties.clearProps === 'all') element.style = {};
          else if (properties.clearProps) {
            for (const name of properties.clearProps.split(',')) delete element.style[name];
          }
          else Object.assign(element.style, properties);
        }
      },
      timeline() {
        return {
          to() { return this; },
          set() { return this; },
          kill() {},
        };
      },
    };
    const source = readFileSync(new URL('../src/client/hero-intro.js', import.meta.url), 'utf8')
      .replace("import { gsap } from 'gsap';", '')
      .replace('export const initHeroIntro =', 'const initHeroIntro =');
    const initHeroIntro = vm.runInNewContext(`${source}\ninitHeroIntro`, {
      gsap, window, document, location: { hash }, innerWidth: viewportWidth, innerHeight: 800,
    });

    const copyTop = () => 108 + visual.getBoundingClientRect().height + 26;
    const originalCopyTop = copyTop();
    initHeroIntro({ allowHash: Boolean(hash) });
    assert.equal(art.parent, body, 'intro should start with the art in the fixed overlay');
    assert.equal(copyTop(), originalCopyTop, 'moving the art must not pull the mobile title upward');
    window.scrollY = 300;
    listeners.get('scroll')?.();
    assert.equal(art.parent, visual, 'scroll should return the art to the Hero immediately');
    assert.notEqual(art.style.position, 'fixed', 'art should no longer be fixed after scroll');
    assert.equal(visual.style.height, undefined, 'temporary layout height should be cleared');
  });
}
