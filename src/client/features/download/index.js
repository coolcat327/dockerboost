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
  messages: {
    'zh-CN': {
      tab: '下载', kicker: 'PUBLIC IMAGE DOWNLOAD', title: '下载镜像',
      description: '选择镜像源和目标 CPU 架构后，可直接在浏览器下载，或复制下方命令到终端',
      label: '镜像名', labelDetail: '（可粘贴 docker pull 命令解析）', source: '镜像源',
      automatic: '自动（最快可用）', architecture: '目标架构',
      browser: '下载', stop: '停止下载', layerUnit: '层', sizeSeparator: ' 共 ', share: '分享', shareCopied: '分享链接已复制', shareGenerated: '分享链接已生成', shareNeedsImage: '请先填写镜像名', shareFailed: '无法生成分享链接', shareCopyManually: '请复制此分享链接', shareCopyFailed: '未能复制分享链接', meta: '终端下载', copy: '复制全部', note: '仅支持公开镜像'
    },
    en: {
      tab: 'Download', kicker: 'PUBLIC IMAGE DOWNLOAD', title: 'Download images',
      description: 'Choose an image source and CPU architecture, then download it in the browser or copy the command below to your terminal.',
      label: 'Image name', labelDetail: ' (a docker pull command is accepted)', source: 'Image source',
      automatic: 'Auto (fastest available)', architecture: 'Target architecture',
      browser: 'Download', stop: 'Stop download', layerUnit: 'layers', sizeSeparator: ' · ', share: 'Share', shareCopied: 'Share link copied', shareGenerated: 'Share link is ready', shareNeedsImage: 'Enter an image name first', shareFailed: 'Could not create a share link', shareCopyManually: 'Copy this share link', shareCopyFailed: 'Could not copy the share link', meta: 'Terminal download', copy: 'Copy all', note: 'Only public images are supported.'
    }
  },
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
  lookupResult.classList.remove('hidden');
  let activeExport;
  let selection;
  let inspectionController;
  let inspectionToken = 0;
  let inspectionLabel = '';
  let inspectionDetails;
  let inspectionVisible = false;

  const buildDownload = () => {
    const { image: input, platform, resolvedSource } = selection.current();
    if (!input.trim()) { loadCommand.textContent = locale().waitingPlatforms; return; }
    if (!platform) { loadCommand.textContent = locale().loadingPlatforms; return; }
    const image = selection.resolve();
    browserDownload.removeAttribute('aria-disabled');
    loadCommand.textContent = batchCommands([{ image: image.upstream, platform, source: resolvedSource }], window.location.origin);
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
      activeExport.worker?.terminate();
      return;
    }
    if (browserDownload.getAttribute('aria-disabled') === 'true') return;
    cancelInspection();
    const exportTask = { controller: new AbortController(), worker: undefined };
    activeExport = exportTask;
    browserDownload.classList.add('is-stoppable');
    browserDownload.textContent = messages().stop;
    progress.start();
    try {
      const { platform, resolvedSource } = selection.current();
      const image = selection.resolve();
      const filename = archiveFilename(image.original, platform);
      const result = await retryDownload(attempt => {
        progress.start(filename, { preserveStartedAt: attempt > 0 });
        return exportArchive({ image, platform, source: resolvedSource, signal: exportTask.controller.signal, onProgress: event => progress.update(event) });
      }, { signal: exportTask.controller.signal, onRetry: (error, retry) => progress.retry(error, retry) });
      progress.complete({ filename: result.filename, size: result.archive.size });
    } catch (error) {
      progress.fail(error, exportTask.controller.signal.aborted);
      if (!exportTask.controller.signal.aborted) flash(lookupStatus.textContent);
    } finally {
      exportTask.worker?.terminate();
      activeExport = undefined;
      browserDownload.classList.remove('is-stoppable');
      browserDownload.textContent = messages().browser;
      if (selection.current().platform) browserDownload.removeAttribute('aria-disabled');
      else browserDownload.setAttribute('aria-disabled', 'true');
    }
  });
  selection = createImageSelection({
    panel, locale, messages, flash, store: selectionStore,
    onLoading: () => { cancelInspection(); if (!activeExport) progress.clear(); },
    onReady: () => {
      buildDownload();
      if (!activeExport) showInspection();
    },
    onError: (error) => {
      cancelInspection();
      loadCommand.textContent = locale().waitingPlatforms;
      if (!activeExport) {
        progress.info(error instanceof Error ? error.message : locale().waitingPlatforms);
      }
    },
    onReset: () => {
      cancelInspection();
      loadCommand.textContent = locale().waitingPlatforms;
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
      if (activeExport) return;
      showInspection();
    } catch { /* wait for a valid name */ }
  });
  const batch = initBatch({ panel, locale, messages, flash, selectionStore, sharedBatchHash, singleBusy: () => !!activeExport });
  return { setLanguage: (message) => {
    batch.setLanguage(message === feature.messages.en);
    selection.setLanguage();
    browserDownload.textContent = activeExport ? message.stop : message.browser;
    shareButton.textContent = message.share;
    progress.setLanguage(message === feature.messages.en ? 'en' : 'zh-CN');
    renderInspection();
  } };
  }
};
