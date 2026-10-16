// Shares user choices. Each tab still resolves its own source and available platforms.
export function createSelectionStore() {
  let state = { image: '', source: 'auto', platform: '' };
  let platformLookup;
  let sourcesLookup;
  const listeners = new Set();
  return {
    snapshot: () => ({ ...state }),
    lookupSources() {
      if (sourcesLookup) return sourcesLookup;
      const promise = fetch('/api/sources').then(async (response) => {
        if (!response.ok) throw new Error('无法读取镜像源');
        return response.json();
      });
      sourcesLookup = promise;
      promise.catch(() => {
        if (sourcesLookup === promise) sourcesLookup = undefined;
      });
      return promise;
    },
    lookupPlatforms(url) {
      if (platformLookup?.url === url) return platformLookup.promise;
      const promise = fetch(url).then(async (response) => ({
        ok: response.ok,
        manifest: await response.json(),
        source: response.headers.get('x-dockerboost-source')
      }));
      platformLookup = { url, promise };
      promise.catch(() => {
        if (platformLookup?.promise === promise) platformLookup = undefined;
      });
      return promise;
    },
    update(patch, origin) {
      const next = { ...state, ...patch };
      if (next.image === state.image && next.source === state.source && next.platform === state.platform) return;
      if (next.image !== state.image || next.source !== state.source) platformLookup = undefined;
      state = next;
      listeners.forEach((listener) => listener({ ...state }, origin));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
