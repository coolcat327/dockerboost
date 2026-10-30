import { batchInputIssue } from '../../common/batch-input-issue.js';
import { parseBatchImages } from '../../common/batch-images.js';
import { bindComposeInput } from '../../common/compose-input.js';
import { matchBatchPlatform } from '../../common/batch-platform.js';
import { createImageSelection } from '../../common/image-selection.js';
import { createSelectionStore } from '../../common/selection-store.js';

export function initBatchPull({ panel, locale, messages, selectionStore }) {
  const heading = panel.querySelector('.panel-copy');
  const single = document.createElement('div');
  while (heading.nextSibling) single.append(heading.nextSibling);
  const header = document.createElement('div'); header.className = 'download-header';
  const modes = document.createElement('div'); modes.className = 'download-modes'; modes.setAttribute('role', 'group');
  modes.innerHTML = '<button type="button" class="generate-button button-secondary" aria-pressed="true"></button><button type="button" class="generate-button button-secondary" aria-pressed="false"></button>';
  heading.replaceWith(header); header.append(heading, modes);
  const batch = document.createElement('div'); batch.className = 'compose-batch pull-batch'; batch.hidden = true;
  batch.innerHTML = `<div class="batch-notices"><details class="batch-help"><summary data-text="limitations"></summary><p data-text="note"></p></details><p data-errors role="status"></p></div>
    <section class="batch-section" aria-labelledby="pull-compose-title">
      <div class="batch-section-heading"><h4 id="pull-compose-title"><span class="batch-step">01</span><span data-text="input"></span></h4></div>
      <div class="batch-input-toolbar"><label class="batch-input-label" for="pull-batch-input" data-text="inputHint"></label><label class="batch-upload"><span data-text="upload"></span><input type="file" accept=".yaml,.yml,.txt"></label></div>
      <textarea id="pull-batch-input" rows="6" wrap="off" spellcheck="false"></textarea>
    </section>
    <section class="batch-section" aria-labelledby="pull-selection-title">
      <div class="batch-section-heading"><h4 id="pull-selection-title"><span class="batch-step">02</span><span data-text="selection"></span></h4></div>
      <div class="batch-selection-toolbar"><p class="batch-selection-hint" data-text="selectionHint"></p><button type="button" class="generate-button button-secondary" data-action="add-all" data-text="addAll" hidden></button></div>
      <div class="batch-selection-content"><p class="batch-empty" data-selection-empty data-text="selectionEmpty"></p><div data-list role="group" aria-labelledby="pull-selection-title" tabindex="0"></div></div>
    </section>
    <section class="batch-section batch-queue-section" aria-labelledby="pull-queue-title">
      <div class="batch-section-heading"><h4 id="pull-queue-title" tabindex="-1"><span class="batch-step">03</span><span data-text="queue"></span><span class="batch-queue-count" data-count>0</span></h4></div>
      <p class="batch-queue-hint" data-text="queueHint"></p>
      <div class="batch-queue-table pull-queue-table" role="table" aria-labelledby="pull-queue-title">
        <div class="batch-table-heading pull-queue-heading" role="row"><span role="columnheader" data-text="imageName"></span><div role="columnheader" class="architecture-fields"><select data-platform><option value="" disabled selected data-text="platform"></option><option value="linux/amd64">amd64</option><option value="linux/arm64">arm64</option></select></div><div class="pull-queue-heading-actions" role="columnheader"><button type="button" class="generate-button button-secondary" data-action="reparse" data-text="reparse"></button></div></div>
        <div data-queue-list role="rowgroup"></div>
      </div>
      <p class="batch-empty" data-queue-empty data-text="queueEmpty"></p>
    </section>
    <section class="batch-section pull-command-section" aria-labelledby="pull-command-title">
      <div class="batch-section-heading"><h4 id="pull-command-title"><span class="batch-step">04</span><span data-text="commandStep"></span></h4></div>
      <div class="command-block batch-terminal"><div class="command-meta"><span data-text="command"></span><button type="button" class="copy-all" data-copy="pull-batch-command" data-text="copy" disabled></button></div><code id="pull-batch-command"></code></div>
    </section>`;
  panel.append(single, batch);
  const $ = selector => batch.querySelector(selector);
  let rows = [], jobs = [], english = false, issues = [], sequence = 0;
  const words = {
    limitations: ['支持范围与使用提示', 'Supported configuration & tips'], note: ['仅支持公开镜像；变量与多文件配置请先使用 docker compose config 展开；不会执行 build。', 'Public images only. Expand variables and multiple files with docker compose config first; build is not executed.'],
    input: ['批量输入', 'Batch input'], inputHint: ['粘贴或拖入镜像信息', 'Paste or drop image information'], upload: ['上传文件', 'Upload file'], placeholder: ['支持 Compose 配置或每行一个镜像的列表', 'Supports Compose configuration or one image per line'],
    selection: ['选择镜像', 'Select images'], selectionHint: ['将需要的镜像加入解析队列', 'Add images to the resolution queue'], selectionEmpty: ['解析后，镜像会显示在这里。', 'Parsed images appear here.'], addAll: ['全部加入', 'Add all'], add: ['加入解析队列', 'Add to queue'], remove: ['移除解析队列', 'Remove from queue'], queue: ['解析队列', 'Resolution queue'], queueHint: ['自动解析镜像源与架构，生成拉取命令', 'Resolve sources and architectures to generate pull commands'], queueEmpty: ['从上方选择镜像并加入队列。', 'Add images from above to the queue.'], imageName: ['镜像名', 'Image name'], platform: ['选择架构', 'Architecture'], reparse: ['重新解析', 'Reparse all'], retry: ['重新解析', 'Retry'], removeJob: ['移除', 'Remove'],
    commandStep: ['拉取命令', 'Pull commands'], command: ['拉取 + 标签', 'Pull + tag'], copy: ['复制全部', 'Copy all'], empty: ['将镜像加入队列后显示拉取命令', 'Add images to the queue to show pull commands'], loading: ['正在解析镜像…', 'Resolving image…'], unsupported: ['该镜像不支持所选架构', 'Selected architecture is not supported'], error: ['解析失败', 'Resolution failed']
  };
  const text = key => words[key][english ? 1 : 0];
  const issueText = value => batchInputIssue(value, english);
  const key = entry => JSON.stringify([entry.image, entry.platform || '']);
  function update() {
    const queuedKeys = new Set(jobs.map(job => job.key));
    const ready = jobs.filter(job => job.ready);
    const commands = ready.map(job => {
      const image = job.selection.resolve();
      return `docker pull --platform ${job.platform.value} ${image.accelerated} &&\ndocker tag ${image.accelerated} ${image.original} &&\ndocker image rm ${image.accelerated}`;
    });
    $('#pull-batch-command').textContent = commands.join('\n\n') || text('empty');
    $('[data-copy]').disabled = !commands.length;
    $('[data-action=add-all]').hidden = !rows.length;
    $('[data-action=add-all]').disabled = rows.every(row => queuedKeys.has(row.key));
    $('[data-selection-empty]').hidden = !!rows.length;
    $('[data-queue-empty]').hidden = !!jobs.length;
    $('[data-count]').textContent = jobs.length;
    $('[data-action=reparse]').disabled = !jobs.length || jobs.some(job => job.resolving);
    for (const row of rows) {
      const added = queuedKeys.has(row.key); const action = text(added ? 'remove' : 'add');
      row.buttonLabel.textContent = action; row.button.title = action; row.button.setAttribute('aria-label', `${action} ${row.image}`); row.button.setAttribute('aria-pressed', String(added)); row.card.classList.toggle('is-added', added);
    }
    for (const job of jobs) {
      job.errorMessage.textContent = job.error === 'unsupported' ? text('unsupported') : job.error ? `${text('error')}: ${job.error}` : ''; 
      job.retry.textContent = text('retry'); job.retry.disabled = job.resolving;
      job.remove.textContent = text('removeJob'); job.remove.setAttribute('aria-label', `${text('removeJob')} ${job.image}`);
      job.platform.disabled = job.resolving || !job.platforms?.length;
    }
  }
  function clear() { rows = []; issues = []; $('[data-list]').replaceChildren(); $('[data-errors]').textContent = ''; update(); }
  function remove(job, focus = false) {
    const index = jobs.indexOf(job); job.selection.dispose(); jobs.splice(index, 1); job.card.remove(); update();
    if (focus) (jobs[index]?.remove || jobs[index - 1]?.remove || $('#pull-queue-title')).focus({ preventScroll: true });
  }
  function applyPlatform(job) {
    const preferred = job.preferredPlatform;
    const matched = preferred ? matchBatchPlatform(job.platforms, preferred) : job.platform.value || job.platforms[0];
    job.platform.value = matched; job.ready = !!matched; job.error = matched ? '' : 'unsupported'; update();
  }
  function add(row) {
    if (jobs.some(job => job.key === row.key)) return;
    const card = document.createElement('div'); card.className = 'pull-queue-row'; card.setAttribute('role', 'row');
    const name = document.createElement('div'); name.className = 'batch-image-name pull-queue-name'; name.setAttribute('role', 'cell');
    const title = document.createElement('strong'); title.textContent = row.image; title.title = row.image;
    const errorMessage = document.createElement('span'); errorMessage.className = 'pull-queue-error'; errorMessage.setAttribute('role', 'status'); name.append(title, errorMessage);
    const controls = document.createElement('div'); controls.className = 'batch-task-selection';
    controls.innerHTML = '<div class="image-fields" hidden><input></div><div class="source-fields" hidden><label></label><select></select></div><div class="architecture-fields" role="cell"><label></label><select disabled></select></div>';
    const platform = controls.querySelector('.architecture-fields select'); const label = controls.querySelector('.architecture-fields label');
    platform.id = `pull-queue-platform-${++sequence}`; label.htmlFor = platform.id; label.textContent = messages().architecture; platform.setAttribute('aria-label', `${messages().architecture} ${row.image}`);
    const actions = document.createElement('div'); actions.className = 'batch-item-actions'; actions.setAttribute('role', 'cell');
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'generate-button button-secondary';
    const removeButton = document.createElement('button'); removeButton.type = 'button'; removeButton.className = 'generate-button button-secondary'; actions.append(retry, removeButton);
    card.append(name, controls, actions); $('[data-queue-list]').append(card);
    const job = { key: row.key, image: row.image, preferredPlatform: $('[data-platform]').value || row.declaredPlatform, card, platform, errorMessage, retry, remove: removeButton, ready: false, resolving: true, error: '', selection: null }; jobs.push(job);
    const store = createSelectionStore(); store.update({ image: job.image, source: 'auto' }); store.lookupSources = () => selectionStore.lookupSources();
    const reset = () => { job.ready = false; job.resolving = true; job.error = ''; job.platforms = []; update(); };
    job.selection = createImageSelection({ panel: controls, locale, messages, store, flash: error => { job.ready = false; job.resolving = false; job.error = error; update(); }, onLoading: reset, onReset: reset,
      onError: error => { job.ready = false; job.resolving = false; job.error = error.message; update(); },
      onReady: () => { job.resolving = false; job.platforms = [...platform.options].map(option => option.value).filter(Boolean); for (const option of platform.options) option.textContent = option.value.replace(/^linux\//, ''); if (!job.platforms.length) { job.error = locale().noPlatforms; update(); return; } applyPlatform(job); }
    });
    job.selection.onPlatformChange(() => { job.preferredPlatform = platform.value; applyPlatform(job); });
    retry.addEventListener('click', () => { void job.selection.reloadSources(); });
    removeButton.addEventListener('click', () => remove(job, true));
    job.selection.init(); update();
  }
  function parse() {
    clear(); if (!$('#pull-batch-input').value.trim()) return;
    try {
      const result = parseBatchImages($('#pull-batch-input').value); issues = result.issues; $('[data-errors]').textContent = issues.map(issueText).join('\n');
      result.images.forEach(entry => {
        const card = document.createElement('div'); card.className = 'batch-candidate';
        const badge = document.createElement('span'); badge.className = 'batch-enqueued-mark'; badge.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span'); name.className = 'batch-image-name';
        const title = document.createElement('strong'); title.textContent = entry.image; title.title = entry.image;
        const detail = document.createElement('small'); detail.textContent = entry.platform || ''; name.append(title, detail);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'generate-button button-secondary batch-queue-toggle';
        const buttonLabel = document.createElement('span'); buttonLabel.className = 'batch-toggle-label'; button.append(buttonLabel);
        card.append(badge, name, button); $('[data-list]').append(card);
        const row = { image: entry.image, declaredPlatform: entry.platform || '', key: key(entry), card, button, buttonLabel }; rows.push(row);
        button.addEventListener('click', () => { const job = jobs.find(item => item.key === row.key); if (job) remove(job); else add(row); });
      });
      update();
    } catch (error) { $('[data-errors]').textContent = issueText(error.message); }
  }
  bindComposeInput({ input: $('#pull-batch-input'), upload: $('input[type=file]'), onChange: clear, onParse: parse, onError: error => { clear(); issues = [error.message]; $('[data-errors]').textContent = issues.map(issueText).join('\n'); } });
  $('[data-action=add-all]').addEventListener('click', () => rows.forEach(add));
  $('[data-platform]').addEventListener('change', () => { jobs.forEach(job => { job.preferredPlatform = $('[data-platform]').value; if (job.platforms?.length) applyPlatform(job); }); });
  $('[data-action=reparse]').addEventListener('click', () => jobs.forEach(job => { void job.selection.reloadSources(); }));
  [...modes.children].forEach((button, index) => button.addEventListener('click', () => { single.hidden = !!index; batch.hidden = !index; [...modes.children].forEach((item, i) => item.setAttribute('aria-pressed', String(i === index))); }));
  function setLanguage(en) {
    english = en; modes.setAttribute('aria-label', en ? 'Pull mode' : '拉取模式'); modes.children[0].textContent = en ? 'Single' : '单个'; modes.children[1].textContent = en ? 'Batch' : '批量';
    batch.querySelectorAll('[data-text]').forEach(node => node.textContent = text(node.dataset.text));
    $('#pull-batch-input').placeholder = text('placeholder'); $('input[type=file]').setAttribute('aria-label', text('upload')); $('[data-errors]').textContent = issues.map(issueText).join('\n');
    jobs.forEach(job => { job.selection.setLanguage(); job.platform.previousElementSibling.textContent = messages().architecture; job.platform.setAttribute('aria-label', `${messages().architecture} ${job.image}`); }); $('[data-platform]').setAttribute('aria-label', text('platform')); update();
  }
  setLanguage(false); return { setLanguage };
}
