const common = {
  'zh-CN': {
    heroTitle: '镜像拉取，更快一点',
    loadingPlatforms: '正在读取镜像架构…',
    failedPlatforms: '镜像架构查询失败',
    unsupportedPlatforms: '所选架构不可用，请重新选择',
    noPlatforms: '未找到可用架构',
    waitingPlatforms: '待获取'
  },
  en: {
    heroTitle: 'Pull images. Move faster.',
    loadingPlatforms: 'Loading image architectures…',
    failedPlatforms: 'Image architecture lookup failed',
    unsupportedPlatforms: 'Selected architecture unavailable; choose another',
    noPlatforms: 'No architecture available',
    waitingPlatforms: 'Awaiting lookup'
  }
};

function setText(root, selector, value, html = false) {
  const node = root.querySelector(selector);
  if (node && value !== undefined) node[html ? 'innerHTML' : 'textContent'] = value;
}

function renderPanel(panel, message) {
  setText(panel, '.panel-kicker', message.kicker);
  setText(panel, '.panel-copy h3', message.title, true);
  setText(panel, '.panel-copy p', message.description, true);
  setText(panel, '.command-meta span', message.meta);
  panel.querySelectorAll('.copy-all').forEach((button) => {
    button.textContent = message.copy;
  });
  if (message.label) {
    setText(panel, '.image-fields label', `<span>${message.label}</span><span class="image-label-detail">${message.labelDetail || ''}</span>`, true);
  }
  setText(panel, '.source-fields label', message.source);
  setText(panel, '.architecture-fields label', message.architecture);
  setText(panel, '[data-action-button]', message.action);
  setText(panel, '.command-note', message.note, true);
}

export function createLanguage() {
  let saved;
  try { saved = localStorage.getItem('dockerboost-language') || localStorage.getItem('dockwave-language'); } catch { /* Language still works without persistent storage. */ }
  const detected = saved || (navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
  let language = common[detected] ? detected : 'zh-CN';
  const buttons = [...document.querySelectorAll('.language')];
  let registrations = [];
  const locale = () => common[language];
  const messages = (feature) => feature.messages[language];
  const applyLanguage = (nextLanguage) => {
    language = common[nextLanguage] ? nextLanguage : 'zh-CN';
    document.documentElement.lang = language;
    setText(document, '[data-i18n="heroTitle"]', locale().heroTitle);
    registrations.forEach(({ feature, tab, panel, instance }) => {
      const message = messages(feature);
      tab.lastChild.textContent = message.tab;
      renderPanel(panel, message);
      instance?.setLanguage?.(message);
    });
    buttons.forEach((button) => button.classList.toggle('active', button.dataset.language === language));
    try { localStorage.setItem('dockerboost-language', language); } catch { /* Keep the current language for this page. */ }
  };
  const bind = (items) => {
    registrations = items;
    applyLanguage(language);
    buttons.forEach((button) => button.addEventListener('click', () => applyLanguage(button.dataset.language)));
  };
  return { locale, messages, bind };
}
