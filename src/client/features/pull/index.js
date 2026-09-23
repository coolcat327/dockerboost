import { createImageSelection } from '../../shared/image-selection.js';

export const feature = {
  id: 'pull',
  selectionGroup: 'image',
  messages: {
    'zh-CN': {
      tab: '拉取', kicker: 'PULL COMMAND BUILDER', title: '输入一个镜像，生成完整拉取命令',
      description: '自动选择最快可用镜像源，也可手动指定。镜像名不包含镜像源域名。',
      label: '镜像名', labelDetail: '（可粘贴 docker pull 命令解析）', source: '镜像源',
      automatic: '自动（最快可用）', architecture: '目标架构', action: '生成命令',
      meta: '拉取 + 标签', copy: '复制全部'
    },
    en: {
      tab: 'Pull', kicker: 'PULL COMMAND BUILDER', title: 'Enter an image and generate the complete command.',
      description: 'Automatically select the fastest available source, or choose one manually. Do not include the source hostname in the image name.',
      label: 'Image name', labelDetail: ' (a docker pull command is accepted)', source: 'Image source',
      automatic: 'Auto (fastest available)', architecture: 'Target architecture', action: 'Generate command',
      meta: 'Pull + tag', copy: 'Copy all'
    }
  },
  init({ panel, locale, messages, flash, selectionStore }) {
    const form = panel.querySelector('#image-form');
    const command = panel.querySelector('#pull-all-command');
    let selection;
    const resetCommand = () => { command.textContent = locale().waitingPlatforms; };
    const buildPull = () => {
      const { image: input, platform } = selection.current();
      if (!input.trim()) { resetCommand(); return; }
      if (!platform) { command.textContent = locale().loadingPlatforms; return; }
      const image = selection.resolve();
      command.textContent = `docker pull --platform ${platform} ${image.accelerated} &&\ndocker tag ${image.accelerated} ${image.original} &&\ndocker image rm ${image.accelerated}`;
    };
    selection = createImageSelection({
      panel, locale, messages, flash, store: selectionStore,
      onReady: buildPull,
      onError: resetCommand,
      onReset: resetCommand
    });
    selection.init();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try { buildPull(); flash('命令已更新'); } catch (error) { flash(error.message); }
    });
    selection.onPlatformChange(() => {
      try { buildPull(); } catch { /* wait for a valid name */ }
    });
    return { setLanguage: () => selection.setLanguage() };
  }
};
