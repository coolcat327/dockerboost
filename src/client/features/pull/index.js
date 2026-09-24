import { createImageSelection } from '../../common/image-selection.js';
import { shareSelection } from '../../common/share-link.js';

export const feature = {
  id: 'pull',
  selectionGroup: 'image',
  messages: {
    'zh-CN': {
      tab: '拉取', kicker: 'PULL COMMAND BUILDER', title: '输入一个镜像，生成完整拉取命令',
      description: '自动选择最快可用镜像源，也可手动指定。镜像名不包含镜像源域名。',
      label: '镜像名', labelDetail: '（可粘贴 docker pull 命令解析）', source: '镜像源',
      automatic: '自动（最快可用）', architecture: '目标架构', action: '分享',
      shareCopied: '分享链接已复制', shareGenerated: '分享链接已生成', shareNeedsImage: '请先填写镜像名', shareFailed: '无法生成分享链接', shareCopyManually: '请复制此分享链接', shareCopyFailed: '未能复制分享链接',
      meta: '拉取 + 标签', copy: '复制全部'
    },
    en: {
      tab: 'Pull', kicker: 'PULL COMMAND BUILDER', title: 'Enter an image and generate the complete command.',
      description: 'Automatically select the fastest available source, or choose one manually. Do not include the source hostname in the image name.',
      label: 'Image name', labelDetail: ' (a docker pull command is accepted)', source: 'Image source',
      automatic: 'Auto (fastest available)', architecture: 'Target architecture', action: 'Share',
      shareCopied: 'Share link copied', shareGenerated: 'Share link is ready', shareNeedsImage: 'Enter an image name first', shareFailed: 'Could not create a share link', shareCopyManually: 'Copy this share link', shareCopyFailed: 'Could not copy the share link',
      meta: 'Pull + tag', copy: 'Copy all'
    }
  },
  init({ panel, locale, messages, flash, selectionStore }) {
    const form = panel.querySelector('#image-form');
    const shareButton = panel.querySelector('#pull-share');
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
    form.addEventListener('submit', (event) => event.preventDefault());
    shareButton.addEventListener('click', () => shareSelection({ tab: 'pull', selection, button: shareButton, messages, flash }));
    selection.onPlatformChange(() => {
      try { buildPull(); } catch { /* wait for a valid name */ }
    });
    return { setLanguage: () => selection.setLanguage() };
  }
};
