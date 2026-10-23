import { createBatchQueue } from './batch-queue.js';
import { createDownloadProgress } from '../../common/download-progress.js';
import { composeImages, batchScript } from './compose.js';
import { imageReference } from '../../common/image-reference.js';
import { exportArchive } from './export-archive.js';

export function initBatch({ panel, singleBusy, selectionStore }) {
  const single = document.createElement('div');
  const heading = panel.querySelector('.panel-copy');
  while (heading.nextSibling) single.append(heading.nextSibling);
  const modes = document.createElement('div');
  modes.className = 'download-modes';
  modes.innerHTML = '<button type="button" class="generate-button button-secondary" aria-pressed="true">单个</button><button type="button" class="generate-button button-secondary" aria-pressed="false">批量</button>';
  const batch = document.createElement('div');
  batch.className = 'compose-batch';
  batch.hidden = true;
  batch.innerHTML = `<details data-editor open><summary data-text="input"></summary><label for="compose-input" data-text="input"></label><textarea id="compose-input" rows="8" spellcheck="false" placeholder="services:\n  web:\n    image: nginx:latest"></textarea>
  <div class="batch-actions"><input type="file" accept=".yaml,.yml,.txt" aria-label="Compose YAML"><button type="button" class="generate-button" data-action="parse" data-text="parse"></button></div>
  </details><p data-text="note"></p><div class="batch-actions"><label><span data-text="source"></span><select data-source><option value="auto">Auto</option></select></label><label><span data-text="platform"></span><select data-platform><option>linux/amd64</option><option>linux/arm64</option><option>linux/arm/v7</option></select></label></div>
  <p data-errors role="status"></p><div class="batch-list-toolbar"><label><input type="checkbox" data-all><span data-text="all"></span></label><span data-count></span><button type="button" class="generate-button button-secondary" data-action="retry" data-text="retry"></button></div><div data-list tabindex="0" role="region" aria-label="Images"></div><div class="batch-actions"><button type="button" class="generate-button" data-action="download" data-text="download" disabled></button><button type="button" class="generate-button button-secondary" data-action="stop" data-text="stop"></button><button type="button" class="generate-button button-secondary" data-action="script" data-text="script" disabled></button><button type="button" class="generate-button button-secondary" data-action="copy" data-text="copy" disabled></button></div><p data-summary role="status" aria-live="polite"></p><details class="batch-script"><summary data-text="terminal"></summary><pre class="command-block"><code data-command></code></pre></details>`;
  panel.append(modes, single, batch);
  const $ = selector => batch.querySelector(selector);
  const scriptActions = document.createElement('div'); scriptActions.className = 'batch-actions';
  scriptActions.append($('[data-action=script]'), $('[data-action=copy]'));
  $('.batch-script').insertBefore(scriptActions, $('.batch-script pre'));

  let rows = [], sources = [], english = false, issues = [];
  const issueText = text => english ? text : text.replace("missing image (build is not executed)", "未配置 image，无法下载；不执行 build").replace("unresolved variable or invalid platform", "变量未展开或平台格式无效").replace("invalid image or platform", "镜像或平台格式无效").replace("extends requires docker compose config", "extends 请先用 docker compose config 展开").replace("invalid service", "服务格式无效");
  const words = {
    all: ['全选', 'Select all'], retry: ['重试失败项', 'Retry failed'], stop: ['停止全部', 'Stop all'], terminal: ['下载脚本 · 查看命令', 'Download script · View commands'],
    input: ['Compose 配置', 'Compose YAML'], parse: ['解析镜像', 'Parse images'], source: ['镜像源', 'Image source'], platform: ['默认架构', 'Default platform'],
    note: ['仅支持公开镜像；每个镜像保存为独立 TAR。变量与多文件配置请先使用 docker compose config 展开；不会执行 build。浏览器可能需要允许多文件下载。', 'Public images only. One TAR per image. Expand variables and multiple files with docker compose config first; build is not executed. Your browser may require permission for multiple downloads.'],
    download: ['下载所选镜像', 'Download selected'], script: ['保存下载脚本', 'Save script'], copy: ['复制脚本', 'Copy script']
  };
  const chosen = () => rows.filter(row => row.checkbox.checked).map(row => ({ image: row.image, platform: row.platform || $('[data-platform]').value, source: $('[data-source]').value }));
  function update() {
    const entries = chosen();
    $('[data-command]').textContent = entries.length ? batchScript(entries, location.origin) : '';
    for (const action of ['download', 'script', 'copy']) $(`[data-action="${action}"]`).disabled = !entries.length;
    $('[data-all]').checked = rows.length > 0 && rows.every(row => row.checkbox.checked);
    $('[data-all]').indeterminate = entries.length > 0 && entries.length < rows.length;
    $('[data-all]').disabled = !rows.length;
    $('[data-count]').textContent = english ? `${entries.length} / ${rows.length} selected · concurrency 5` : `已选 ${entries.length} / ${rows.length} · 并发 5`;
    const done = rows.filter(row => row.state === 'done').length;
    const failed = rows.filter(row => row.state === 'failed').length;
    const running = rows.filter(row => row.state === 'running').length;
    $('[data-summary]').textContent = rows.some(row => row.state) ? (english ? `${running} active · ${done} saved · ${failed} failed` : `${running} 下载中 · ${done} 已交给浏览器保存 · ${failed} 失败`) : '';
    $('[data-action=stop]').disabled = !queue.busy;
    $('[data-action=retry]').disabled = !rows.some(row => row.state === 'failed');
    for (const node of batch.querySelectorAll('#compose-input, input[type=file], [data-action=parse], [data-source], [data-platform]')) node.disabled = queue.busy;
    for (const row of rows) {
      const state = row.state || 'idle';
      const labels = { idle: ['待下载','Ready'], queued:['排队中','Queued'], running:['下载中','Downloading'], done:['已交给浏览器保存','Handed to browser'], failed:['失败','Failed'], stopped:['已停止','Stopped'] };
      row.status.textContent = `${labels[state][english ? 1 : 0]}${row.error && state === 'failed' ? ` · ${row.error}` : ''}`;
      row.action.textContent = ['queued','running'].includes(state) ? (english ? 'Stop' : '停止') : state === 'idle' ? (english ? 'Download' : '下载') : (english ? 'Retry' : '重新下载');
      row.action.setAttribute('aria-label', `${row.action.textContent} ${row.image}`);
    }

  }
  function language(en) {
    english = en;
    if (issues.length) $('[data-errors]').textContent = issues.map(issueText).join('\n');
    $('[data-source]').options[0].textContent = en ? 'Auto (fastest available)' : '自动（最快可用）';
    rows.forEach(row => row.progress.setLanguage(en ? 'en' : 'zh-CN'));
    modes.children[0].textContent = en ? 'Single' : '单个';
    modes.children[1].textContent = en ? 'Batch' : '批量';
    batch.querySelectorAll('[data-text]').forEach(node => node.textContent = words[node.dataset.text][en ? 1 : 0]);
    update();
  }
  [...modes.children].forEach((button, index) => button.addEventListener('click', () => {
    if (queue.busy || singleBusy()) return;
    single.hidden = !!index; batch.hidden = !index;
    [...modes.children].forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)));
  }));
  function clear() { rows = []; issues = []; $('[data-errors]').textContent = ''; $('[data-list]').replaceChildren(); $('[data-summary]').textContent = ''; update(); }
  $('#compose-input').addEventListener('input', clear);
  $('input[type=file]').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    clear();
    if (file.size > 1024 * 1024) { $('[data-errors]').textContent = 'Compose exceeds 1 MiB'; return; }
    $('#compose-input').value = await file.text();
  });
  $('[data-action=parse]').addEventListener('click', () => {
    clear();
    try {
      const parsed = composeImages($('#compose-input').value);
      issues = parsed.issues;
      $('[data-errors]').textContent = issues.map(issueText).join('\n');
      for (const entry of parsed.images) {
        const label = document.createElement('div'); label.className = 'batch-image';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = true;
        const name = document.createElement('span'); name.textContent = `${entry.image} · ${entry.services.join(', ')}${entry.platform ? ` · ${entry.platform}` : ''}`;
        const status = document.createElement('span'); status.className = 'batch-status';
        checkbox.setAttribute('aria-label', entry.image);
        const action = document.createElement('button'); action.type = 'button'; action.className = 'generate-button button-secondary';
        const progressRow = single.querySelector('.download-progress-row').cloneNode(true);
        const progressStatus = progressRow.querySelector('[role="status"]');
        const track = progressRow.querySelector('[role="progressbar"]');
        progressRow.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        const progress = createDownloadProgress({ row: progressRow, status: progressStatus, detail: progressRow.querySelector('.transfer-detail'), metrics: progressRow.querySelector('.transfer-metrics'), track, fill: track.querySelector('.download-progress-fill'), icon: track.querySelector('.download-progress-icon') });
        progress.clear(); progress.setLanguage(english ? 'en' : 'zh-CN');
        label.append(checkbox, name, action, status, progressRow); $('[data-list]').append(label);
        const row = { ...entry, checkbox, status, action, progress };
        rows.push(row); checkbox.addEventListener('change', update);
        action.addEventListener('click', () => { if (['running', 'queued'].includes(row.state)) queue.stop(row); else enqueue(row); });
      }
      update();
      if (rows.length) $('[data-editor]').open = false;
    } catch (error) { $('[data-errors]').textContent = error.message; }
  });
  $('[data-source]').addEventListener('change', update);
  $('[data-platform]').addEventListener('change', update);
  $('[data-action=copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('[data-command]').textContent); $('[data-summary]').textContent = english ? 'Copied' : '已复制'; }
    catch { $('[data-summary]').textContent = english ? 'Copy the script below manually' : '请手动复制下方脚本'; }
  });
  $('[data-action=script]').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([$('[data-command]').textContent], { type: 'text/x-shellscript' }));
    const link = document.createElement('a'); link.href = url; link.download = 'download-compose-images.sh'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  const queue = createBatchQueue(async (row, signal) => {
    const entry = row.entry;
    row.progress.start(entry.image);
    try {
      const data = await selectionStore.lookupSources(); sources = data.sources;
      signal.throwIfAborted();
      const response = await fetch(`/api/inspect?${new URLSearchParams(entry)}`, { signal });
      const metadata = await response.json();
      if (!response.ok) throw new Error(metadata.error || `HTTP ${response.status}`);
      const source = metadata.source;
      const image = imageReference(entry.image, { source, sources, mirrorHost: location.host, acceleratedSource: source });
      const result = await exportArchive({ image, platform: entry.platform, source, signal, onProgress: event => row.progress.update(event) });
      row.progress.complete({ filename: result.filename, size: result.archive.size }); row.checkbox.checked = false;
    } catch (error) { row.progress.fail(error, signal.aborted); throw error; }
  }, update);
  function enqueue(row) {
    if (['running', 'queued'].includes(row.state)) return;
    row.entry = { image: row.image, platform: row.platform || $('[data-platform]').value, source: $('[data-source]').value };
    queue.add(row);
  }
  $('[data-action=download]').addEventListener('click', () => rows.filter(row => row.checkbox.checked).forEach(enqueue));
  $('[data-action=stop]').addEventListener('click', () => queue.stopAll());
  $('[data-action=retry]').addEventListener('click', () => rows.filter(row => row.state === 'failed').forEach(enqueue));
  $('[data-all]').addEventListener('change', event => { rows.forEach(row => { row.checkbox.checked = event.target.checked; }); update(); });
  const sourcesReady = selectionStore.lookupSources().then(data => {
    sources = data.sources;
    $('[data-source]').append(...sources.map(source => new Option(source.label, source.id)));
  });
  sourcesReady.catch(error => { $('[data-errors]').textContent = error.message; });
  language(false);
  return { setLanguage: language };
}
