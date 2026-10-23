import { createTransferRate, formatDuration, formatImageSize } from './transfer-progress.js';

const translations = {
  'zh-CN': {
    preparing: '正在准备下载…', resolve: '正在解析镜像…', download: '正在下载',
    export: '正在本地打包…', handoff: '正在交给浏览器保存…', done: '已保存',
    cancelled: '已停止下载', error: '下载失败', speed: '速度', measuring: '正在计算速度…',
    elapsed: '总耗时', label: '下载进度', unknown: '总大小未知', retry: '等待重试'
  },
  en: {
    preparing: 'Preparing download…', resolve: 'Resolving image…', download: 'Downloading',
    export: 'Packaging locally…', handoff: 'Handing off to browser…', done: 'Saved',
    cancelled: 'Download stopped', error: 'Download failed', speed: 'Speed', measuring: 'Measuring speed…',
    elapsed: 'Total time', label: 'Download progress', unknown: 'Total size unknown', retry: 'Retrying in'
  }
};
const activePhases = new Set(['preparing', 'resolve', 'download', 'export', 'handoff']);

// Presentation only: callers retain ownership of cancellation, storage and save handoff.
export function createDownloadProgress({ row, status, detail, metrics, track, fill, icon, compact = false, clock = () => performance.now() }) {
  let language = 'zh-CN';
  let state = { phase: 'idle' };
  let startedAt = 0;
  let rate = createTransferRate(clock);
  let lastRender = -Infinity;
  let lastDownload = { completed: 0, total: 0 };

  function render() {
    const text = translations[language];
    const { phase, completed = 0, total = 0 } = state;
    const known = Number.isFinite(total) && total > 0;
    const percent = known ? Math.min(100, Math.floor(completed / total * 100)) : null;
    const active = activePhases.has(phase);
    const indeterminate = active && (phase !== 'download' || !known);
    row.hidden = phase === 'idle';
    row.dataset.phase = phase;
    let heading = phase === 'info' ? state.message : (text[phase] || '');
    if (phase === 'download' && known) heading += ` · ${percent}%`;
    // Do not repeatedly announce an unchanged percentage for every chunk.
    if (status.textContent !== heading) status.textContent = heading;
    status.hidden = compact && ['download', 'done', 'error', 'retry'].includes(phase);
    const retryMessage = `${text.retry} ${state.delay / 1000}s (${state.attempt}/3)`;
    if (phase === 'retry') status.textContent = retryMessage;
    detail.textContent = compact && phase === 'done' ? `${text.done} · ${state.name}`
      : phase === 'error' && compact ? `${text.error} · ${state.error}`
        : phase === 'retry' && compact ? `${retryMessage} · ${state.error}` : state.error || state.name || '';
    detail.title = detail.textContent;
    detail.hidden = !detail.textContent || (compact && !['done', 'error', 'retry'].includes(phase));
    let summary = '';
    if (phase === 'download') {
      const amount = known ? `${formatImageSize(completed)} / ${formatImageSize(total)}` : `${formatImageSize(completed)} · ${text.unknown}`;
      summary = `${amount} · ${state.speed ? `${text.speed}: ${state.speed}` : text.measuring}`;
      if (compact) summary = `${known ? `${percent}% · ` : ''}${amount} · ${state.speed || text.measuring}`;
    } else if (phase === 'done') {
      summary = `${formatImageSize(state.size)} · ${text.elapsed}: ${formatDuration(state.elapsed, language)}`;
      if (compact) summary = `100% · ${summary}`;
    }
    metrics.textContent = summary;
    metrics.title = summary;
    metrics.hidden = !summary;
    const retained = phase === 'retry' || (compact && phase === 'error');
    track.hidden = !active && phase !== 'done' && !retained;
    track.classList.toggle('is-indeterminate', indeterminate);
    track.setAttribute('aria-label', text.label);
    track.setAttribute('aria-valuetext', [status.textContent, summary].filter(Boolean).join(' · '));
    const value = phase === 'done' ? 100 : (percent ?? 0);
    if (indeterminate || track.hidden || (retained && !known)) track.removeAttribute('aria-valuenow');
    else track.setAttribute('aria-valuenow', String(value));
    const packing = phase === 'export' || phase === 'handoff';
    fill.style.width = `${indeterminate ? (packing ? 35 : 0) : value}%`;
    icon.style.left = `clamp(4px, calc(${value}% - 30px), calc(100% - 34px))`;
    if (compact && phase === 'done') {
      // CSS animations normally start per task. Use the document timeline origin for every completed row.
      for (const animation of row.getAnimations?.({ subtree: true }) || []) {
        if (['batch-complete-metrics', 'batch-complete-detail'].includes(animation.animationName)) animation.startTime = 0;
      }
    }
  }

  return {
    clear() { state = { phase: 'idle' }; render(); },
    info(message) { state = { phase: 'info', message }; render(); },
    start(name, { preserveStartedAt = false } = {}) {
      if (!preserveStartedAt) startedAt = clock();
      lastDownload = { completed: 0, total: 0 };
      rate = createTransferRate(clock);
      lastRender = -Infinity;
      state = { phase: 'preparing', name };
      render();
    },
    update({ phase, completed = 0, total = 0, name } = {}) {
      // Worker "done" means the archive is ready, not that save handoff succeeded.
      if (phase === 'done') phase = 'handoff';
      if (!activePhases.has(phase)) return;
      const previousPhase = state.phase;
      const metadataChanged = (name !== undefined && name !== state.name) || total !== state.total;
      if (phase === 'download' && previousPhase !== 'download') rate(0);
      const speed = phase === 'download' ? rate(completed) : '';
      if (phase === 'download') lastDownload = { completed, total };
      state = { ...state, phase, completed: Math.max(0, completed), total, name: name ?? state.name,
        speed: speed || (previousPhase === phase ? state.speed : '') };
      const now = clock();
      if (phase === 'download' && previousPhase === phase && !metadataChanged && (!total || completed < total) && now - lastRender < 100) return;
      lastRender = now;
      render();
    },
    complete({ filename, size }) {
      state = { phase: 'done', name: filename, size, elapsed: Math.max(0, clock() - startedAt) };
      render();
    },
    fail(error, cancelled = false) {
      state = { ...lastDownload, phase: cancelled ? 'cancelled' : 'error', name: state.name, error: cancelled ? '' : error?.message || String(error || '') };
      render();
    },
    retry(error, { attempt, delay }) {
      state = { ...lastDownload, phase: 'retry', attempt, delay, name: state.name, error: error?.message || String(error || '') };
      render();
    },
    setLanguage(value) { language = translations[value] ? value : 'zh-CN'; render(); }
  };
}
