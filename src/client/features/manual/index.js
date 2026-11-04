import { commands, searchCommands } from './catalog.js';
const zh = { tab: '手册', kicker: 'COMMAND REFERENCE', title: 'Docker 命令手册', description: '搜索 Docker 与 Docker Compose 常用命令、参数和示例。完整参数与版本要求可查阅官方参考。', copy: '复制全部', search: '搜索命令、参数或用途', placeholder: '例如 logs、端口、--no-cache', family: '命令范围', all: '全部命令', results: '条命令', empty: '没有匹配的命令，试试其他关键词或切换范围。', usage: '用法', options: '常用参数', examples: '示例', official: '查看完整官方文档 ↗', docker: 'Docker 完整命令索引 ↗', compose: 'Compose 完整命令索引 ↗', global: 'Compose 全局参数：-f 指定文件，-p 设置项目名，--profile 启用配置组，--env-file 指定环境文件。全局参数放在子命令前。', note: '示例中的名称和路径需要按实际环境修改；删除与清理命令会影响本地资源。' };
const en = { tab: 'Manual', kicker: 'COMMAND REFERENCE', title: 'Docker commands', description: 'Search common Docker and Docker Compose commands, options, and examples. Follow the official reference for all options and version requirements.', copy: 'Copy all', search: 'Search commands, options, or tasks', placeholder: 'Try logs, ports, or --no-cache', family: 'Command scope', all: 'All commands', results: 'commands', empty: 'No matching commands. Try another keyword or scope.', usage: 'Usage', options: 'Common options', examples: 'Examples', official: 'Full official reference ↗', docker: 'All Docker commands ↗', compose: 'All Compose commands ↗', global: 'Compose global options: -f selects files, -p sets the project name, --profile enables profiles, and --env-file selects an environment file. Put global options before the subcommand.', note: 'Replace example names and paths for your environment. Removal and cleanup commands affect local resources.' };
export const feature = {
  id: 'manual', messages: { 'zh-CN': zh, en },
  init({ panel, messages }) {
    const search = panel.querySelector('#manual-search'), family = panel.querySelector('#manual-family');
    const list = panel.querySelector('[data-manual-list]'), detail = panel.querySelector('[data-manual-detail]');
    const count = panel.querySelector('[data-manual-count]');
    let selected = commands[0].id;
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
        meta.append(copy); const code = node('code', example); code.id = copy.dataset.copy; block.append(meta, code); detail.append(block);
      });
      detail.append(node('p', m.note, 'manual-note'));
    };
    const render = () => {
      const results = searchCommands(search.value, family.value), m = messages();
      if (!results.some(item => item.id === selected)) selected = results[0]?.id;
      count.textContent = `${results.length} ${m.results}`;
      list.replaceChildren();
      results.forEach(item => {
        const button = node('button', '', 'manual-command'); button.type = 'button'; button.setAttribute('aria-controls', 'manual-detail'); button.setAttribute('aria-pressed', String(item.id === selected));
        button.append(node('span', item.command), node('small', item.summary[locale()]));
        button.addEventListener('click', () => { selected = item.id; list.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); renderDetail(item); }); list.append(button);
      });
      if (!results.length) list.append(node('p', m.empty));
      renderDetail(results.find(item => item.id === selected));
    };
    search.addEventListener('input', render); family.addEventListener('change', render);
    return { setLanguage() { const m = messages(); panel.querySelectorAll('[data-manual-text]').forEach(element => { element.textContent = m[element.dataset.manualText]; }); search.placeholder = m.placeholder; render(); } };
  }
};
