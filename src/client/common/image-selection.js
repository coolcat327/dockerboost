import { pastedImage } from './image-input.js';
import { imageReference } from './image-reference.js';

function platformsFromManifest(manifest) {
  const descriptors = Array.isArray(manifest?.manifests) ? manifest.manifests : [];
  return [...new Set(descriptors
    .map((descriptor) => descriptor?.platform)
    .filter((platform) => platform?.os && platform?.architecture && platform.os !== 'unknown' && platform.architecture !== 'unknown')
    .map((platform) => [platform.os, platform.architecture, platform.variant].filter(Boolean).join('/'))
  )].sort((left, right) => left.localeCompare(right));
}

// A panel owns its requests and available platforms. An optional store syncs user choices.
export function createImageSelection({ panel, locale, messages, flash, store, onLoading, onReady, onError, onReset }) {
  const image = panel.querySelector('.image-fields input');
  const source = panel.querySelector('.source-fields select');
  const architecture = panel.querySelector('.architecture-fields select');
  let configuredSources = [];
  let resolvedSource = 'mirror-gcr';
  let requestController;
  let requestToken = 0;
  let inputTimer;
  let architectureState = 'waiting';
  const storeOrigin = Symbol('image-selection');
  const platformListeners = new Set();
  const notifyPlatformChange = () => platformListeners.forEach((listener) => listener());

  const requestedSource = () => source.value;
  const effectiveSource = () => requestedSource() === 'auto' ? resolvedSource : requestedSource();
  const normalise = (value = image.value, selectedSource = requestedSource()) => imageReference(value, {
    source: selectedSource,
    acceleratedSource: resolvedSource,
    mirrorHost: window.location.host,
    sources: configuredSources
  });
  const updatePlaceholder = () => {
    const selected = configuredSources.find((item) => item.id === source.value);
    image.placeholder = `例如 ${selected?.example || (source.value === 'auto' ? 'nginx:latest' : 'namespace/image:tag')}`;
  };
  const setSources = (sources) => {
    configuredSources = sources;
    const previous = store?.snapshot().source ?? source.value;
    source.replaceChildren(new Option(messages().automatic, 'auto'), ...sources.map((item) => new Option(item.label, item.id)));
    source.value = [...source.options].some((item) => item.value === previous) ? previous : 'auto';
    updatePlaceholder();
  };
  const setLanguage = () => {
    if (configuredSources.length) setSources(configuredSources);
    if (architectureState === 'waiting') architecture.options[0].textContent = locale().waitingPlatforms;
    if (architectureState === 'loading') architecture.options[0].textContent = locale().loadingPlatforms;
    if (architectureState === 'none') architecture.options[0].textContent = locale().noPlatforms;
  };
  const reset = () => {
    architectureState = 'waiting';
    architecture.disabled = true;
    architecture.replaceChildren(new Option(locale().waitingPlatforms, ''));
    onReset?.();
  };
  const invalidate = () => {
    requestController?.abort();
    requestToken++;
    reset();
  };
  const setPlatforms = (platforms) => {
    architectureState = platforms.length ? 'ready' : 'none';
    const previous = architecture.value;
    architecture.replaceChildren(...platforms.map((platform) => new Option(platform, platform)));
    architecture.disabled = !platforms.length;
    if (!platforms.length) {
      architecture.replaceChildren(new Option(locale().noPlatforms, ''));
      return;
    }
    const preferred = store?.snapshot().platform;
    architecture.value = platforms.includes(preferred) ? preferred
      : platforms.includes(previous) ? previous
        : platforms.includes('linux/amd64') ? 'linux/amd64' : platforms[0];
    store?.update({ platform: architecture.value }, storeOrigin);
  };
  const inspect = async () => {
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const token = ++requestToken;
    onLoading?.();
    if (!image.value.trim()) { reset(); return; }
    try {
      const parsed = normalise();
      architectureState = 'loading';
      architecture.disabled = true;
      architecture.replaceChildren(new Option(locale().loadingPlatforms, ''));
      const lookupImage = parsed.source === 'auto' ? parsed.original : parsed.upstream;
      const response = await fetch(`/api/platforms?image=${encodeURIComponent(lookupImage)}&source=${encodeURIComponent(parsed.source)}`, { signal: controller.signal });
      const manifest = await response.json();
      if (requestToken !== token) return;
      if (!response.ok) throw new Error(manifest.error || '无法读取镜像架构');
      resolvedSource = response.headers.get('x-dockerboost-source') || requestedSource();
      const resolvedImage = normalise(image.value, resolvedSource);
      let platforms = Array.isArray(manifest.platforms) ? manifest.platforms : platformsFromManifest(manifest);
      if (!platforms.length && !Array.isArray(manifest.manifests) && manifest.config?.digest) {
        const configResponse = await fetch(`/v2/${resolvedImage.repository}/blobs/${manifest.config.digest}?source=${encodeURIComponent(resolvedSource)}`, { signal: controller.signal });
        if (!configResponse.ok) throw new Error(`无法读取镜像配置 (${configResponse.status})`);
        const config = await configResponse.json();
        if (requestToken !== token) return;
        platforms = platformsFromManifest({ manifests: [{ platform: config }] });
      }
      setPlatforms(platforms);
      onReady?.(parsed);
    } catch (error) {
      if (controller.signal.aborted || requestToken !== token) return;
      architectureState = 'none';
      architecture.disabled = true;
      architecture.replaceChildren(new Option(locale().noPlatforms, ''));
      onError?.(error);
    } finally {
      if (requestController === controller) requestController = undefined;
    }
  };
  const init = () => {
    reset();
    if (store) {
      const initial = store.snapshot();
      image.value = initial.image;
      store.subscribe((snapshot, origin) => {
        if (origin === storeOrigin) return;
        const imageChanged = image.value !== snapshot.image;
        const sourceChanged = source.value !== snapshot.source;
        if (!imageChanged && !sourceChanged) {
          if (architectureState === 'ready' && [...architecture.options].some((item) => item.value === snapshot.platform)
            && architecture.value !== snapshot.platform) {
            architecture.value = snapshot.platform;
            notifyPlatformChange();
          }
          return;
        }
        image.value = snapshot.image;
        const sourceAvailable = [...source.options].some((item) => item.value === snapshot.source);
        if (sourceAvailable) source.value = snapshot.source;
        resolvedSource = snapshot.source === 'auto' ? 'mirror-gcr' : snapshot.source;
        updatePlaceholder();
        clearTimeout(inputTimer);
        invalidate();
        if (image.value.trim() && sourceAvailable) inputTimer = setTimeout(inspect, 500);
      });
    }
    fetch('/api/sources').then(async (response) => {
      if (!response.ok) throw new Error('无法读取镜像源');
      const { sources } = await response.json();
      setSources(sources);
      if (image.value.trim()) inspect();
    }).catch(() => flash('镜像源列表加载失败，暂使用默认镜像源。'));
    source.addEventListener('change', () => {
      clearTimeout(inputTimer);
      resolvedSource = source.value === 'auto' ? 'mirror-gcr' : source.value;
      updatePlaceholder();
      store?.update({ source: source.value }, storeOrigin);
      invalidate();
      inspect();
    });
    image.addEventListener('input', () => {
      clearTimeout(inputTimer);
      store?.update({ image: image.value }, storeOrigin);
      invalidate();
      inputTimer = setTimeout(inspect, 500);
    });
    image.addEventListener('paste', (event) => {
      try {
        const pasted = pastedImage(event.clipboardData?.getData('text') || '');
        if (pasted === null) return;
        event.preventDefault();
        image.value = pasted;
        clearTimeout(inputTimer);
        store?.update({ image: image.value }, storeOrigin);
        invalidate();
        inputTimer = setTimeout(inspect, 500);
      } catch (error) { event.preventDefault(); flash(error.message); }
    });
    architecture.addEventListener('change', () => {
      store?.update({ platform: architecture.value }, storeOrigin);
      notifyPlatformChange();
    });
  };
  return {
    init,
    setLanguage,
    current: () => ({ image: image.value, source: requestedSource(), platform: architecture.value, resolvedSource }),
    resolve: () => normalise(image.value, effectiveSource()),
    onPlatformChange: (listener) => platformListeners.add(listener)
  };
}
