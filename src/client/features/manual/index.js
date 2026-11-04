import { loadCatalog, searchCommands } from './catalog.js';
const zh = { tab: '手册', kicker: 'COMMAND REFERENCE', title: 'Docker 命令手册', description: '搜索 Docker 与 Docker Compose 常用命令、参数和示例。完整参数与版本要求可查阅官方参考。', copy: '复制全部', search: '搜索命令、参数或用途', placeholder: '例如 logs、端口、--no-cache', results: '条命令', loading: '正在加载命令手册…', loadError: '命令手册加载失败，请重试。', retry: '重试', empty: '没有匹配的命令，试试其他关键词。', usage: '用法', options: '常用参数', examples: '示例', official: '查看官方文档', resources: '相关资源', docker: 'Docker 完整命令索引', compose: 'Compose 完整命令索引', global: 'Compose 全局参数：-f 指定文件，-p 设置项目名，--profile 启用配置组，--env-file 指定环境文件。全局参数放在子命令前。', note: '示例中的名称和路径需要按实际环境修改；删除与清理命令会影响本地资源。' };
const en = { tab: 'Manual', kicker: 'COMMAND REFERENCE', title: 'Docker commands', description: 'Search common Docker and Docker Compose commands, options, and examples. Follow the official reference for all options and version requirements.', copy: 'Copy all', search: 'Search commands, options, or tasks', placeholder: 'Try logs, ports, or --no-cache', results: 'commands', loading: 'Loading command reference…', loadError: 'Could not load the command reference. Try again.', retry: 'Retry', empty: 'No matching commands. Try another keyword.', usage: 'Usage', options: 'Common options', examples: 'Examples', official: 'Official reference', resources: 'Related resources', docker: 'All Docker commands', compose: 'All Compose commands', global: 'Compose global options: -f selects files, -p sets the project name, --profile enables profiles, and --env-file selects an environment file. Put global options before the subcommand.', note: 'Replace example names and paths for your environment. Removal and cleanup commands affect local resources.' };
export const feature = {
  id: 'manual', messages: { 'zh-CN': zh, en },
  init({ panel, messages }) {
    const search = panel.querySelector('#manual-search');
    const list = panel.querySelector('[data-manual-list]'), detail = panel.querySelector('[data-manual-detail]');
    const count = panel.querySelector('[data-manual-count]');
    let commands = [], selected, state = 'idle';
    const locale = () => document.documentElement.lang === 'en' ? 'en' : 'zh-CN';
    const node = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
    const renderDetail = item => {
      detail.replaceChildren(); detail.hidden = !item;
      if (!item) return;
      const m = messages();
      const heading = node('h4', item.command); heading.id = 'manual-detail-title';
      detail.append(heading, node('p', item.summary[locale()]));
      const link = node('a', m.official); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
      detail.append(node('h5', m.usage)); const usage = node('pre'); usage.tabIndex = 0; usage.append(node('code', item.usage)); detail.append(usage);
      if (item.family === 'compose') detail.append(node('p', m.global, 'manual-note'));
      if (item.options.length) {
        detail.append(node('h5', m.options)); const options = node('dl');
        item.options.forEach(option => { const term = node('dt'); term.append(node('code', option.flag)); options.append(term, node('dd', option.description[locale()])); }); detail.append(options);
      }
      detail.append(node('h5', m.examples));
      item.examples.forEach((example, index) => {
        const block = node('div', '', 'command-block'), meta = node('div', '', 'command-meta');
        meta.append(node('span', `${m.examples} ${index + 1}`)); const copy = node('button', m.copy, 'copy-all'); copy.type = 'button'; copy.dataset.copy = `manual-example-${index}`;
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
    search.addEventListener('input', render);
    return { onActivate: load, setLanguage() { const m = messages(); panel.querySelectorAll('[data-manual-text]').forEach(element => { element.textContent = m[element.dataset.manualText]; }); search.placeholder = m.placeholder; render(); } };
  }
};
