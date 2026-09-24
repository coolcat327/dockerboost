import { runExport } from './export-client.js';
import { createTransferRate, formatDuration, formatTransferSpeed } from './download-speed.js';
import { archiveFilename } from '../../common/image-reference.js';
import { createImageSelection } from '../../common/image-selection.js';
import { shareSelection } from '../../common/share-link.js';

export const feature = {
  id: 'download',
  selectionGroup: 'image',
  messages: {
    'zh-CN': {
      tab: '下载', kicker: 'PUBLIC IMAGE DOWNLOAD', title: '下载镜像',
      description: '选择镜像源和目标 CPU 架构后，可直接在浏览器下载，或复制下方命令到终端',
      label: '镜像名', labelDetail: '（可粘贴 docker pull 命令解析）', source: '镜像源',
      automatic: '自动（最快可用）', architecture: '目标架构', action: '下载',
      browser: '下载', share: '分享', shareCopied: '分享链接已复制', shareGenerated: '分享链接已生成', shareNeedsImage: '请先填写镜像名', shareFailed: '无法生成分享链接', shareCopyManually: '请复制此分享链接', shareCopyFailed: '未能复制分享链接', meta: '终端下载', copy: '复制全部', note: '仅支持公开镜像'
    },
    en: {
      tab: 'Download', kicker: 'PUBLIC IMAGE DOWNLOAD', title: 'Download an image.',
      description: 'Choose an image source and CPU architecture, then download it in the browser or copy the command below to your terminal.',
      label: 'Image name', labelDetail: ' (a docker pull command is accepted)', source: 'Image source',
      automatic: 'Auto (fastest available)', architecture: 'Target architecture', action: 'Download',
      browser: 'Download', share: 'Share', shareCopied: 'Share link copied', shareGenerated: 'Share link is ready', shareNeedsImage: 'Enter an image name first', shareFailed: 'Could not create a share link', shareCopyManually: 'Copy this share link', shareCopyFailed: 'Could not copy the share link', meta: 'Terminal download', copy: 'Copy all', note: 'Only public images are supported.'
    }
  },
  init({ panel, locale, messages, flash, selectionStore }) {
  const browserExportWorker = document.querySelector('meta[name="browser-export-worker"]')?.content;
  const iconUrl = document.querySelector('link[rel="icon"]')?.href;
  const sessionId = crypto.randomUUID();
  const lookupResult = panel.querySelector('#lookup-result');
  const lookupStatus = panel.querySelector('#lookup-status');
  const speedStatus = panel.querySelector('#download-speed-status');
  const progressRow = panel.querySelector('.download-progress-row');
  const progressTrack = panel.querySelector('#download-progress');
  const progressFill = progressTrack.querySelector('.download-progress-fill');
  const progressIcon = progressTrack.querySelector('.download-progress-icon');
  const browserDownload = panel.querySelector('#browser-download');
  const shareButton = panel.querySelector('#download-share');
  const loadCommand = panel.querySelector('#load-command');
  lookupResult.classList.remove('hidden');
  let browserExporting = false;
  let selection;

  const setLiveText = (element, value) => {
    element.style.fontSize = '';
    element.textContent = value;
    const available = element.clientWidth;
    const required = element.scrollWidth;
    if (available && required > available) {
      const baseSize = parseFloat(getComputedStyle(element).fontSize);
      element.style.fontSize = `${Math.max(8, Math.floor(baseSize * 10 * (available - 2) / required) / 10)}px`;
    }
  };
  const showProgress = (percent, running = true) => {
    if (!progressIcon.getAttribute('src')) progressIcon.src = iconUrl || '/docker-icon.svg';
    progressTrack.hidden = false;
    const value = Math.max(0, Math.min(100, percent));
    progressFill.style.width = `${value}%`;
    progressIcon.style.left = `clamp(4px, calc(${value}% - 30px), calc(100% - 34px))`;
    progressTrack.setAttribute('aria-valuenow', String(Math.round(value)));
    progressTrack.classList.toggle('is-running', running);
  };
  const clearProgress = () => {
    lookupStatus.style.fontSize = '';
    lookupStatus.removeAttribute('title');
    progressRow.classList.remove('is-complete');
    progressRow.hidden = true;
    speedStatus.hidden = true;
    progressTrack.hidden = true;
  };
  const buildDownload = () => {
    const { image: input, platform, resolvedSource } = selection.current();
    if (!input.trim()) { loadCommand.textContent = locale().waitingPlatforms; return; }
    if (!platform) { loadCommand.textContent = locale().loadingPlatforms; return; }
    const image = selection.resolve();
    browserDownload.removeAttribute('aria-disabled');
    const scriptUrl = `${window.location.origin}/api/download-script?image=${encodeURIComponent(image.upstream)}&platform=${encodeURIComponent(platform)}&source=${encodeURIComponent(resolvedSource)}`;
    loadCommand.textContent = `curl -fsSL -o .download-image.sh "${scriptUrl}" && sh .download-image.sh`;
  };
  browserDownload.addEventListener('click', async (event) => {
    event.preventDefault();
    if (browserExporting || browserDownload.getAttribute('aria-disabled') === 'true') return;
    browserExporting = true;
    browserDownload.setAttribute('aria-disabled', 'true');
    browserDownload.textContent = '正在下载…';
    progressRow.classList.remove('is-complete');
    lookupStatus.removeAttribute('title');
    showProgress(0);
    speedStatus.classList.remove('is-summary');
    speedStatus.hidden = false;
    setLiveText(speedStatus, '速度计算中…');
    const startedAt = performance.now();
    const transferRate = createTransferRate();
    let lastDownloadUpdateAt = 0;
    let worker;
    try {
      worker = new Worker(browserExportWorker || '/browser-export-worker.js');
      const { platform, resolvedSource } = selection.current();
      const image = selection.resolve();
      const result = await runExport(worker, { repository: image.repository, reference: image.reference, repoTag: image.original, source: resolvedSource, platform, filename: archiveFilename(image.original, platform), sessionId }, (progress) => {
        if (progress.phase === 'download') {
          const now = performance.now();
          if (progress.completed < progress.total && now - lastDownloadUpdateAt < 100) return;
          lastDownloadUpdateAt = now;
        }
        if (progress.phase === 'download' && progress.total) showProgress(progress.completed / progress.total * 90);
        if (progress.phase === 'export') { showProgress(95); setLiveText(speedStatus, '正在打包…'); }
        if (progress.phase === 'done') showProgress(100, false);
        progressRow.hidden = false;
        const speed = progress.phase === 'download' ? transferRate(progress.completed) : '';
        if (speed) setLiveText(speedStatus, `速度：${speed}`);
        setLiveText(lookupStatus, progress.message || (progress.total ? `下载中 ${Math.floor(progress.completed / progress.total * 100)}% · ${(progress.completed / 1048576).toFixed(1)}/${(progress.total / 1048576).toFixed(1)} MB` : '正在下载…'));
      });
      const url = URL.createObjectURL(result.archive);
      const link = document.createElement('a'); link.href = url; link.download = result.filename; document.body.append(link); link.click(); link.remove();
      const elapsedMs = Math.max(1, performance.now() - startedAt);
      lookupStatus.style.fontSize = '';
      speedStatus.style.fontSize = '';
      lookupStatus.textContent = `已保存：${result.filename}`;
      lookupStatus.title = result.filename;
      speedStatus.textContent = `均速 ${formatTransferSpeed(result.archive.size * 1000 / elapsedMs)} · 耗时 ${formatDuration(elapsedMs)}`;
      speedStatus.classList.add('is-summary');
      progressRow.classList.add('is-complete');
      showProgress(100, false);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      progressRow.hidden = false;
      lookupStatus.style.fontSize = '';
      lookupStatus.textContent = error.message || '浏览器下载失败，请使用终端命令。';
      speedStatus.hidden = true;
      flash(lookupStatus.textContent);
    } finally {
      worker?.terminate(); browserExporting = false; browserDownload.textContent = messages().browser;
      progressTrack.classList.remove('is-running');
      if (selection.current().platform) browserDownload.removeAttribute('aria-disabled');
    }
  });
  selection = createImageSelection({
    panel, locale, messages, flash, store: selectionStore,
    onLoading: clearProgress,
    onReady: (image) => {
      buildDownload();
      const { platform, resolvedSource } = selection.current();
      lookupStatus.textContent = `${resolvedSource} · ${image.original} · ${platform}`;
      progressRow.hidden = false;
    },
    onError: (error) => {
      loadCommand.textContent = locale().waitingPlatforms;
      lookupStatus.textContent = error instanceof Error ? error.message : '无法读取镜像信息';
      progressRow.hidden = false;
    },
    onReset: () => {
      loadCommand.textContent = locale().waitingPlatforms;
      clearProgress();
      browserDownload.setAttribute('aria-disabled', 'true');
    }
  });
  selection.init();
  shareButton.addEventListener('click', () => shareSelection({ tab: 'download', selection, button: shareButton, messages, flash }));
  selection.onPlatformChange(() => {
    try {
      buildDownload();
      clearProgress();
      const { platform, resolvedSource } = selection.current();
      lookupStatus.textContent = `${resolvedSource} · ${selection.resolve().original} · ${platform}`;
      progressRow.hidden = false;
    } catch { /* wait for a valid name */ }
  });
  return { setLanguage: (message) => {
    selection.setLanguage();
    if (!browserExporting) browserDownload.textContent = message.browser;
    shareButton.textContent = message.share;
  } };
  }
};
