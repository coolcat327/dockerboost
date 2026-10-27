import { retryDownload } from '../../common/download-retry.js';
import { buildVersion, downloadRequestUrl } from '../../common/download-cache-policy.js';
import { writeOpfsFile, writeOpfsStream } from '../../common/opfs-file-writer.js';
import { clearDownloadCaches, createDownloadTask } from '../../common/browser-download-task.js';
import { createDownloadProgress } from '../../common/download-progress.js';
import { Sha256 } from '../../common/sha256.js';
import { writeArchive } from '../download/archive-format.js';
const zh = { tab: '安装', kicker: 'DOCKER INSTALLATION', title: '在线安装与离线包', description: '选择 Linux 架构与版本，下载后复制到离线机器安装。', copy: '复制全部' };
const en = { tab: 'Install', kicker: 'DOCKER INSTALLATION', title: 'Online & offline install', description: 'Select Linux architecture and versions, then transfer the bundle to your offline machine.', copy: 'Copy all' };

const translations = {
  'zh-CN': {
    resources: '相关资源', binariesGuide: 'Docker 静态安装指南', composeGuide: 'Compose 安装指南', online: '在线安装', onlineHelp: '在线安装脚本来自 LinuxMirrors，提供 Docker 安装与换源的交互引导。在联网 Linux 主机上以 root 运行，按提示选择版本和镜像源；需要 Bash 和 curl。', onlineLink: 'LinuxMirrors 安装说明',
    offline: '离线安装', offlineHelp: '适用于全新安装的 systemd Linux。包含安装说明、Docker 静态包、Compose、daemon.json、服务文件、校验文件及安装/卸载脚本。',
    chooseArch: '请选择 CPU 架构', currentArch: '当前：', chooseVersion: '请先选择 CPU 架构', cpu: 'CPU 架构', dockerVersion: 'Docker 版本', download: '下载', stop: '停止下载', reload: '刷新', downloadCommand: '下载离线安装包',
    installHelp: '在联网 Linux 机器下载，完成后将 tar 包复制到离线机器。解压：<code>tar -xf docker-offline-*.tar</code>，进入解压出的同名文件夹，再执行 <code>sudo sh install_docker.sh</code>。交互询问数据目录、镜像源、日志大小/数量及 live-restore，回车使用默认值。卸载运行 <code>sudo sh uninstall_docker.sh</code>，仅卸载有记录的安装，备份当前配置供重装复用。', dockerLink: 'Docker 静态包', composeLink: 'Compose 发布版本',
    waiting: '选择版本后自动显示下载命令', loading: '正在读取官方版本列表…', ready: '版本已就绪。', unavailable: '此架构暂无匹配的 Docker / Compose 版本，请选择其他架构。', retry: '请点击刷新。', package: '离线安装包',
    unsupported: '此浏览器不支持本地文件暂存，请使用下载命令', failed: '下载失败'
  },
  en: {
    resources: 'Related resources', binariesGuide: 'Docker binary installation guide', composeGuide: 'Compose installation guide', online: 'Online installation', onlineHelp: 'The installation script is provided by LinuxMirrors and guides you through Docker installation and mirror selection. Run as root on an online Linux host; requires Bash and curl.', onlineLink: 'LinuxMirrors installation guide',
    offline: 'Offline installation', offlineHelp: 'For a fresh installation on systemd Linux. Includes an installation guide, Docker binaries, Compose, daemon.json, a service unit, checksums and install/uninstall scripts.',
    chooseArch: 'Select CPU architecture', currentArch: 'Current: ', chooseVersion: 'Select CPU architecture first', cpu: 'CPU architecture', dockerVersion: 'Docker version', download: 'Download', stop: 'Stop download', reload: 'Refresh', downloadCommand: 'Download offline bundle',
    installHelp: 'Download on an online Linux host, then transfer the tar to the offline machine. Extract with <code>tar -xf docker-offline-*.tar</code>, enter the extracted folder, then run <code>sudo sh install_docker.sh</code>. The installer asks about the data directory, mirror, log rotation and live-restore. Press Enter to accept defaults. Uninstall with <code>sudo sh uninstall_docker.sh</code>; only recorded installations are removed and the current configuration is saved for reinstall.', dockerLink: 'Docker binaries', composeLink: 'Compose releases',
    waiting: 'Select versions to show the download command', loading: 'Loading official versions…', ready: 'Versions ready.', unavailable: 'No matching Docker / Compose versions for this architecture. Choose another architecture.', retry: 'Click Refresh to retry.', package: 'Offline bundle',
    unsupported: 'Local file storage is unavailable. Use the download command.', failed: 'Download failed'
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
    const progressTrack = panel.querySelector('#install-progress');
    const progress = createDownloadProgress({
      row: panel.querySelector('.install-progress-row'), status,
      detail: panel.querySelector('#install-detail'), metrics: panel.querySelector('#install-speed'),
      track: progressTrack, fill: progressTrack.querySelector('span'), icon: progressTrack.querySelector('img')
    });
    let controller;
    let generation = 0, busy = false, text = translations['zh-CN'], state = 'chooseArch', downloadCommand = '';
    const setStatus = (key) => { state = key; progress.info(text[key]); };
    const renderCommand = () => { command.textContent = downloadCommand || text.waiting; };
    const bundleName = () => `docker-offline-${selectedArch}-docker-${docker.value}-compose-${composeVersion}`;
    const renderPackage = () => {
      panel.querySelector('#install-package-name').textContent = docker.value ? `${bundleName()}.tar` : text.package;
      panel.querySelector('#install-package-tree').textContent = docker.value ? `${bundleName()}/\n├── readme.md\n├── docker-${docker.value}.tgz\n├── docker-compose\n├── daemon.json\n├── docker.service\n├── install_docker.sh\n├── uninstall_docker.sh\n└── SHA256SUMS` : text.waiting;
    };
    const query = () => new URLSearchParams({ arch: selectedArch, docker: docker.value, compose: composeVersion, version });
    const json = async (url, signal, cache) => { const r = await fetch(downloadRequestUrl(url, version), { signal, ...(cache ? { cache } : {}) }); const data = await r.json(); if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`); return data; };
    const ready = () => { panel.querySelector('#install-reload').disabled = busy || !selectedArch; docker.disabled = busy || !docker.value; download.disabled = !busy && (!docker.value || !composeVersion); download.textContent = busy ? text.stop : text.download; download.classList.toggle('is-stoppable', busy); };
    const invalidate = () => {
      downloadCommand = '';
      if (docker.value && composeVersion) {
        const quote = value => "'" + String(value).replaceAll("'", "'\"'\"'") + "'";
        downloadCommand = `curl -fsSL -o .download-docker.sh ${quote(`${window.location.origin}/download-docker.sh`)} && sh .download-docker.sh ${[window.location.origin, selectedArch, docker.value, composeVersion, version].map(quote).join(' ')}`;
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
      } catch (error) { if (current === generation) { state = 'error'; progress.info(`${error.message} · ${text.retry}`); } }
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
    docker.addEventListener('change', () => { invalidate(); setStatus('ready'); });
    panel.querySelector('#install-reload').addEventListener('click', async () => {
      try { await clearDownloadCaches(); } catch (error) { state = 'error'; progress.info(error.message); return; }
      await load();
    });
    download.addEventListener('click', async () => {
      if (busy) { controller.abort(); return; }
      controller = new AbortController();
      const { signal } = controller;
      try {
        busy = true; state = 'transfer'; ready(); arch.disabled = docker.disabled = true;
        invalidate();
        const q = query();
        const filename = `${bundleName()}.tar`;
        progress.start(filename);
        if (!navigator.storage?.getDirectory) throw new Error(text.unsupported);
        await retryDownload(async attempt => {
          let task;
          const responses = [], requests = [];
          const attemptController = new AbortController();
          const abortAttempt = () => attemptController.abort(signal.reason);
          signal.addEventListener('abort', abortAttempt, { once: true });
          if (signal.aborted) abortAttempt();
          const attemptSignal = attemptController.signal;
          try {
            if (attempt > 0) progress.start(filename, { preserveStartedAt: true });
            task = await createDownloadTask('install');
            attemptSignal.throwIfAborted();
            const job = task.directory;
            const { files } = await json(`/api/install/plan?${q}`, attemptSignal);
            const encoder = new TextEncoder();
            const entries = Object.entries(files).map(([name, text]) => [name, encoder.encode(text)]);
            let total = 0;
            const hashes = new Map();
            const assets = [['docker', `docker-${docker.value}.tgz`], ['compose', 'docker-compose']];
            progress.update({ phase: 'download', completed: 0 });
            // Open both requests to obtain the combined size before reporting progress.
            requests.push(...assets.map(async ([kind, name], index) => {
              const response = await fetch(`/api/install/asset?${q}&kind=${kind}`, { signal: attemptSignal });
              responses[index] = response;
              if (!response.ok) throw new Error(`${text.failed}: ${name} (${response.status})`);
            }));
            await Promise.all(requests);
            const sizes = responses.map(response => Number(response.headers.get('content-length')));
            const expected = sizes.every(size => size > 0) ? sizes.reduce((sum, size) => sum + size, 0) : 0;
            for (const [index, [, name]] of assets.entries()) {
              attemptSignal.throwIfAborted();
              progress.update({ phase: 'download', name, completed: total, total: expected });
              const r = responses[index];
              const fileHandle = await job.getFileHandle(name, { create: true });
              const hash = new Sha256();
              await writeOpfsStream(fileHandle, r.body, {
                signal: attemptSignal,
                onChunk(value) {
                  total += value.byteLength; hash.update(value);
                  progress.update({ phase: 'download', name, completed: total, total: expected });
                }
              });

              hashes.set(name, hash.hex());
              entries.push([name, await fileHandle.getFile()]);
            }
            progress.update({ phase: 'export', name: filename });
            let sums = '';
            for (const [name, data] of entries) {
              const hash = hashes.get(name) || new Sha256().update(data).hex();
              sums += `${hash}  ${name}\n`;
            }
            entries.push(['SHA256SUMS', encoder.encode(sums)]);
            {
              const archiveHandle = await job.getFileHandle(filename, { create: true });
              await writeOpfsFile(archiveHandle, writable => writeArchive(writable, entries.map(([name, data]) => [`${filename.slice(0, -4)}/${name}`, data]), { signal: attemptSignal }), { signal: attemptSignal });
              const archive = await archiveHandle.getFile();
              attemptSignal.throwIfAborted();
              progress.update({ phase: 'handoff' });
              task.save(archive, filename);
              progress.complete({ filename, size: archive.size });
            }
          } finally {
            attemptController.abort();
            await Promise.allSettled(requests);
            await Promise.all(responses.map(response => response.body?.cancel().catch(() => {})));
            await task?.finish().catch(() => {});
            signal.removeEventListener('abort', abortAttempt);
          }
        }, { signal, onRetry: (error, retry) => progress.retry(error, retry) });
      } catch (error) {
        progress.fail(error, signal.aborted);
      } finally {
        controller.abort();
        controller = null; busy = false;
        arch.disabled = docker.disabled = false; ready();
      }
    });
    void clearDownloadCaches().catch(() => {});
    ready(); renderArch(); setStatus('chooseArch');
    return { setLanguage(message) {
      text = translations[message === en ? 'en' : 'zh-CN'];
      panel.querySelectorAll('[data-install-text]').forEach(node => { node.innerHTML = text[node.dataset.installText]; });
      progress.setLanguage(message === en ? 'en' : 'zh-CN');
      renderArch();
      if (!selectedArch) { docker.replaceChildren(new Option(text.chooseVersion, '')); }
      renderCommand(); renderPackage(); ready();
      if (state !== 'transfer' && text[state]) progress.info(text[state]);
    } };
  }
};
