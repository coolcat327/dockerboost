import { buildVersion, downloadRequestUrl } from '../../common/download-cache-policy.js';
import { writeOpfsFile, writeOpfsStream } from '../../common/opfs-file-writer.js';
import { clearDownloadCaches, createDownloadTask } from '../../common/browser-download-task.js';
import { createTransferRate } from '../../common/transfer-progress.js';
import { Sha256 } from '../../common/sha256.js';
import { writeArchive } from '../download/archive-format.js';
const zh = { tab: '安装', kicker: 'DOCKER INSTALLATION', title: '在线安装与离线包', description: '选择 Linux 架构与版本，下载后复制到离线机器安装。', copy: '复制全部' };
const en = { tab: 'Install', kicker: 'DOCKER INSTALLATION', title: 'Online & offline install', description: 'Select Linux architecture and versions, then transfer the bundle to your offline machine.', copy: 'Copy all' };

const translations = {
  'zh-CN': {
    resources: '相关资源', binariesGuide: 'Docker 静态安装指南', composeGuide: 'Compose 安装指南', online: '在线安装', onlineHelp: '在线安装脚本来自 LinuxMirrors，提供 Docker 安装与换源的交互引导。在联网 Linux 主机上以 root 运行，按提示选择版本和镜像源；需要 Bash 和 curl。', onlineLink: 'LinuxMirrors 安装说明',
    offline: '离线安装', offlineHelp: '适用于全新安装的 systemd Linux。包含安装说明、Docker 静态包、Compose、daemon.json、服务文件、校验文件及交互安装脚本。',
    chooseArch: '请选择 CPU 架构', currentArch: '当前：', chooseVersion: '请先选择 CPU 架构', cpu: 'CPU 架构', dockerVersion: 'Docker 版本', composeVersion: 'Compose 版本', download: '下载', stop: '停止下载', reload: '刷新', downloadCommand: '下载离线安装包',
    installHelp: '在联网 Linux 机器下载，完成后将 tar 包复制到离线机器。解压：<code>tar -xf docker-offline-*.tar</code>，再执行 <code>sudo sh offline_install_docker.sh</code>。交互询问数据目录、镜像源、日志大小/数量及 live-restore，回车使用默认值。', dockerLink: 'Docker 静态包', composeLink: 'Compose 发布版本',
    waiting: '选择版本后自动显示下载命令', loading: '正在读取官方版本列表…', ready: '版本已就绪。', unavailable: '此架构暂无匹配的 Docker / Compose 版本，请选择其他架构。', retry: '请点击刷新。', package: '离线安装包',
    unsupported: '此浏览器不支持本地文件暂存，请使用下载命令', preparing: '正在准备下载…', speed: '速度', downloading: '下载中', failed: '下载失败', packing: '正在校验并打包…', done: '离线包已下载', cancelled: '已取消下载', progressLabel: '离线安装包下载进度'
  },
  en: {
    resources: 'Related resources', binariesGuide: 'Docker binary installation guide', composeGuide: 'Compose installation guide', online: 'Online installation', onlineHelp: 'The installation script is provided by LinuxMirrors and guides you through Docker installation and mirror selection. Run as root on an online Linux host; requires Bash and curl.', onlineLink: 'LinuxMirrors installation guide',
    offline: 'Offline installation', offlineHelp: 'For a fresh installation on systemd Linux. Includes an installation guide, Docker binaries, Compose, daemon.json, a service unit, checksums and an interactive installer.',
    chooseArch: 'Select CPU architecture', currentArch: 'Current: ', chooseVersion: 'Select CPU architecture first', cpu: 'CPU architecture', dockerVersion: 'Docker version', composeVersion: 'Compose version', download: 'Download', stop: 'Stop download', reload: 'Refresh', downloadCommand: 'Download offline bundle',
    installHelp: 'Download on an online Linux host, then transfer the tar to the offline machine. Extract with <code>tar -xf docker-offline-*.tar</code>, then <code>sudo sh offline_install_docker.sh</code>. The installer asks about the data directory, mirror, log rotation and live-restore. Press Enter to accept defaults.', dockerLink: 'Docker binaries', composeLink: 'Compose releases',
    waiting: 'Select versions to show the download command', loading: 'Loading official versions…', ready: 'Versions ready.', unavailable: 'No matching Docker / Compose versions for this architecture. Choose another architecture.', retry: 'Click Refresh to retry.', package: 'Offline bundle',
    unsupported: 'Local file storage is unavailable. Use the download command.', preparing: 'Preparing download…', speed: 'Speed', downloading: 'Downloading', failed: 'Download failed', packing: 'Verifying and packaging…', done: 'Bundle downloaded', cancelled: 'Download cancelled', progressLabel: 'Offline bundle download progress'
  }
};

