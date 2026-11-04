import { messages } from './messages.js';
import { createImageSelection } from '../../common/image-selection.js';
import { initBatchPull } from './batch.js';
import { shareSelection } from '../../common/share-link.js';

export const feature = {
  id: 'pull',
  selectionGroup: 'image',
  messages,
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
    const batch = initBatchPull({ panel, locale, messages, selectionStore });
    return { setLanguage: (message) => { selection.setLanguage(); batch.setLanguage(message === feature.messages.en); } };
  }
};
