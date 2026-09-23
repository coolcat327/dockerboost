import { gsap } from 'gsap';
import { runExport } from './export-client.js';
import { createTransferRate, formatDuration, formatTransferSpeed } from './download-speed.js';
import { pastedImage } from './image-input.js';
import { archiveFilename, imageReference, sourceExamples } from './image-reference.js';

(() => {
  const origin = window.location.origin;
  const browserExportWorker = document.querySelector('meta[name="browser-export-worker"]')?.content;
  const iconUrl = document.querySelector('link[rel="icon"]')?.href;
  const sessionId = crypto.randomUUID();
  const mirrorHost = window.location.host;
  const tabs = [...document.querySelectorAll('.tool-tab')];
  const panels = [...document.querySelectorAll('.tool-panel')];
  const pullForm = document.querySelector('#image-form');
  const pullImage = document.querySelector('#image');
  const pullSource = document.querySelector('#pull-source');
  const pullArchitecture = document.querySelector('#pull-architecture');
  const downloadImage = document.querySelector('#download-image');
  const downloadSource = document.querySelector('#download-source');
  const lookupArchitecture = document.querySelector('#lookup-architecture');
  const lookupButton = document.querySelector('#lookup-button');
  const lookupResult = document.querySelector('#lookup-result');
  const lookupStatus = document.querySelector('#lookup-status');
  const progressRow = document.createElement('div');
  progressRow.className = 'download-progress-row';
  lookupStatus.before(progressRow);
  progressRow.append(lookupStatus);
  const speedStatus = document.createElement('div');
  speedStatus.className = 'download-speed-status';
  speedStatus.hidden = true;
  progressRow.append(speedStatus);
  const progressTrack = document.createElement('div');
  progressTrack.className = 'download-progress';
  progressTrack.hidden = true;
  progressTrack.setAttribute('role', 'progressbar');
  progressTrack.setAttribute('aria-label', '镜像下载进度');
  progressTrack.setAttribute('aria-valuemin', '0');
  progressTrack.setAttribute('aria-valuemax', '100');
  const progressFill = document.createElement('span');
  progressFill.className = 'download-progress-fill';
  const progressIcon = document.createElement('img');
  progressIcon.classList.add('download-progress-icon');
  progressIcon.setAttribute('aria-hidden', 'true');
  progressTrack.append(progressFill, progressIcon);
  progressRow.append(progressTrack);
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
  const setupCommand = document.querySelector('#setup-command');
  const restoreCommand = document.querySelector('#restore-command');
  const manualMirror = document.querySelector('#manual-mirror');
  const pullCommand = document.querySelector('#pull-all-command');
  const loadCommand = document.querySelector('#load-command');
  const toast = document.querySelector('#toast');
  const languageButtons = [...document.querySelectorAll('.language')];
  const browserDownload = document.createElement('a');
  browserDownload.id = 'browser-download';
  browserDownload.className = `${lookupButton.className} browser-download`;
  browserDownload.download = '';
  browserDownload.setAttribute('aria-disabled', 'true');
  lookupButton.replaceWith(browserDownload);
  let browserExporting = false;
  browserDownload.addEventListener('click', async (event) => {
    event.preventDefault();
    if (browserExporting || browserDownload.getAttribute('aria-disabled') === 'true') return;
    browserExporting = true;
    browserDownload.setAttribute('aria-disabled', 'true');
    browserDownload.textContent = '正在下载…';
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
      const image = normalise(downloadImage.value, requestedSource() === 'auto' ? resolvedSource : requestedSource());
      const result = await runExport(worker, { repository: image.repository, reference: image.reference, repoTag: image.original, source: resolvedSource, platform: lookupArchitecture.value, filename: archiveFilename(image.original, lookupArchitecture.value), sessionId }, (progress) => {
        if (progress.phase === 'download') {
          const now = performance.now();
          if (progress.completed < progress.total && now - lastDownloadUpdateAt < 100) return;
          lastDownloadUpdateAt = now;
        }
        if (progress.phase === 'download' && progress.total) showProgress(progress.completed / progress.total * 90);
        if (progress.phase === 'export') { showProgress(95); setLiveText(speedStatus, '正在打包…'); }
        if (progress.phase === 'done') showProgress(100, false);
        lookupResult.classList.remove('hidden');
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
      speedStatus.textContent = `均速 ${formatTransferSpeed(result.archive.size * 1000 / elapsedMs)} · 耗时 ${formatDuration(elapsedMs)}`;
      speedStatus.classList.add('is-summary');
      showProgress(100, false);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { lookupResult.classList.remove('hidden'); lookupStatus.style.fontSize = ''; lookupStatus.textContent = error.message || '浏览器下载失败，请使用终端命令。'; speedStatus.hidden = true; flash(lookupStatus.textContent); } finally {
      worker?.terminate(); browserExporting = false; browserDownload.textContent = locale().download.browser;
      progressTrack.classList.remove('is-running');
      if (lookupArchitecture.value) browserDownload.removeAttribute('aria-disabled');
    }
  });

  const copyLabel = (text) => `<b>⧉</b> ${text}`;
  const translations = {
    'zh-CN': {
      heroTitle: '镜像拉取，更快一点', loadingPlatforms: '正在读取镜像架构…', noPlatforms: '未找到可用架构', waitingPlatforms: '待获取',
      tabs: ['配置', '拉取', '下载'],
      setup: { kicker: 'DAEMON CONFIGURATION', title: '让每次 <code>docker pull</code> 都走加速入口', description: '仅在现有 <code>daemon.json</code> 上合并配置；写入前会自动备份，如需撤销可使用右侧命令。', applyMeta: '备份并写入配置', restoreMeta: '恢复备份', fallback: '若上述命令未成功，或默认配置文件不存在：不会创建任何文件。请在 Docker daemon 实际使用的配置文件中手动合并下方的 <code>registry-mirrors</code> 字段。', copy: '复制全部' },
      pull: { kicker: 'PULL COMMAND BUILDER', title: '输入一个镜像，生成完整拉取命令', description: '自动选择最快可用镜像源，也可手动指定。镜像名不包含镜像源域名。', label: '镜像名', labelDetail: '（可粘贴 docker pull 命令解析）', source: '镜像源', automatic: '自动（最快可用）', architecture: '目标架构', action: '生成命令', meta: '拉取 + 标签', copy: '复制全部' },
      download: { kicker: 'PUBLIC IMAGE DOWNLOAD', title: '下载镜像', description: '选择镜像源和目标 CPU 架构后，可直接在浏览器下载，或复制下方命令到终端', label: '镜像名', labelDetail: '（可粘贴 docker pull 命令解析）', source: '镜像源', automatic: '自动（最快可用）', architecture: '目标架构', action: '浏览器下载', browser: '浏览器下载', meta: '终端下载', copy: '复制全部', note: '仅支持公开镜像' }
    },
    en: {
      heroTitle: 'Pull images. Move faster.', loadingPlatforms: 'Loading image architectures…', noPlatforms: 'No architecture available', waitingPlatforms: 'Awaiting lookup',
      tabs: ['Setup', 'Pull', 'Download'],
      setup: { kicker: 'DAEMON CONFIGURATION', title: 'Route every <code>docker pull</code> through your mirror.', description: 'Only an existing <code>daemon.json</code> is updated; it is backed up first and can be restored with the command on the right.', applyMeta: 'Back up and write', restoreMeta: 'Restore backup', fallback: 'If the command does not succeed, or the default configuration file is missing, no file is created. Manually merge the <code>registry-mirrors</code> field below into the configuration file your Docker daemon actually uses.', copy: 'Copy all' },
      pull: { kicker: 'PULL COMMAND BUILDER', title: 'Enter an image and generate the complete command.', description: 'Automatically select the fastest available source, or choose one manually. Do not include the source hostname in the image name.', label: 'Image name', labelDetail: ' (a docker pull command is accepted)', source: 'Image source', automatic: 'Auto (fastest available)', architecture: 'Target architecture', action: 'Generate command', meta: 'Pull + tag', copy: 'Copy all' },
      download: { kicker: 'PUBLIC IMAGE DOWNLOAD', title: 'Download an image.', description: 'Choose an image source and CPU architecture, then download it in the browser or copy the command below to your terminal.', label: 'Image name', labelDetail: ' (a docker pull command is accepted)', source: 'Image source', automatic: 'Auto (fastest available)', architecture: 'Target architecture', action: 'Download in browser', browser: 'Download in browser', meta: 'Terminal download', copy: 'Copy all', note: 'Only public images are supported.' }
    }
  };

  const setText = (selector, value, html = false) => { const node = document.querySelector(selector); if (node) node[html ? 'innerHTML' : 'textContent'] = value; };
  const applyLanguage = (language) => {
    const locale = translations[language];
    document.documentElement.lang = language;
    setText('[data-i18n="heroTitle"]', locale.heroTitle);
    ['setup', 'pull', 'download'].forEach((name, index) => {
      const panel = `[data-panel="${name}"]`;
      const tab = document.querySelector(`.tool-tab[data-tab="${name}"]`);
      if (tab) tab.lastChild.textContent = locale.tabs[index];
      setText(`${panel} .panel-kicker`, locale[name].kicker);
      setText(`${panel} .panel-copy h3`, locale[name].title, true);
      setText(`${panel} .panel-copy p`, locale[name].description, true);
      if (locale[name].meta) setText(`${panel} .command-meta span`, locale[name].meta);
      document.querySelectorAll(`${panel} .copy-all`).forEach((button) => { button.innerHTML = copyLabel(locale[name].copy); });
      if (locale[name].label) setText(`${panel} .image-fields label`, `<span>${locale[name].label}</span><span class="image-label-detail">${locale[name].labelDetail || ''}</span>`, true);
      if (locale[name].source) setText(`${panel} .source-fields label`, locale[name].source);
      if (locale[name].architecture) setText(`${panel} .architecture-fields label`, locale[name].architecture);
      if (locale[name].action) setText(`${panel} .generate-button`, locale[name].action);
      if (locale[name].note) setText(`${panel} .command-note`, locale[name].note, true);
    });
    browserDownload.textContent = locale.download.browser;
    setText('[data-setup-meta="apply"]', locale.setup.applyMeta);
    setText('[data-setup-meta="restore"]', locale.setup.restoreMeta);
    setText('[data-setup-fallback]', locale.setup.fallback, true);
    languageButtons.forEach((button) => button.classList.toggle('active', button.dataset.language === language));
    if (configuredSources.length) setSources(configuredSources);
    localStorage.setItem('dockerboost-language', language);
  };

  const flash = (message) => { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1800); };
  let platformRequestToken = 0;
  let platformRequestController;
  let resolvedSource = 'mirror-gcr';
  let configuredSources = [];
  const locale = () => translations[document.documentElement.lang] || translations['zh-CN'];
  const requestedSource = () => pullSource.value;
  const normalise = (value, source = requestedSource()) => imageReference(value, { source, acceleratedSource: resolvedSource, mirrorHost, sources: configuredSources });
  const updateSourceGuidance = () => {
    const placeholder = sourceExamples[pullSource.value] || '例如 namespace/image:tag';
    pullImage.placeholder = placeholder;
    downloadImage.placeholder = placeholder;
  };
  const setSources = (sources) => {
    configuredSources = sources;
    const automatic = locale().pull.automatic;
    for (const select of [pullSource, downloadSource]) {
      const previous = select.value;
      select.replaceChildren(new Option(automatic, 'auto'), ...sources.map((source) => new Option(source.label, source.id)));
      select.value = [...select.options].some((option) => option.value === previous) ? previous : 'auto';
    }
    updateSourceGuidance();
  };
  const replaceOptions = (select, platforms, placeholder) => {
    const previous = select.value;
    select.replaceChildren(...platforms.map((platform) => new Option(platform, platform)));
    select.disabled = !platforms.length;
    if (!platforms.length) { select.replaceChildren(new Option(placeholder, '')); return; }
    select.value = platforms.includes(previous) ? previous : (platforms.includes('linux/amd64') ? 'linux/amd64' : platforms[0]);
  };
  const platformsFromManifest = (manifest) => {
    const descriptors = Array.isArray(manifest?.manifests) ? manifest.manifests : [];
    return [...new Set(descriptors
      .map((descriptor) => descriptor?.platform)
      .filter((platform) => platform?.os && platform?.architecture && platform.os !== 'unknown' && platform.architecture !== 'unknown')
      .map((platform) => [platform.os, platform.architecture, platform.variant].filter(Boolean).join('/'))
    )].sort((left, right) => left.localeCompare(right));
  };
  const resetPlatformOptions = () => {
    [pullArchitecture, lookupArchitecture].forEach((select) => {
      select.disabled = true;
      select.replaceChildren(new Option(locale().waitingPlatforms, ''));
    });
    pullCommand.textContent = locale().waitingPlatforms;
    loadCommand.textContent = locale().waitingPlatforms;
    lookupResult.classList.add('hidden');
    lookupStatus.style.fontSize = '';
    speedStatus.hidden = true;
    progressTrack.hidden = true;
    browserDownload.setAttribute('aria-disabled', 'true');
  };
  const requestPlatforms = async (value) => {
    platformRequestController?.abort();
    const controller = new AbortController();
    platformRequestController = controller;
    const token = ++platformRequestToken;
    lookupStatus.style.fontSize = '';
    speedStatus.hidden = true;
    progressTrack.hidden = true;
    if (!value.trim()) {
      resetPlatformOptions();
      return;
    }
    try {
      const image = normalise(value);
      [pullArchitecture, lookupArchitecture].forEach((select) => {
        select.disabled = true;
        select.replaceChildren(new Option(locale().loadingPlatforms, ''));
      });
      const lookupImage = image.source === 'auto' ? image.original : image.upstream;
      const response = await fetch(`/api/platforms?image=${encodeURIComponent(lookupImage)}&source=${encodeURIComponent(image.source)}`, { signal: controller.signal });
      const manifest = await response.json();
      if (platformRequestToken !== token) return;
      if (!response.ok) throw new Error(manifest.error || '无法读取镜像架构');
      resolvedSource = response.headers.get('x-dockerboost-source') || requestedSource();
      const resolvedImage = normalise(value, resolvedSource);
      let platforms = Array.isArray(manifest.platforms) ? manifest.platforms : platformsFromManifest(manifest);
      if (!platforms.length && !Array.isArray(manifest.manifests) && manifest.config?.digest) {
        const configResponse = await fetch(`/v2/${resolvedImage.repository}/blobs/${manifest.config.digest}?source=${encodeURIComponent(resolvedSource)}`, { signal: controller.signal });
        if (!configResponse.ok) throw new Error(`无法读取镜像配置 (${configResponse.status})`);
        const config = await configResponse.json();
        if (platformRequestToken !== token) return;
        platforms = platformsFromManifest({ manifests: [{ platform: config }] });
      }
      [pullArchitecture, lookupArchitecture].forEach((select) => replaceOptions(select, platforms, locale().noPlatforms));
      buildPull();
      buildDownload();
      lookupStatus.textContent = `${resolvedSource} · ${image.original} · ${lookupArchitecture.value}`;
      lookupResult.classList.remove('hidden');
    } catch (error) {
      if (controller.signal.aborted) return;
      if (platformRequestToken !== token) return;
      [pullArchitecture, lookupArchitecture].forEach((select) => {
        select.disabled = true;
        select.replaceChildren(new Option(locale().noPlatforms, ''));
      });
      pullCommand.textContent = locale().waitingPlatforms;
      loadCommand.textContent = locale().waitingPlatforms;
      lookupStatus.textContent = error instanceof Error ? error.message : '无法读取镜像信息';
      lookupResult.classList.remove('hidden');
    } finally {
      if (platformRequestController === controller) platformRequestController = undefined;
    }
  };
  const buildPull = () => {
    if (!pullImage.value.trim()) { pullCommand.textContent = locale().waitingPlatforms; return; }
    const image = normalise(pullImage.value, requestedSource() === 'auto' ? resolvedSource : requestedSource());
    if (!pullArchitecture.value) { pullCommand.textContent = '正在读取镜像可用架构…'; return; }
    pullCommand.textContent = `docker pull --platform ${pullArchitecture.value} ${image.accelerated} &&\ndocker tag ${image.accelerated} ${image.original} &&\ndocker image rm ${image.accelerated}`;
  };
  const buildDownload = () => {
    if (!downloadImage.value.trim()) { loadCommand.textContent = locale().waitingPlatforms; return; }
    const image = normalise(downloadImage.value, requestedSource() === 'auto' ? resolvedSource : requestedSource());
    if (!lookupArchitecture.value) { loadCommand.textContent = '正在读取镜像可用架构…'; return; }
    browserDownload.removeAttribute('aria-disabled');
    const scriptUrl = `${origin}/api/download-script?image=${encodeURIComponent(image.upstream)}&platform=${encodeURIComponent(lookupArchitecture.value)}&source=${encodeURIComponent(resolvedSource)}`;
    loadCommand.textContent = `curl -fsSL -o .download-image.sh "${scriptUrl}" && sh .download-image.sh`;
  };
  const selectTab = (name) => {
    tabs.forEach((tab) => { const active = tab.dataset.tab === name; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
    const active = document.querySelector(`.tool-panel[data-panel="${name}"]`);
    gsap.fromTo(active, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .35, ease: 'power3.out', clearProps: 'visibility' });
  };

  setupCommand.textContent = `command -v jq >/dev/null || { echo "jq is required"; exit 1; }\n[ -f /etc/docker/daemon.json ] || { echo "daemon.json not found; no changes made"; exit 1; }\ntmp_file=$(mktemp) || exit 1\ncp /etc/docker/daemon.json /etc/docker/daemon.json.bak || { rm -f "$tmp_file"; exit 1; }\njq --arg mirror "${origin}" '."registry-mirrors" = ((."registry-mirrors" // []) + [$mirror] | unique)' /etc/docker/daemon.json > "$tmp_file" || { rm -f "$tmp_file"; exit 1; }\nmv "$tmp_file" /etc/docker/daemon.json &&\nsystemctl restart docker`;
  restoreCommand.textContent = `if [ -f /etc/docker/daemon.json.bak ]; then\n  cp /etc/docker/daemon.json.bak /etc/docker/daemon.json &&\n  systemctl restart docker\nelse\n  echo "No backup found"\nfi`;
  manualMirror.textContent = `{\n  "registry-mirrors": ["${origin}"]\n}`;
  const detectedLanguage = localStorage.getItem('dockerboost-language') || localStorage.getItem('dockwave-language') || (navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
  applyLanguage(detectedLanguage);
  resetPlatformOptions();
  fetch('/api/sources').then(async (response) => {
    if (!response.ok) throw new Error('无法读取镜像源');
    const { sources } = await response.json();
    setSources(sources);
  }).catch(() => flash('镜像源列表加载失败，暂使用默认镜像源。'));
  languageButtons.forEach((button) => button.addEventListener('click', () => applyLanguage(button.dataset.language)));
  tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
  pullForm.addEventListener('submit', (event) => { event.preventDefault(); try { buildPull(); flash('命令已更新'); } catch (error) { flash(error.message); } });
  pullArchitecture.addEventListener('change', () => { try { buildPull(); } catch { /* wait for a valid name */ } });
  for (const [source, counterpart] of [[pullSource, downloadSource], [downloadSource, pullSource]]) {
    source.addEventListener('change', () => {
      counterpart.value = source.value;
      resolvedSource = source.value === 'auto' ? 'mirror-gcr' : source.value;
      updateSourceGuidance();
      if (pullImage.value.trim()) requestPlatforms(pullImage.value);
    });
  }
  let platformTimer;
  const syncImageInputs = (source, target) => {
    target.value = source.value;
    clearTimeout(platformTimer);
    platformTimer = setTimeout(() => requestPlatforms(source.value), 500);
  };
  pullImage.addEventListener('input', () => syncImageInputs(pullImage, downloadImage));
  downloadImage.addEventListener('input', () => syncImageInputs(downloadImage, pullImage));
  for (const [input, target] of [[pullImage, downloadImage], [downloadImage, pullImage]]) {
    input.addEventListener('paste', (event) => {
      try {
        const image = pastedImage(event.clipboardData?.getData('text') || '');
        if (image === null) return;
        event.preventDefault();
        input.value = image;
        syncImageInputs(input, target);
      } catch (error) { event.preventDefault(); flash(error.message); }
    });
  }
  lookupArchitecture.addEventListener('change', () => {
    try {
      buildDownload();
      lookupStatus.style.fontSize = '';
      speedStatus.hidden = true;
      progressTrack.hidden = true;
      lookupStatus.textContent = `${resolvedSource} · ${normalise(downloadImage.value, requestedSource() === 'auto' ? resolvedSource : requestedSource()).original} · ${lookupArchitecture.value}`;
      lookupResult.classList.remove('hidden');
    } catch { /* wait for a valid name */ }
  });
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('.copy-all'); if (!button) return;
    const target = document.getElementById(button.dataset.copy);
    try { await navigator.clipboard.writeText(target.innerText); flash('完整命令已复制'); } catch { flash('复制失败，请手动选择命令'); }
  });

  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.nav', { y: -16, autoAlpha: 0, duration: .45 }).from('.hero .reveal', { y: 26, autoAlpha: 0, duration: .7, stagger: .1 }, '-=.1');
    gsap.to('.docker-logo-large', { y: -10, duration: 3.5, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.from('.workspace', { autoAlpha: 0, y: 25, duration: .7, delay: .45 });
  });
})();
