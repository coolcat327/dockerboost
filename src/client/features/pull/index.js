import { messages } from './messages.js';
import { pullCommand } from './pull-command.js';
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
    const copyCommand = panel.querySelector('[data-copy="pull-all-command"]');
    let selection, commandState = 'waitingPlatforms';
    const showStatus = state => { commandState = state; command.textContent = locale()[state]; copyCommand.disabled = true; };
    const resetCommand = () => showStatus('waitingPlatforms');
    const buildPull = () => {
      const { image: input, platform, platformUnsupported } = selection.current();
      if (!input.trim()) { resetCommand(); return; }
      if (!platform) { showStatus(platformUnsupported ? 'unsupportedPlatforms' : 'noPlatforms'); return; }
      const image = selection.resolve();
      commandState = ''; copyCommand.disabled = false;
      command.textContent = pullCommand(image, platform);
    };
    selection = createImageSelection({
      panel, locale, messages, flash, store: selectionStore,
      onLoading: () => showStatus('loadingPlatforms'),
      onReady: buildPull,
      onError: () => showStatus('failedPlatforms'),
      onReset: resetCommand
    });
    selection.init();
    form.addEventListener('submit', (event) => event.preventDefault());
    shareButton.addEventListener('click', () => shareSelection({ tab: 'pull', selection, button: shareButton, messages, flash }));
    selection.onPlatformChange(() => {
      try { buildPull(); } catch { /* wait for a valid name */ }
    });
    const batch = initBatchPull({ panel, locale, messages, selectionStore });
    return { setLanguage: (message) => { selection.setLanguage(); if (commandState) showStatus(commandState); batch.setLanguage(message === feature.messages.en); } };
  }
};
