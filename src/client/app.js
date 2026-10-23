import { features } from './features/index.js';
import { initPageMotion } from './page-motion.js';
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

const tabs = document.querySelector('.tool-tabs');
const indicator = document.createElement('span');
indicator.className = 'tab-indicator';
indicator.setAttribute('aria-hidden', 'true');
tabs.append(indicator);
const positionIndicator = () => {
  const tab = registrations.find(({ tab }) => tab.classList.contains('active'))?.tab;
  if (!tab) return;
  indicator.style.setProperty('--tab-x', `${tab.offsetLeft + 12}px`);
  indicator.style.setProperty('--tab-width', `${Math.max(0, tab.offsetWidth - 24)}px`);
  tabs.classList.add('has-indicator');
};
const selectTab = (id) => {
  registrations.forEach(({ feature, tab, panel }) => {
    const active = feature.id === id;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.classList.toggle('active', active);
  });
  positionIndicator();
};
registrations.forEach(({ feature, tab, panel }, index) => {
  tab.id = `tab-${feature.id}`;
  panel.id = `panel-${feature.id}`;
  tab.setAttribute('aria-controls', panel.id);
  panel.setAttribute('aria-labelledby', tab.id);
  tab.addEventListener('click', () => selectTab(feature.id));
  tab.addEventListener('keydown', (event) => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % registrations.length;
    if (event.key === 'ArrowLeft') target = (index - 1 + registrations.length) % registrations.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = registrations.length - 1;
    if (target === undefined) return;
    event.preventDefault();
    selectTab(registrations[target].feature.id);
    registrations[target].tab.focus();
    registrations[target].tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
});
selectTab(sharedState?.tab || registrations[0].feature.id);
if ('ResizeObserver' in window) {
  const observer = new ResizeObserver(positionIndicator);
  registrations.forEach(({ tab }) => observer.observe(tab));
}
window.addEventListener('resize', positionIndicator);
document.fonts?.ready.then(positionIndicator);
const copyTimers = new WeakMap();
document.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-all[data-copy]');
  if (!button) return;
  const target = document.getElementById(button.dataset.copy);
  try {
    await navigator.clipboard.writeText(target.innerText);
    clearTimeout(copyTimers.get(button));
    button.classList.add('is-copied');
    copyTimers.set(button, setTimeout(() => button.classList.remove('is-copied'), 1800));
    flash(document.documentElement.lang === 'en' ? 'Full command copied' : '完整命令已复制');
  }
  catch { flash(document.documentElement.lang === 'en' ? 'Copy failed. Please select the command manually.' : '复制失败，请手动选择命令'); }
});

initHeroIntro();
initPageMotion();
if (sharedState) window.history.replaceState(window.history.state, '', '/');
