// Shares user choices. Each tab still resolves its own source and available platforms.
export function createSelectionStore() {
  let state = { image: '', source: 'auto', platform: '' };
  const listeners = new Set();
  return {
    snapshot: () => ({ ...state }),
    update(patch, origin) {
      const next = { ...state, ...patch };
      if (next.image === state.image && next.source === state.source && next.platform === state.platform) return;
      state = next;
      listeners.forEach((listener) => listener({ ...state }, origin));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
