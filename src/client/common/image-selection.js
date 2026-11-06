import { parsePastedPull } from './image-input.js';
import { imageReference } from './image-reference.js';
import { matchBatchPlatform } from './batch-platform.js';

function platformsFromManifest(manifest) {
  const descriptors = Array.isArray(manifest?.manifests) ? manifest.manifests : [];
  return [...new Set(descriptors
    .map((descriptor) => descriptor?.platform)
    .filter((platform) => platform?.os && platform?.architecture && platform.os !== 'unknown' && platform.architecture !== 'unknown')
    .map((platform) => [platform.os, platform.architecture, platform.variant].filter(Boolean).join('/'))
  )].sort((left, right) => left.localeCompare(right));
}

const INPUT_IDLE_MS = 1000;

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
  let composing = false;
  let disposed = false;
  let unsubscribe;
  let architectureState = 'waiting';
  let localPlatform = '';
  let localIntent = '';
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
    if (architectureState === 'error') architecture.options[0].textContent = locale().failedPlatforms;
    if (architectureState === 'unsupported') architecture.options[0].textContent = locale().unsupportedPlatforms;
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
    const snapshot = store?.snapshot();
    const preferred = snapshot ? snapshot.platform : localPlatform;
    const intent = snapshot ? snapshot.platformIntent : localIntent;
    const intended = intent && matchBatchPlatform(platforms, intent);
    const matched = preferred && matchBatchPlatform(platforms, preferred);
    if (intent && !intended) {
      architectureState = 'unsupported';
      const placeholder = new Option(locale().unsupportedPlatforms, '');
      placeholder.disabled = true;
      architecture.replaceChildren(placeholder, ...platforms.map(platform => new Option(platform, platform)));
      architecture.value = '';
      return;
    }
    architecture.value = intended || matched || (platforms.includes(preferred) ? preferred
      : platforms.includes(previous) ? previous
        : platforms.includes('linux/amd64') ? 'linux/amd64' : platforms[0]);
    localPlatform = architecture.value;
    store?.update({ platform: architecture.value }, storeOrigin);
  };
  const inspect = async ({ refresh = false } = {}) => {
    if (disposed || composing) return;
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
      const url = `/api/platforms?image=${encodeURIComponent(lookupImage)}&source=${encodeURIComponent(parsed.source)}`;
      const result = store ? await store.lookupPlatforms(url, { refresh }) : await fetch(url, { signal: controller.signal }).then(async (response) => ({
        ok: response.ok,
        manifest: await response.json(),
        source: response.headers.get('x-dockerboost-source')
      }));
      if (requestToken !== token) return;
      const { manifest } = result;
      if (!result.ok) throw new Error(manifest.error || '无法读取镜像架构');
      resolvedSource = result.source || requestedSource();
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
      architectureState = 'error';
      architecture.disabled = true;
      architecture.replaceChildren(new Option(locale().failedPlatforms, ''));
      onError?.(error);
    } finally {
      if (requestController === controller) requestController = undefined;
    }
  };
  const loadSources = (refresh = false) => {
    const sourcesRequest = store ? store.lookupSources() : fetch('/api/sources').then(async (response) => {
      if (!response.ok) throw new Error('无法读取镜像源');
      return response.json();
    });
    return sourcesRequest.then(({ sources }) => {
      if (disposed) return;
      setSources(sources);
      if (image.value.trim()) void inspect({ refresh });
    }).catch(() => { if (!disposed) flash('镜像源列表加载失败，暂使用默认镜像源。'); });
  };
  const init = () => {
    reset();
    if (store) {
      let initial = store.snapshot();
      try {
        const pasted = parsePastedPull(initial.image);
        if (pasted !== null) { const platform = initial.platform || pasted.platform || ''; store.update({ image: pasted.image, platform, platformIntent: initial.platformIntent || platform }, storeOrigin); initial = store.snapshot(); }
      } catch { /* Invalid shared input remains visible for correction. */ }
      image.value = initial.image;
      unsubscribe = store.subscribe((snapshot, origin) => {
        if (origin === storeOrigin) return;
        const imageChanged = image.value !== snapshot.image;
        const sourceChanged = source.value !== snapshot.source;
        if (!imageChanged && !sourceChanged) {
          if (['ready', 'unsupported'].includes(architectureState) && snapshot.platformIntent) {
            const platforms = [...architecture.options].map(option => option.value).filter(Boolean);
            const selected = matchBatchPlatform(platforms, snapshot.platformIntent);
            if (!selected) {
              if (architectureState !== 'unsupported') { setPlatforms(platforms); notifyPlatformChange(); }
              return;
            }
            if (architecture.value !== selected) {
              architecture.value = selected;
              architectureState = 'ready';
              notifyPlatformChange();
            }
            return;
          }
          if (architectureState === 'unsupported' && !snapshot.platformIntent) {
            setPlatforms([...architecture.options].map(option => option.value).filter(Boolean));
            notifyPlatformChange();
            return;
          }
          if (['ready', 'unsupported'].includes(architectureState) && [...architecture.options].some((item) => item.value === snapshot.platform)
            && architecture.value !== snapshot.platform) {
            architecture.value = snapshot.platform;
            architectureState = 'ready';
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
        if (image.value.trim() && sourceAvailable) inputTimer = setTimeout(inspect, INPUT_IDLE_MS);
      });
    }
    void loadSources();
    source.addEventListener('change', () => {
      clearTimeout(inputTimer);
      resolvedSource = source.value === 'auto' ? 'mirror-gcr' : source.value;
      updatePlaceholder();
      store?.update({ source: source.value }, storeOrigin);
      invalidate();
      inspect();
    });
    const updateImage = () => {
      clearTimeout(inputTimer);
      invalidate();
      if (composing) return;
      localIntent = '';
      store?.update({ image: image.value, platformIntent: '' }, storeOrigin);
      inputTimer = setTimeout(inspect, INPUT_IDLE_MS);
    };
    image.addEventListener('compositionstart', () => { composing = true; clearTimeout(inputTimer); invalidate(); });
    image.addEventListener('compositionend', () => { composing = false; updateImage(); });
    image.addEventListener('input', updateImage);
    image.addEventListener('paste', (event) => {
      try {
        const pasted = parsePastedPull(event.clipboardData?.getData('text') || '');
        if (pasted === null) return;
        event.preventDefault();
        image.value = pasted.image;
        localIntent = pasted.platform || '';
        if (pasted.platform) localPlatform = pasted.platform;
        clearTimeout(inputTimer);
        store?.update({ image: image.value, platformIntent: localIntent, ...(pasted.platform ? { platform: pasted.platform } : {}) }, storeOrigin);
        invalidate();
        inputTimer = setTimeout(inspect, INPUT_IDLE_MS);
      } catch (error) { event.preventDefault(); flash(error.message); }
    });
    architecture.addEventListener('change', () => {
      architectureState = 'ready';
      localPlatform = architecture.value;
      localIntent = '';
      store?.update({ platform: architecture.value, platformIntent: '' }, storeOrigin);
      notifyPlatformChange();
    });
  };
  return {
    init,
    reloadSources: () => loadSources(true),
    recheck: () => inspect({ refresh: true }),
    dispose: () => { disposed = true; unsubscribe?.(); clearTimeout(inputTimer); requestController?.abort(); requestToken++; },
    setLanguage,
    current: () => ({ image: image.value, source: requestedSource(), platform: architecture.value, platformUnsupported: architectureState === 'unsupported', resolvedSource }),
    resolve: () => normalise(image.value, effectiveSource()),
    onPlatformChange: (listener) => platformListeners.add(listener)
  };
}
