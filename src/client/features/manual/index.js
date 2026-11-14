import { loadCatalog, searchCommands } from './catalog.js';
import { messages } from './messages.js';

export const feature = {
  id: 'manual', messages,
  init({ panel, messages }) {
    const search = panel.querySelector('#manual-search');
    const list = panel.querySelector('[data-manual-list]'), detail = panel.querySelector('[data-manual-detail]');
    const count = panel.querySelector('[data-manual-count]');
    let commands = [], selected, state = 'idle', searchTimer, composing = false;
    const locale = () => document.documentElement.lang === 'en' ? 'en' : 'zh-CN';
    const node = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
    const renderDetail = item => {
      detail.replaceChildren(); detail.hidden = !item;
      if (!item) return;
      const m = messages();
      const heading = node('h3', item.command); heading.id = 'manual-detail-title';
      detail.setAttribute('aria-labelledby', heading.id);
      detail.append(heading, node('p', item.summary[locale()]));
      const link = node('a', m.official); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
      detail.append(node('h4', m.usage)); const usage = node('pre'); usage.tabIndex = 0; usage.setAttribute('role', 'region'); usage.setAttribute('aria-label', `${item.command} · ${m.usage}`); usage.append(node('code', item.usage)); detail.append(usage);
      if (item.family === 'compose') detail.append(node('p', m.global, 'manual-note'));
      if (item.options.length) {
        detail.append(node('h4', m.options)); const options = node('dl');
        item.options.forEach(option => { const term = node('dt'); term.append(node('code', option.flag)); options.append(term, node('dd', option.description[locale()])); }); detail.append(options);
      }
      detail.append(node('h4', m.examples));
      item.examples.forEach((example, index) => {
        const block = node('div', '', 'command-block'), meta = node('div', '', 'command-meta');
        meta.append(node('span', `${m.examples} ${index + 1}`)); const copy = node('button', m.copy, 'copy-all'); copy.type = 'button'; copy.setAttribute('aria-label', `${m.copy} · ${item.command} · ${m.examples} ${index + 1}`); copy.dataset.copy = `manual-example-${index}`;
        meta.append(copy); const code = node('code', example.code); code.id = copy.dataset.copy; block.append(meta, code); detail.append(node('p', example.description[locale()], 'manual-example-description'), block);
      });
      detail.append(node('p', m.note, 'manual-note'));
    };
    const render = () => {
      const m = messages();
      if (state !== 'ready') {
        count.textContent = state === 'loading' ? m.loading : state === 'error' ? m.loadError : '';
        list.replaceChildren(); renderDetail();
        if (state === 'error') {
          const retry = node('button', m.retry, 'manual-command'); retry.type = 'button';
          retry.addEventListener('click', load); list.append(retry);
        }
        return;
      }
      const results = searchCommands(commands, search.value);
      if (!results.some(item => item.id === selected)) selected = results[0]?.id;
      count.textContent = `${results.length} ${m.results}`;
      list.replaceChildren();
      results.forEach(item => {
        const button = node('button', '', 'manual-command'); button.type = 'button'; button.setAttribute('aria-controls', 'manual-detail'); button.setAttribute('aria-pressed', String(item.id === selected));
        button.append(node('span', item.command), node('small', item.summary[locale()]));
        button.addEventListener('click', () => { selected = item.id; list.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); renderDetail(item); detail.scrollTop = 0; }); list.append(button);
      });
      if (!results.length) list.append(node('p', m.empty));
      renderDetail(results.find(item => item.id === selected));
    };
    const load = async () => {
      if (state === 'loading' || state === 'ready') return;
      state = 'loading'; render();
      try { commands = await loadCatalog(); state = 'ready'; }
      catch { state = 'error'; }
      render();
    };
    const scheduleSearch = () => { clearTimeout(searchTimer); if (!composing) searchTimer = setTimeout(render, 180); };
    search.addEventListener('input', scheduleSearch);
    search.addEventListener('compositionstart', () => { composing = true; clearTimeout(searchTimer); });
    search.addEventListener('compositionend', () => { composing = false; scheduleSearch(); });
    return { onActivate: load, setLanguage() { const m = messages(); panel.querySelectorAll('[data-manual-text]').forEach(element => { element.textContent = m[element.dataset.manualText]; }); search.placeholder = m.placeholder; render(); } };
  }
};
