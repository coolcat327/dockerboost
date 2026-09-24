export function restoreSharedState(hash) {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const readable = /^(pull|download)\?(.+)$/.exec(fragment);
  if (!readable) return null;
  const params = new URLSearchParams(readable[2]);
  const state = { tab: readable[1], image: params.get('image'), source: params.get('source'), platform: params.get('platform') };
  if (!state || !['pull', 'download'].includes(state.tab) || typeof state.image !== 'string'
    || !state.image.trim() || state.image.length > 512 || typeof state.source !== 'string'
    || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(state.source) || typeof state.platform !== 'string'
    || state.platform.length > 128 || (state.platform && !/^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/.test(state.platform))) return null;
  return { tab: state.tab, image: state.image, source: state.source, platform: state.platform };
}

async function copyLink(url, messages) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(url); return; } catch { /* use the browser fallback */ }
  }
  const field = document.createElement('textarea');
  field.value = url;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  let copied = false;
  try { copied = document.execCommand('copy'); }
  catch { /* show a selectable link below */ }
  finally { field.remove(); }
  if (copied) return true;
  const manual = window.prompt(messages().shareCopyManually, url);
  if (manual === null) throw new Error(messages().shareCopyFailed);
  return false;
}

export async function shareSelection({ tab, selection, button, messages, flash }) {
  const { image, source, platform } = selection.current();
  if (!image.trim()) { flash(messages().shareNeedsImage); return; }
  button.disabled = true;
  try {
    const params = new URLSearchParams({ tab, image, source, platform });
    const response = await fetch(`/api/share?${params}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || messages().shareFailed);
    const copied = await copyLink(result.url, messages);
    flash(copied ? messages().shareCopied : messages().shareGenerated);
  } catch (error) {
    flash(error.message || messages().shareFailed);
  } finally { button.disabled = false; }
}
