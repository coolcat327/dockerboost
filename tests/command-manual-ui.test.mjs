import test from 'node:test';
import assert from 'node:assert/strict';
import { feature } from '../src/client/features/manual/index.js';

function element() {
  return {
    value: '', textContent: '', dataset: {}, children: [], listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    setAttribute() {}, querySelectorAll() { return []; }
  };
}

test('manual waits for activation, shows failures and retries with the current search', async t => {
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: 'zh-CN' }, createElement: element };
  t.after(() => { globalThis.document = previousDocument; });
  const nodes = new Map();
  const panel = {
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); },
    querySelectorAll() { return []; }
  };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) throw Error('network');
    return Response.json([{ id: 'docker-logs', family: 'docker', command: 'docker logs', url: 'https://docs.docker.com/', summary: { 'zh-CN': '查看日志', en: 'Read logs' }, usage: 'docker logs CONTAINER', examples: [{ code: 'docker logs web', description: { 'zh-CN': '查看 web 日志', en: 'Read web logs' } }], options: [] }]);
  });
  const instance = feature.init({ panel, messages: () => feature.messages['zh-CN'] });
  instance.setLanguage();
  assert.equal(calls, 0);
  await instance.onActivate();
  assert.equal(calls, 1);
  assert.match(panel.querySelector('[data-manual-count]').textContent, /加载失败/);
  panel.querySelector('#manual-search').value = 'logs';
  const retry = panel.querySelector('[data-manual-list]').children[0];
  await retry.listeners.click();
  assert.equal(calls, 2);
  assert.equal(panel.querySelector('[data-manual-count]').textContent, '1 条命令');
  assert.equal(panel.querySelector('[data-manual-list]').children[0].children[0].textContent, 'docker logs');
  await instance.onActivate();
  assert.equal(calls, 2);
});
