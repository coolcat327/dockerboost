import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadProgress } from '../src/client/common/download-progress.js';

function fixture() {
  const node = () => ({ textContent: '', hidden: false, dataset: {}, style: {}, attributes: {},
    classList: { values: new Set(), toggle(name, on) { on ? this.values.add(name) : this.values.delete(name); } },
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; }
  });
  const elements = Object.fromEntries(['row', 'status', 'detail', 'metrics', 'track', 'fill', 'icon'].map(key => [key, node()]));
  let time = 0;
  const view = createDownloadProgress({ ...elements, clock: () => time });
  return { ...elements, view, advance: value => { time += value; } };
}

test('download bytes, packaging and save handoff have distinct honest progress', () => {
  const f = fixture();
  f.view.start('bundle.tar');
  assert.equal(f.track.attributes['aria-valuenow'], undefined);
  f.view.update({ phase: 'download', completed: 0, total: 4096 });
  f.advance(1000);
  f.view.update({ phase: 'download', completed: 2048, total: 4096 });
  assert.equal(f.track.attributes['aria-valuenow'], '50');
  assert.equal(f.fill.style.width, '50%');
  assert.match(f.status.textContent, /50%/);
  assert.match(f.metrics.textContent, /2.0 KB \/ 4.0 KB · 速度: 2.0 KB\/s/);
  f.view.update({ phase: 'download', completed: 4096, total: 4096 });
  assert.equal(f.track.attributes['aria-valuenow'], '100');
  f.view.update({ phase: 'export' });
  assert.equal(f.track.attributes['aria-valuenow'], undefined);
  assert.equal(f.metrics.hidden, true);
  assert.equal(f.track.classList.values.has('is-indeterminate'), true);
  f.view.update({ phase: 'done', completed: 6144, total: 6144 });
  assert.equal(f.row.dataset.phase, 'handoff');
  assert.equal(f.track.attributes['aria-valuenow'], undefined);
  f.advance(1000);
  f.view.complete({ filename: 'bundle.tar', size: 6144 });
  assert.equal(f.status.textContent, '已交给浏览器保存');
  assert.equal(f.track.attributes['aria-valuenow'], '100');
  assert.equal(f.track.classList.values.has('is-indeterminate'), false);
  assert.match(f.metrics.textContent, /6.0 KB · 总耗时: 2.0秒/);
});

test('unknown totals never expose a fabricated percentage and language changes preserve state', () => {
  const f = fixture();
  f.view.start('long-filename.tar');
  f.view.update({ phase: 'download', completed: 512 });
  f.view.setLanguage('en');
  assert.equal(f.track.attributes['aria-valuenow'], undefined);
  assert.equal(f.status.textContent, 'Downloading');
  assert.match(f.metrics.textContent, /512 B · Total size unknown/);
  assert.equal(f.detail.textContent, 'long-filename.tar');
  f.advance(61250);
  f.view.complete({ filename: 'long-filename.tar', size: 1024 });
  assert.match(f.metrics.textContent, /Total time: 1m 1.3s/);
  f.view.setLanguage('zh-CN');
  assert.match(f.metrics.textContent, /总耗时: 1分1.3秒/);
});

test('failure, stop, retry and selection reset clear stale progress and speed', () => {
  const f = fixture();
  f.view.start('first.tar');
  f.view.update({ phase: 'download', completed: 50, total: 100 });
  f.view.fail(new Error('Disk full'));
  assert.equal(f.row.dataset.phase, 'error');
  assert.equal(f.detail.textContent, 'Disk full');
  assert.equal(f.track.hidden, true);
  assert.equal(f.track.classList.values.has('is-indeterminate'), false);
  f.view.start('second.tar');
  assert.equal(f.detail.textContent, 'second.tar');
  assert.equal(f.metrics.textContent, '');
  assert.equal(f.track.attributes['aria-valuenow'], undefined);
  f.view.fail(new Error('Abort'), true);
  f.view.setLanguage('en');
  assert.equal(f.status.textContent, 'Download stopped');
  assert.equal(f.track.hidden, true);
  f.view.info('Versions ready.');
  assert.equal(f.detail.textContent, '');
  assert.equal(f.metrics.hidden, true);
  f.view.clear();
  assert.equal(f.row.hidden, true);
});

test('chunk updates are throttled but phase, file and final byte updates render immediately', () => {
  const f = fixture();
  f.view.start('bundle.tar');
  f.view.update({ phase: 'download', name: 'docker.tgz', completed: 0, total: 100 });
  f.advance(1);
  f.view.update({ phase: 'download', name: 'docker.tgz', completed: 10, total: 100 });
  assert.equal(f.track.attributes['aria-valuenow'], '0');
  f.view.update({ phase: 'download', name: 'compose', completed: 40, total: 100 });
  assert.equal(f.track.attributes['aria-valuenow'], '40');
  f.view.update({ phase: 'download', completed: 100, total: 100 });
  assert.equal(f.track.attributes['aria-valuenow'], '100');
});

test('preparation and unknown size start with no fabricated fill, including retries', () => {
  const f = fixture();
  f.view.start('first.tar');
  assert.equal(f.fill.style.width, '0%');
  f.view.update({ phase: 'resolve' });
  assert.equal(f.fill.style.width, '0%');
  f.view.update({ phase: 'download', completed: 0 });
  assert.equal(f.fill.style.width, '0%');
  f.view.update({ phase: 'download', completed: 0, total: 4096 });
  assert.equal(f.fill.style.width, '0%');
  assert.equal(f.track.attributes['aria-valuenow'], '0');
  f.view.complete({ filename: 'first.tar', size: 4096 });
  f.view.start('second.tar');
  assert.equal(f.fill.style.width, '0%');
  assert.equal(f.track.attributes['aria-valuenow'], undefined);
});