export const feature = {
  id: 'install', messages: { 'zh-CN': zh, en },
  init({ panel }) {
    const arch = panel.querySelector('#install-arch');
    const docker = panel.querySelector('#install-docker');
    const version = buildVersion;
    let selectedArch = '', selectedArchLabel = '';
    const currentArch = panel.querySelector('#install-arch-current');
    let composeVersion = ''; 
    const download = panel.querySelector('#install-download');
    const status = panel.querySelector('#install-status');
    const command = panel.querySelector('#install-command');
    const speedStatus = panel.querySelector('#install-speed');
    let lastSpeed = '', downloadProgress;
    const renderDownloadProgress = () => {
      if (!downloadProgress) return;
      const { name, received, expected } = downloadProgress;
      const amount = (received / 1048576).toFixed(1);
      status.textContent = expected > 0
        ? `${text.downloading} ${Math.min(100, Math.floor(received / expected * 100))}% · ${amount}/${(expected / 1048576).toFixed(1)} MB · ${name}`
        : `${text.downloading} · ${amount} MB · ${name}`;
    };
    const renderSpeed = () => { speedStatus.textContent = lastSpeed ? `${text.speed}: ${lastSpeed}` : ''; speedStatus.hidden = !lastSpeed; };
    let controller;
    let generation = 0, busy = false, text = translations['zh-CN'], state = 'chooseArch', commandUrl = '';
    const progress = panel.querySelector('#install-progress');
    const showProgress = (value, running = true) => {
      progress.hidden = false;
      progress.querySelector('span').style.width = `${value}%`;
      progress.querySelector('img').style.left = `clamp(4px, calc(${value}% - 30px), calc(100% - 34px))`;
      progress.setAttribute('aria-valuenow', String(Math.round(value)));
      progress.classList.toggle('is-running', running);
    };
    const setStatus = (key) => { state = key; status.textContent = text[key]; };
    const renderCommand = () => { command.textContent = commandUrl ? `curl -fsSL -o .download-docker.sh '${commandUrl}' && sh .download-docker.sh` : text.waiting; };
    const renderPackage = () => {
      panel.querySelector('#install-package-name').textContent = docker.value ? `docker-offline-${selectedArch}-docker-${docker.value}-compose-${composeVersion}.tar` : text.package;
      panel.querySelector('#install-package-tree').textContent = docker.value ? `.\n├── readme.md\n├── docker-${docker.value}.tgz\n├── docker-compose\n├── daemon.json\n├── docker.service\n├── offline_install_docker.sh\n└── SHA256SUMS` : text.waiting;
    };
    const query = () => new URLSearchParams({ arch: selectedArch, docker: docker.value, compose: composeVersion, version });
    const json = async (url, signal, cache) => { const r = await fetch(downloadRequestUrl(url, version), { signal, ...(cache ? { cache } : {}) }); const data = await r.json(); if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`); return data; };
    const ready = () => { panel.querySelector('#install-reload').disabled = busy || !selectedArch; docker.disabled = busy || !docker.value; download.disabled = !busy && (!docker.value || !composeVersion); download.textContent = busy ? text.stop : text.download; download.classList.toggle('is-stoppable', busy); };
    const invalidate = () => {
      commandUrl = '';
      if (docker.value && composeVersion) {
        const q = query();
        commandUrl = `${window.location.origin}/api/install/script?${q}`;
      }
      renderCommand(); renderPackage();
    };
    async function load() {
      if (!selectedArch) return;
      const current = ++generation;
      docker.replaceChildren(); composeVersion = ''; ready(); invalidate();
      setStatus('loading');
      try {
        const data = await json(`/api/install/catalog?arch=${selectedArch}`, undefined, 'no-store');
        if (current !== generation) return;
        for (const version of data.docker) docker.add(new Option(version, version));
        composeVersion = data.compose;
        setStatus(docker.value && composeVersion ? 'ready' : 'unavailable'); invalidate();
      } catch (error) { if (current === generation) status.textContent = `${error.message} · ${text.retry}`; }
      ready();
    }
    const renderArch = () => { currentArch.textContent = selectedArch ? `${text.currentArch}${selectedArchLabel}` : text.chooseArch; };
    arch.addEventListener('change', () => {
      if (!arch.value) return;
      selectedArch = arch.value;
      selectedArchLabel = arch.selectedOptions[0].textContent;
      renderArch();
      // Return to the current-architecture display so choosing the same real option fires change again.
      arch.value = '';
      return load();
    });
    docker.addEventListener('change', invalidate);
    const cleanupCache = clearDownloadCaches;
    panel.querySelector('#install-reload').addEventListener('click', async () => {
      try { await cleanupCache(); } catch (error) { status.textContent = error.message; return; }
      await load();
    });
    download.addEventListener('click', async () => {
      if (busy) { controller.abort(); return; }
      controller = new AbortController();
      const { signal } = controller;
      let task;
      const responses = [];
      try {
        busy = true; downloadProgress = null; lastSpeed = ''; renderSpeed(); ready(); setStatus('preparing'); showProgress(0); arch.disabled = docker.disabled = true;
        invalidate();
        const q = query();
        const filename = `docker-offline-${selectedArch}-docker-${docker.value}-compose-${composeVersion}.tar`;
        if (!navigator.storage?.getDirectory) throw new Error(text.unsupported);
        task = await createDownloadTask('install');
        signal.throwIfAborted();
        const job = task.directory;
        const { files } = await json(`/api/install/plan?${q}`, signal);
        const encoder = new TextEncoder();
        const entries = Object.entries(files).map(([name, text]) => [name, encoder.encode(text)]);
        let total = 0;
        const transferRate = createTransferRate();
        transferRate(0);
        const hashes = new Map();
        const assets = [['docker', `docker-${docker.value}.tgz`], ['compose', 'docker-compose']];
        // Open both requests to obtain the combined size before reporting progress.
        await Promise.all(assets.map(async ([kind, name], index) => {
          const response = await fetch(`/api/install/asset?${q}&kind=${kind}`, { signal });
          responses[index] = response;
          if (!response.ok) throw new Error(`${text.failed}: ${name} (${response.status})`);
        }));
        const sizes = responses.map(response => Number(response.headers.get('content-length')));
        const expected = sizes.every(size => size > 0) ? sizes.reduce((sum, size) => sum + size, 0) : 0;
        for (const [index, [, name]] of assets.entries()) {
          signal.throwIfAborted();
          state = 'downloading';
          downloadProgress = { name, received: total, expected };
          renderDownloadProgress();
          const r = responses[index];
          const fileHandle = await job.getFileHandle(name, { create: true });
          const hash = new Sha256();
          await writeOpfsStream(fileHandle, r.body, {
            signal,
            onChunk(value) {
              total += value.byteLength; hash.update(value);
              downloadProgress.received = total; renderDownloadProgress();
              const speed = transferRate(total);
              if (speed) { lastSpeed = speed; renderSpeed(); }
              if (expected > 0) showProgress(Math.min(total / expected, 1) * 90);
              else { progress.removeAttribute('aria-valuenow'); progress.classList.add('is-indeterminate'); }
            }
          });
          if (expected > 0) showProgress(Math.min(total / expected, 1) * 90);
          hashes.set(name, hash.hex());
          entries.push([name, await fileHandle.getFile()]);
        }
        downloadProgress = null;
        progress.classList.toggle('is-indeterminate', false);
        lastSpeed = ''; renderSpeed(); setStatus('packing'); showProgress(95);
        let sums = '';
        for (const [name, data] of entries) {
          const hash = hashes.get(name) || new Sha256().update(data).hex();
          sums += `${hash}  ${name}\n`;
        }
        entries.push(['SHA256SUMS', encoder.encode(sums)]);
        {
          const archiveHandle = await job.getFileHandle(filename, { create: true });
          await writeOpfsFile(archiveHandle, writable => writeArchive(writable, entries, { signal }), { signal });
          const archive = await archiveHandle.getFile();
          signal.throwIfAborted();
          task.save(archive, filename);
        }
        setStatus('done'); showProgress(100, false);
      } catch (error) {
        downloadProgress = null; lastSpeed = ''; renderSpeed(); progress.hidden = true;
        if (signal.aborted) setStatus('cancelled');
        else { state = 'error'; status.textContent = error.message; }
      } finally {
        controller.abort();
        await Promise.all(responses.map(response => response.body?.cancel().catch(() => {})));
        await task?.finish().catch(() => {});
        controller = null; busy = false;
        progress.classList.toggle('is-indeterminate', false);
        progress.classList.toggle('is-running', false);
        arch.disabled = docker.disabled = false; ready();
      }
    });
    void cleanupCache().catch(() => {});
    ready(); renderArch(); setStatus('chooseArch');
    return { setLanguage(message) {
      text = translations[message === en ? 'en' : 'zh-CN'];
      panel.querySelectorAll('[data-install-text]').forEach(node => { node.innerHTML = text[node.dataset.installText]; });
      progress.setAttribute('aria-label', text.progressLabel);
      renderArch();
      if (!selectedArch) { docker.replaceChildren(new Option(text.chooseVersion, '')); }
      renderCommand(); renderPackage(); renderSpeed(); ready();
      if (state === 'downloading') renderDownloadProgress();
      else if (text[state]) status.textContent = text[state];
    } };
  }
};
