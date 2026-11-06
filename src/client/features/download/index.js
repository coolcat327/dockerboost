import { messages } from './messages.js';
import { batchCommands } from './terminal-commands.js';
import { initBatch } from './batch.js';
import { exportArchive } from './export-archive.js';
import { clearDownloadCaches } from '../../common/browser-download-task.js';
import { formatImageMetadata } from '../../common/transfer-progress.js';
import { createDownloadProgress } from '../../common/download-progress.js';
import { archiveFilename } from '../../common/image-reference.js';
import { createImageSelection } from '../../common/image-selection.js';
import { shareSelection } from '../../common/share-link.js';
import { retryDownload } from '../../common/download-retry.js';

export const feature = {
  id: 'download',
  selectionGroup: 'image',
  messages,
  init({ panel, locale, messages, flash, selectionStore, sharedBatchHash }) {
  void clearDownloadCaches().catch(() => {});
  const lookupResult = panel.querySelector('#lookup-result');
  const lookupStatus = panel.querySelector('#lookup-status');
  const progressTrack = panel.querySelector('#download-progress');
  const progress = createDownloadProgress({
    row: panel.querySelector('.download-progress-row'), status: lookupStatus,
    detail: panel.querySelector('#download-detail'), metrics: panel.querySelector('#download-speed-status'),
    track: progressTrack, fill: progressTrack.querySelector('.download-progress-fill'), icon: progressTrack.querySelector('.download-progress-icon')
  });
  const browserDownload = panel.querySelector('#browser-download');
  const shareButton = panel.querySelector('#download-share');
  const loadCommand = panel.querySelector('#load-command');
  const copyCommand = panel.querySelector('[data-copy="load-command"]');
  let commandState = 'waitingPlatforms';
  const showCommandStatus = state => { commandState = state; loadCommand.textContent = locale()[state]; copyCommand.disabled = true; };
  lookupResult.classList.remove('hidden');
  let activeExport;
  let needsReparse = false;
  let selection;
  let inspectionController;
  let inspectionToken = 0;
  let inspectionLabel = '';
  let inspectionDetails;
  let inspectionVisible = false;

  const buildDownload = () => {
    const { image: input, platform, platformUnsupported, resolvedSource } = selection.current();
    if (!input.trim()) { showCommandStatus('waitingPlatforms'); return; }
    if (!platform) { showCommandStatus(platformUnsupported ? 'unsupportedPlatforms' : 'noPlatforms'); if (!activeExport) browserDownload.setAttribute('aria-disabled', 'true'); return; }
    const image = selection.resolve();
    browserDownload.removeAttribute('aria-disabled');
    commandState = ''; copyCommand.disabled = false;
    loadCommand.textContent = batchCommands([{ image: image.original, platform, source: resolvedSource }], window.location.origin);
  };
  const cancelInspection = () => {
    inspectionController?.abort();
    inspectionController = undefined;
    inspectionToken++;
    inspectionVisible = false;
  };
  const renderInspection = () => {
    if (!inspectionVisible) return;
    const metadata = formatImageMetadata(inspectionDetails, messages().layerUnit, messages().sizeSeparator);
    progress.info([inspectionLabel, metadata].filter(Boolean).join(' · '));
  };
  const showInspection = () => {
    cancelInspection();
    const { platform, resolvedSource } = selection.current();
    const image = selection.resolve();
    inspectionLabel = `${resolvedSource} · ${image.original} · ${platform}`;
    inspectionDetails = undefined;
    inspectionVisible = true;
    renderInspection();
    const controller = new AbortController();
    inspectionController = controller;
    const token = inspectionToken;
    const url = `/api/inspect?image=${encodeURIComponent(image.upstream)}&platform=${encodeURIComponent(platform)}&source=${encodeURIComponent(resolvedSource)}`;
    fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('无法读取镜像大小');
      return response.json();
    }).then((details) => {
      if (token !== inspectionToken) return;
      inspectionDetails = details;
      renderInspection();
    }).catch(() => { /* Platform selection remains usable when size lookup fails. */ });
  };
  browserDownload.addEventListener('click', async (event) => {
    event.preventDefault();
    if (activeExport) {
      activeExport.controller.abort();
      return;
    }
    if (needsReparse) { needsReparse = false; browserDownload.textContent = messages().browser; browserDownload.setAttribute('aria-disabled', 'true'); void selection.recheck(); return; }
    if (browserDownload.getAttribute('aria-disabled') === 'true') return;
    cancelInspection();
    const exportTask = { controller: new AbortController() };
    const exportSelection = selection.current();
    activeExport = exportTask;
    browserDownload.classList.add('is-stoppable');
    browserDownload.textContent = messages().stop;
    progress.start();
    try {
      const { platform, resolvedSource } = exportSelection;
      const image = selection.resolve();
      const filename = archiveFilename(image.original, platform);
      const result = await retryDownload(attempt => {
        progress.start(filename, { preserveStartedAt: attempt > 0 });
        return exportArchive({ image, platform, source: resolvedSource, signal: exportTask.controller.signal, onProgress: event => progress.update(event) });
      }, { signal: exportTask.controller.signal, onRetry: (error, retry) => progress.retry(error, retry) });
      progress.complete({ filename: result.filename, size: result.archive.size });
    } catch (error) {
      const current = selection.current();
      if (error?.code === 'PLATFORM_CHANGED' && current.image === exportSelection.image && current.source === exportSelection.source && current.platform === exportSelection.platform) {
        needsReparse = true; showCommandStatus('failedPlatforms');
      }
      progress.fail(error, exportTask.controller.signal.aborted);
      if (!exportTask.controller.signal.aborted) flash(lookupStatus.textContent);
    } finally {
      activeExport = undefined;
      browserDownload.classList.remove('is-stoppable');
      browserDownload.textContent = needsReparse ? messages().reparse : messages().browser;
      if (needsReparse || selection.current().platform) browserDownload.removeAttribute('aria-disabled');
      else browserDownload.setAttribute('aria-disabled', 'true');
    }
  });
  selection = createImageSelection({
    panel, locale, messages, flash, store: selectionStore,
    onLoading: () => { needsReparse = false; cancelInspection(); showCommandStatus('loadingPlatforms'); if (!activeExport) progress.clear(); },
    onReady: () => {
      buildDownload();
      if (!activeExport && selection.current().platform) showInspection();
    },
    onError: (error) => {
      cancelInspection();
      showCommandStatus('failedPlatforms');
      if (!activeExport) {
        progress.info(error instanceof Error ? error.message : locale().waitingPlatforms);
      }
    },
    onReset: () => {
      needsReparse = false;
      if (!activeExport) browserDownload.textContent = messages().browser;
      cancelInspection();
      showCommandStatus('waitingPlatforms');
      if (!activeExport) {
        progress.clear();
        browserDownload.setAttribute('aria-disabled', 'true');
      }
    }
  });
  selection.init();
  shareButton.addEventListener('click', () => shareSelection({ tab: 'download', selection, button: shareButton, messages, flash }));
  selection.onPlatformChange(() => {
    try {
      buildDownload();
      if (!selection.current().platform) { cancelInspection(); if (!activeExport) progress.clear(); return; }
      if (activeExport) return;
      showInspection();
    } catch { /* wait for a valid name */ }
  });
  const batch = initBatch({ panel, locale, messages, flash, selectionStore, sharedBatchHash, singleBusy: () => !!activeExport });
  return { setLanguage: (message) => {
    batch.setLanguage(message === feature.messages.en);
    selection.setLanguage();
    if (commandState) showCommandStatus(commandState);
    browserDownload.textContent = activeExport ? message.stop : needsReparse ? message.reparse : message.browser;
    shareButton.textContent = message.share;
    progress.setLanguage(message === feature.messages.en ? 'en' : 'zh-CN');
    renderInspection();
  } };
  }
};
