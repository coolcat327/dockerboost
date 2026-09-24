import { gsap } from 'gsap';
import { features } from './features/index.js';
import { initHeroIntro } from './hero-intro.js';
import { createLanguage } from './common/language.js';
import { createSelectionStore } from './common/selection-store.js';
import { restoreSharedState } from './common/share-link.js';

const toast = document.querySelector('#toast');
const flash = (message) => {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
};
const language = createLanguage();
const sharedState = restoreSharedState(window.location.hash);
const selectionGroups = new Map();
const registrations = features.map((feature) => {
  const tab = document.querySelector(`.tool-tab[data-tab="${feature.id}"]`);
  const panel = document.querySelector(`.tool-panel[data-panel="${feature.id}"]`);
  if (!tab || !panel) throw new Error(`缺少 ${feature.id} 标签或面板`);
  if (feature.selectionGroup && !selectionGroups.has(feature.selectionGroup)) {
    const store = createSelectionStore();
    if (feature.selectionGroup === 'image' && sharedState) store.update(sharedState);
    selectionGroups.set(feature.selectionGroup, store);
  }
  const selectionStore = selectionGroups.get(feature.selectionGroup);
  const instance = feature.init({ panel, locale: language.locale, messages: () => language.messages(feature), flash, selectionStore });
  return { feature, tab, panel, instance };
});
language.bind(registrations);

const selectTab = (id) => {
  registrations.forEach(({ feature, tab, panel }) => {
    const active = feature.id === id;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    panel.classList.toggle('active', active);
  });
  const active = registrations.find(({ feature }) => feature.id === id)?.panel;
  if (active) gsap.fromTo(active, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .35, ease: 'power3.out', clearProps: 'visibility' });
};
registrations.forEach(({ feature, tab }) => tab.addEventListener('click', () => selectTab(feature.id)));
if (sharedState) selectTab(sharedState.tab);
document.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-all');
  if (!button) return;
  const target = document.getElementById(button.dataset.copy);
  try { await navigator.clipboard.writeText(target.innerText); flash('完整命令已复制'); }
  catch { flash('复制失败，请手动选择命令'); }
});

initHeroIntro({ allowHash: Boolean(sharedState) });
if (sharedState) window.history.replaceState(window.history.state, '', '/');
