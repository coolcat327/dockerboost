import { batchInputIssue } from '../../common/batch-input-issue.js';
import { createBatchQueue } from './batch-queue.js';
import { createDownloadProgress } from '../../common/download-progress.js';
import { parseBatchImages } from '../../common/batch-images.js';
import { batchCommands } from './terminal-commands.js';
import { createImageSelection } from '../../common/image-selection.js';
import { createSelectionStore } from '../../common/selection-store.js';
import { bindComposeInput } from '../../common/compose-input.js';
import { exportArchive } from './export-archive.js';
import { matchBatchPlatform } from '../../common/batch-platform.js';
import { retryDownload } from '../../common/download-retry.js';
import { copyLink } from '../../common/share-link.js';
import { encodeQueueShare, restoreQueueShare } from './queue-share.js';

export function initBatch({ panel, locale, messages, flash, singleBusy, selectionStore, sharedBatchHash }) {
  const single = document.createElement('div');
  const heading = panel.querySelector('.panel-copy');
  while (heading.nextSibling) single.append(heading.nextSibling);
  const modes = document.createElement('div');
  modes.className = 'download-modes';
  modes.innerHTML = '<button type="button" class="generate-button button-secondary" aria-pressed="true">单个</button><button type="button" class="generate-button button-secondary" aria-pressed="false">批量</button>';
  const batch = document.createElement('div');
  batch.className = 'compose-batch';
  batch.hidden = true;
  batch.innerHTML = `<div class="batch-notices"><details class="batch-help"><summary data-text="limitations"></summary><p data-text="note"></p></details><p data-errors role="status"></p></div>

  <section class="batch-section" aria-labelledby="compose-title">
    <div class="batch-section-heading"><h4 id="compose-title"><span class="batch-step">01</span><span data-text="input"></span></h4></div>
    <div class="batch-input-toolbar"><label class="batch-input-label" for="compose-input" data-text="inputHint"></label><label class="batch-upload"><span data-text="upload"></span><input type="file" accept=".yaml,.yml,.txt" aria-label="Compose YAML"></label></div>
    <textarea id="compose-input" rows="6" wrap="off" spellcheck="false" placeholder="支持 Compose 配置或每行一个镜像的列表"></textarea>
  </section>
  <section class="batch-section" aria-labelledby="batch-selection-title">
    <div class="batch-section-heading"><h4 id="batch-selection-title"><span class="batch-step">02</span><span data-text="selection"></span></h4></div>
    <div class="batch-selection-toolbar"><p class="batch-selection-hint" data-text="selectionHint"></p><button type="button" class="generate-button button-secondary" data-action="add-all" data-text="addAll" hidden disabled></button></div>
    <div class="batch-selection-content"><p class="batch-empty" data-selection-empty data-text="selectionEmpty"></p>
    <div data-list role="group" aria-labelledby="batch-selection-title" tabindex="0"></div></div>

  </section>
  <section class="batch-section batch-queue-section" aria-labelledby="batch-queue-title">
    <div class="batch-section-heading"><h4 id="batch-queue-title" tabindex="-1"><span class="batch-step">03</span><span data-text="queue"></span><span class="batch-queue-count" data-queue-count>0</span></h4><button type="button" class="generate-button button-secondary share-button batch-share-button" data-action="share" disabled><span data-text="share"></span></button></div>
    <p class="batch-queue-hint" data-text="queueHint"></p>
    <div class="batch-queue-table" role="table" aria-labelledby="batch-queue-title">
      <div class="batch-table-heading" role="row">
        <div role="columnheader" data-text="imageName"></div>
        <div class="architecture-fields" role="columnheader"><select id="batch-platform" data-platform><option value="" disabled selected data-text="platform"></option><option value="linux/amd64">amd64</option><option value="linux/arm64">arm64</option></select></div>
        <div role="columnheader" data-text="progress"></div>
        <div class="batch-actions" role="columnheader"><button type="button" class="generate-button" data-action="download" disabled></button><button type="button" class="generate-button button-secondary" data-action="reparse" data-text="reparse" disabled></button></div>
      </div>
      <div data-queue-list role="rowgroup"></div>
    </div>
    <p class="batch-platform-notice" data-platform-feedback role="status" aria-live="polite"></p>
    <p class="batch-empty" data-queue-empty data-text="queueEmpty"></p>
    <p class="batch-hint" data-summary role="status" aria-live="polite"></p>
    <div class="command-block batch-terminal"><div class="command-meta"><span data-text="terminal"></span><button type="button" class="copy-all" data-action="copy" data-copy="batch-load-command" data-text="copy" disabled></button></div><code id="batch-load-command" data-command></code></div>
  </section>`;
  const header = document.createElement('div');
  header.className = 'download-header';
  heading.replaceWith(header);
  header.append(heading, modes);
  modes.setAttribute('role', 'group');
  panel.append(single, batch);
  const $ = selector => batch.querySelector(selector);

  let rows = [], jobs = [], english = false, issues = [], sharing = false;
  const issueText = value => batchInputIssue(value, english);
  const words = {
    share: ['分享镜像', 'Share images'], shareInvalid: ['分享链接无效，无法恢复队列', 'Invalid queue share link'], shareLarge: ['分享队列或链接过大，请减少镜像数量后重试', 'Queue or link is too large; share fewer images'], shareUnsupported: ['当前浏览器不支持解压分享链接，请使用新版浏览器', 'This browser cannot decompress the link; use an updated browser'],
    resolving: ['正在解析镜像…', 'Resolving image…'], resolveFailed: ['解析失败，请重试', 'Resolution failed; retry'], unsupported: ['该镜像不支持所选架构', 'Selected platform is not supported'], resolveAgain: ['重新解析', 'Retry'], reparse: ['重新解析', 'Reparse all'],
    inputHint: ['粘贴或拖入镜像信息', 'Paste or drop image information'], inputPlaceholder: ['支持 Compose 配置或每行一个镜像的列表', 'Supports Compose configuration or one image per line'], limitations: ['支持范围与使用提示', 'Supported configuration & tips'],
    selectionHint: ['将需要的镜像加入下载队列', 'Add the images you need to the download queue'], addAll: ['全部加入', 'Add all'],
    selection: ['选择镜像', 'Select images'], selectionEmpty: ['解析后，镜像会显示在这里。', 'Parsed images appear here.'],
    add: ['加入下载队列', 'Add to queue'], queue: ['下载队列', 'Download queue'], queueHint: ['独立 TAR · 最多同时下载 5 项', 'One TAR each · Up to 5 active'], queueEmpty: ['从上方选择镜像并加入队列，再开始下载。', 'Add images from above, then start your downloads.'],
    removeFromQueue: ['移除下载队列', 'Remove from queue'], removed: ['已从下载队列移除', 'Removed from queue'], stop: ['停止全部', 'Stop all'], terminal: ['终端下载', 'Terminal download'],
    input: ['批量输入', 'Batch input'], upload: ['上传文件', 'Upload file'], imageName: ['镜像名', 'Image name'], platform: ['选择架构', 'Architecture'], progress: ['下载进度', 'Progress'],
    note: ['仅支持公开镜像；每个镜像保存为独立 TAR。变量与多文件配置请先使用 docker compose config 展开；不会执行 build。浏览器可能需要允许多文件下载。', 'Public images only. One TAR per image. Expand variables and multiple files with docker compose config first; build is not executed. Your browser may require permission for multiple downloads.'],
    download: ['开始下载', 'Start all'], copy: ['复制全部', 'Copy all'], commandEmpty: ['将镜像加入队列后显示下载命令', 'Add images to the queue to show download commands']
  };
  const entryFor = row => ({ image: row.image, platform: row.platform || '', source: 'auto' });
  const candidateKey = row => JSON.stringify([row.image, row.platform || '']);
  const keyFor = entry => JSON.stringify([entry.image, entry.platform, entry.source]);
  function update() {
    const jobsByCandidate = new Map(jobs.map(job => [job.candidateKey, job]));
    for (const row of rows) {
      const job = jobsByCandidate.get(candidateKey(row));
      const added = !!job;
      row.download.disabled = added && ['queued', 'running'].includes(job.state);
      const actionLabel = words[added ? 'removeFromQueue' : 'add'][english ? 1 : 0];
      row.downloadLabel.textContent = actionLabel;
      row.download.title = actionLabel;
      row.download.setAttribute('aria-pressed', String(added));
      row.download.setAttribute('aria-label', `${actionLabel} ${row.image}`);
      row.label.classList.toggle('is-added', added);
    }
    const readyJobs = jobs.filter(job => job.ready);
    $('[data-command]').textContent = readyJobs.length ? batchCommands(readyJobs.map(job => job.entry), location.origin) : words.commandEmpty[english ? 1 : 0];
    $('[data-action=copy]').disabled = !readyJobs.length;
    const downloadButton = $('[data-action=download]');
    downloadButton.textContent = words[queue.busy ? 'stop' : 'download'][english ? 1 : 0];
    downloadButton.classList.toggle('is-stoppable', queue.busy);
    downloadButton.disabled = !queue.busy && !jobs.some(job => job.ready && (!job.state || job.state === 'stopped'));
    $('[data-action=add-all]').hidden = !rows.length;
    $('[data-action=add-all]').disabled = rows.every(row => jobsByCandidate.has(candidateKey(row)));
    $('[data-selection-empty]').hidden = rows.length > 0;
    $('[data-queue-empty]').hidden = jobs.length > 0;
    $('[data-queue-count]').textContent = jobs.length;
    const done = jobs.filter(row => row.state === 'done').length;
    const failed = jobs.filter(row => row.state === 'failed').length;
    const unresolved = jobs.filter(row => row.resolveError && !row.resolving).length;
    const running = jobs.filter(row => row.state === 'running').length;
    $('[data-summary]').textContent = jobs.length ? (english ? `${running} active · ${done} saved · ${failed + unresolved} failed` : `${running} 下载中 · ${done} 已保存 · ${failed + unresolved} 失败`) : '';
    $('[data-action=reparse]').disabled = queue.busy || !jobs.length || jobs.some(job => job.resolving);
    $('[data-action=share]').disabled = sharing || !jobs.length;
    const unsupported = jobs.filter(job => job.platforms?.length && job.preferredPlatform && !matchBatchPlatform(job.platforms, job.preferredPlatform)).length;
    $('[data-platform-feedback]').textContent = unsupported ? (english ? `${unsupported} image(s) do not support the selected architecture. Choose another architecture for those tasks.` : `${unsupported} 个镜像不支持所选架构，请为对应任务选择其他架构。`) : '';
    for (const row of jobs) {
      const state = row.state || 'idle';
      const labels = { idle: ['待下载','Ready'], queued:['排队中','Queued'], running:['下载中','Downloading'], done:['已保存','Saved'], failed:['失败','Failed'], stopped:['已停止','Stopped'] };
      row.sourceSelect.disabled = ['queued', 'running'].includes(state);
      row.platformSelect.disabled = row.sourceSelect.disabled || row.resolving || !row.platforms?.length;
      row.action.disabled = row.resolving || (!['queued', 'running'].includes(state) && !row.ready && !row.resolveError);
      row.status.dataset.state = row.resolving ? 'resolving' : row.resolveError ? 'failed' : state;
      row.status.textContent = row.resolving ? words.resolving[english ? 1 : 0] : row.resolveError ? [words[row.resolveError.kind][english ? 1 : 0], row.resolveError.detail].filter(Boolean).join(' · ') : `${labels[state][english ? 1 : 0]}${row.error && state === 'failed' ? ` · ${row.error}` : ''}`;
      row.status.title = row.status.textContent;
      row.action.textContent = ['queued','running'].includes(state) ? (english ? 'Stop' : '停止') : row.resolveError ? words.resolveAgain[english ? 1 : 0] : state === 'idle' || state === 'stopped' ? (english ? 'Download' : '下载') : (english ? 'Redownload' : '重新下载');
      row.remove.disabled = ['queued', 'running'].includes(state);
      row.remove.textContent = english ? 'Remove' : '移除';
      row.remove.title = row.remove.textContent;
      row.remove.setAttribute('aria-label', `${row.remove.title} ${row.image}`);
      row.action.classList.toggle('is-stoppable', ['queued', 'running'].includes(state));
      row.action.setAttribute('aria-label', `${row.action.textContent} ${row.image}`);
    }

  }
  function language(en) {
    english = en;
    if (issues.length) $('[data-errors]').textContent = issues.map(issueText).join('\n');
    jobs.forEach(row => { row.progress.setLanguage(en ? 'en' : 'zh-CN'); row.selection?.setLanguage(); row.sourceLabel.textContent = messages().source; row.platformLabel.textContent = messages().architecture; row.platformSelect.setAttribute('aria-label', `${messages().architecture} ${row.image}`); });
    modes.setAttribute('aria-label', en ? 'Download mode' : '下载模式');
    modes.children[0].textContent = en ? 'Single' : '单个';
    modes.children[1].textContent = en ? 'Batch' : '批量';
    batch.querySelectorAll('[data-text]').forEach(node => node.textContent = words[node.dataset.text][en ? 1 : 0]);
    $('#compose-input').placeholder = words.inputPlaceholder[en ? 1 : 0];
    $('input[type=file]').setAttribute('aria-label', en ? 'Upload input file' : '上传输入文件');
    $('[data-platform]').setAttribute('aria-label', words.platform[en ? 1 : 0]);
    $('[data-action=share]').title = words.share[en ? 1 : 0];
    $('[data-action=share]').setAttribute('aria-label', words.share[en ? 1 : 0]);
    update();
  }
  [...modes.children].forEach((button, index) => button.addEventListener('click', () => {
    if (queue.busy || singleBusy()) return;
    single.hidden = !!index; batch.hidden = !index;
    [...modes.children].forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)));
  }));
  function clear() { rows = []; issues = []; $('[data-errors]').textContent = ''; $('[data-list]').replaceChildren(); update(); }
  function parseInput() {
    clear();
    if (!$('#compose-input').value.trim()) return;
    try {
      const parsed = parseBatchImages($('#compose-input').value);
      issues = parsed.issues;
      $('[data-errors]').textContent = issues.map(issueText).join('\n');
      for (const entry of parsed.images) {
        const label = document.createElement('div'); label.className = 'batch-candidate';
        const name = document.createElement('span'); name.className = 'batch-image-name';
        const title = document.createElement('strong'); title.textContent = entry.image; title.title = entry.image;
        const detail = document.createElement('small'); detail.textContent = entry.platform || '';
        name.append(title, detail);
        const badge = document.createElement('span'); badge.className = 'batch-enqueued-mark'; badge.setAttribute('aria-hidden', 'true');
        const download = document.createElement('button'); download.type = 'button'; download.className = 'generate-button button-secondary batch-queue-toggle';
        const downloadLabel = document.createElement('span'); downloadLabel.className = 'batch-toggle-label'; download.append(downloadLabel);
        label.append(badge, name, download); $('[data-list]').append(label);
        const candidate = { ...entry, label, download, downloadLabel };
        rows.push(candidate);
        download.addEventListener('click', () => {
          const job = jobs.find(job => job.candidateKey === candidateKey(candidate));
          if (job) removeJob(job); else addSelected([candidate]);
        });
      }
      update();

    } catch (error) { $('[data-errors]').textContent = issueText(error.message); }
  }
  bindComposeInput({ input: $('#compose-input'), upload: $('input[type=file]'),
    onChange: clear, onParse: parseInput,
    onError: error => { clear(); $('[data-errors]').textContent = issueText(error.message); }
  });
  $('[data-action=add-all]').addEventListener('click', () => addSelected(rows));
  $('[data-platform]').addEventListener('change', () => {
    for (const job of jobs.filter(job => !['running', 'queued'].includes(job.state))) {
      job.preferredPlatform = $('[data-platform]').value || job.declaredPlatform;
      applyPlatform(job);
    }
    update();
  });
  const shareError = error => words[error.message === 'SHARE_TOO_LARGE' ? 'shareLarge' : error.message === 'SHARE_UNSUPPORTED' ? 'shareUnsupported' : 'shareInvalid'][english ? 1 : 0];
  $('[data-action=share]').addEventListener('click', async () => {
    if (sharing || !jobs.length) return;
    const entries = jobs.map(job => ({ image: job.image, platform: job.ready ? job.entry.platform : job.preferredPlatform || job.declaredPlatform || '' }));
    sharing = true; update();
    try {
      const url = new URL(location.href);
      url.hash = await encodeQueueShare(entries);
      const copied = await copyLink(url.href, messages);
      flash(copied ? messages().shareCopied : messages().shareGenerated);
    } catch (error) { flash(error.message?.startsWith('SHARE_') ? shareError(error) : error.message || messages().shareFailed); }
    finally { sharing = false; update(); }
  });
  const queue = createBatchQueue(async (row, signal) => {
    const entry = row.entry;
    try {
      signal.throwIfAborted();
      const image = row.selection.resolve();
      const source = row.selection.current().resolvedSource;
      const result = await retryDownload(attempt => {
        row.progress.start(entry.image, { preserveStartedAt: attempt > 0 });
        return exportArchive({ image, platform: entry.platform, source, signal, onProgress: event => row.progress.update(event) });
      }, { signal, onRetry: (error, retry) => row.progress.retry(error, retry) });
      row.progress.complete({ filename: result.filename, size: result.archive.size });
    } catch (error) { row.progress.fail(error, signal.aborted); throw error; }
  }, update);
  function enqueue(row) {
    if (!row.ready || ['running', 'queued'].includes(row.state)) return;
    if (jobs.some(job => job !== row && ['running', 'queued'].includes(job.state) && keyFor(job.entry) === keyFor(row.entry))) return;
    queue.add(row);
  }
  function applyPlatform(job) {
    if (!job.platforms?.length) return;
    const preferred = job.preferredPlatform;
    const platform = preferred ? matchBatchPlatform(job.platforms, preferred)
      : (job.platforms.includes(job.platformSelect.value) ? job.platformSelect.value : job.platforms[0]);
    job.platformSelect.value = platform;
    job.ready = !!job.platformSelect.value;
    // Unsupported bulk/Compose platforms must not silently fall back to another architecture.
    job.resolveError = job.ready ? null : { kind: 'unsupported' };
    const entry = { image: job.selection.resolve().upstream, platform: job.platformSelect.value, source: job.selection.current().resolvedSource };
    if (keyFor(entry) !== keyFor(job.entry)) { job.state = undefined; job.progress.clear(); }
    job.entry = entry;
    update();
  }
  function initJobSelection(job, controls) {
    job.sourceSelect = controls.querySelector('.source-fields select');
    job.platformSelect = controls.querySelector('.architecture-fields select');
    job.sourceLabel = controls.querySelector('.source-fields label');
    job.platformLabel = controls.querySelector('.architecture-fields label');
    const id = `batch-task-${++taskSequence}`;
    job.sourceSelect.id = `${id}-source`; job.sourceLabel.htmlFor = job.sourceSelect.id;
    job.platformSelect.id = `${id}-platform`; job.platformLabel.htmlFor = job.platformSelect.id;
    job.platformSelect.setAttribute('aria-label', `${messages().architecture} ${job.image}`);
    job.sourceLabel.textContent = messages().source; job.platformLabel.textContent = messages().architecture;
    const store = createSelectionStore();
    store.update({ image: job.image, source: 'auto' });
    store.lookupSources = () => selectionStore.lookupSources();
    const reset = () => {
      job.ready = false; job.resolving = true; job.resolveError = null; job.platforms = [];
      job.state = undefined; job.progress.clear(); update();
    };
    job.selection = createImageSelection({ panel: controls, locale, messages, flash: () => { job.resolving = false; job.ready = false; job.resolveError = { kind: 'resolveFailed' }; update(); }, store,
      onLoading: reset, onReset: reset,
      onReady: () => {
        job.resolving = false;
        const available = [...job.platformSelect.options].map(option => option.value);
        job.platforms = available.filter(Boolean);
        for (const option of job.platformSelect.options) option.textContent = option.value.replace(/^linux\//, '');
        if (!job.platforms.length) { job.resolveError = { kind: 'resolveFailed' }; update(); return; }
        applyPlatform(job);
      },
      onError: error => { job.resolving = false; job.ready = false; job.resolveError = { kind: 'resolveFailed', detail: error.message }; update(); }
    });
    job.selection.onPlatformChange(() => { job.preferredPlatform = job.platformSelect.value; applyPlatform(job); });
    job.selection.init();
  }
  function reparse(job) {
    if (job.resolving || ['running', 'queued'].includes(job.state)) return;
    job.ready = false; job.resolving = true; job.resolveError = null;
    job.state = undefined; job.error = ''; job.progress.clear(); update();
    void job.selection.reloadSources();
  }
  function removeJob(job, restoreFocus = false) {
    if (['running', 'queued'].includes(job.state)) return;
    const index = jobs.indexOf(job);
    job.selection.dispose();
    jobs = jobs.filter(item => item !== job);
    job.card.remove();
    update();
    flash(`${words.removed[english ? 1 : 0]} · ${job.image}`);
    if (restoreFocus) {
      const next = jobs.slice(index).find(item => !item.remove.disabled)
        || jobs.slice(0, index).reverse().find(item => !item.remove.disabled);
      (next?.remove || $('#batch-queue-title')).focus({ preventScroll: true });
    }
  }
  let taskSequence = 0;
  function addSelected(candidates) {
    let added = 0;
    for (const candidate of candidates) {
      const entry = entryFor(candidate);
      if (jobs.some(job => job.candidateKey === candidateKey(candidate))) continue;
      const card = document.createElement('div'); card.className = 'batch-image'; card.setAttribute('role', 'row');
      const name = document.createElement('div'); name.className = 'batch-image-name'; name.setAttribute('role', 'cell');
      const title = document.createElement('strong'); title.textContent = entry.image; title.title = entry.image;
      name.append(title);
      const status = document.createElement('span'); status.className = 'batch-status';
      const actions = document.createElement('div'); actions.className = 'batch-item-actions'; actions.setAttribute('role', 'cell');
      const action = document.createElement('button'); action.type = 'button'; action.className = 'generate-button';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'generate-button button-secondary'; remove.textContent = english ? 'Remove' : '移除';
      actions.append(action, remove);
      const progressRow = single.querySelector('.download-progress-row').cloneNode(true);
      const progressStatus = progressRow.querySelector('[role="status"]');
      const track = progressRow.querySelector('[role="progressbar"]');
      progressRow.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      progressRow.classList.add('transfer-compact');
      const progress = createDownloadProgress({ compact: true, row: progressRow, status: progressStatus, detail: progressRow.querySelector('.transfer-detail'), metrics: progressRow.querySelector('.transfer-metrics'), track, fill: track.querySelector('.download-progress-fill'), icon: track.querySelector('.download-progress-icon') });
      progress.clear(); progress.setLanguage(english ? 'en' : 'zh-CN');
      const controls = document.createElement('div'); controls.className = 'batch-task-selection';
      controls.innerHTML = '<div class="image-fields" hidden><input></div><div class="source-fields" hidden><label></label><select></select></div><div class="architecture-fields" role="cell"><label></label><select></select></div>';
      const progressCell = document.createElement('div'); progressCell.className = 'batch-progress-cell'; progressCell.setAttribute('role', 'cell');
      progressCell.append(status, progressRow);
      card.append(name, controls, progressCell, actions);
      $('[data-queue-list]').append(card);
      const job = { image: entry.image, entry, candidateKey: candidateKey(candidate), declaredPlatform: candidate.platform || '', preferredPlatform: $('[data-platform]').value || candidate.platform || '', status, action, remove, progress, card };
      jobs.push(job); added++;
      initJobSelection(job, controls);
      action.addEventListener('click', () => { if (['running', 'queued'].includes(job.state)) queue.stop(job); else if (job.resolveError) reparse(job); else enqueue(job); });
      remove.addEventListener('click', () => removeJob(job, true));
    }
    update();
    flash(english ? `Added ${added} to the queue` : `已将 ${added} 个镜像加入下载队列`);
  }
  $('[data-action=download]').addEventListener('click', () => {
    if (queue.busy) queue.stopAll();
    else jobs.filter(row => row.ready && (!row.state || row.state === 'stopped')).forEach(enqueue);
  });
  $('[data-action=reparse]').addEventListener('click', () => {
    if (queue.busy || jobs.some(job => job.resolving)) return;
    jobs.forEach(reparse);
  });

  language(false);
  if (sharedBatchHash) {
    modes.children[1].click();
    restoreQueueShare(sharedBatchHash).then(entries => {
      if (!entries) return;
      addSelected(entries);
      window.history.replaceState(window.history.state, '', location.pathname + location.search);
    }).catch(error => flash(shareError(error)));
  }
  return { setLanguage: language };
}
