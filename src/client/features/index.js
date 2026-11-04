import { messages as install } from './install/messages.js';
import { messages as setup } from './setup/messages.js';
import { messages as pull } from './pull/messages.js';
import { messages as download } from './download/messages.js';
import { messages as convert } from './convert/messages.js';
import { messages as manual } from './manual/messages.js';

// Keep labels available immediately while loading each feature only when selected.
export const features = [
  { id: 'install', messages: install, load: () => import('./install/index.js') },
  { id: 'setup', messages: setup, load: () => import('./setup/index.js') },
  { id: 'pull', messages: pull, selectionGroup: 'image', load: () => import('./pull/index.js') },
  { id: 'download', messages: download, selectionGroup: 'image', load: () => import('./download/index.js') },
  { id: 'convert', messages: convert, load: () => import('./convert/index.js') },
  { id: 'manual', messages: manual, load: () => import('./manual/index.js') },
];
