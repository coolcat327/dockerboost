import { messages } from './messages.js';
import { createSetupCommand, setupMirrors } from './setup-command.js';

export const feature = {
  id: 'setup',
  messages,
  init({ panel }) {
    const origin = window.location.origin;
    panel.querySelector('#setup-command').textContent = createSetupCommand(origin);
    panel.querySelector('#restore-command').textContent = `if [ -f /etc/docker/daemon.json.bak ]; then\n  cp /etc/docker/daemon.json.bak /etc/docker/daemon.json &&\n  systemctl restart docker\nelse\n  echo "No backup found"\nfi`;
    panel.querySelector('#manual-mirror').textContent = JSON.stringify({ 'registry-mirrors': setupMirrors(origin) }, null, 2);
    return {
      setLanguage(message) {
        panel.querySelector('[data-setup-meta="apply"]').textContent = message.applyMeta;
        panel.querySelector('[data-setup-meta="restore"]').textContent = message.restoreMeta;
        panel.querySelector('[data-setup-fallback]').innerHTML = message.fallback;
        panel.querySelector('[data-setup-resources]').textContent = message.resources;
      }
    };
  }
};
