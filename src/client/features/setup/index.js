import { createSetupCommand } from './setup-command.js';

export const feature = {
  id: 'setup',
  messages: {
    'zh-CN': {
      tab: '配置', kicker: 'DAEMON CONFIGURATION',
      title: '让每次 <code>docker pull</code> 都走加速入口',
      description: '仅在现有 <code>daemon.json</code> 上合并配置；写入前会自动备份，如需撤销可使用右侧命令。',
      applyMeta: '备份并写入配置', restoreMeta: '恢复备份',
      fallback: '若上述命令未成功，或默认配置文件不存在：不会创建任何文件。请在 Docker daemon 实际使用的配置文件中手动合并下方的 <code>registry-mirrors</code> 字段。',
      copy: '复制全部'
    },
    en: {
      tab: 'Setup', kicker: 'DAEMON CONFIGURATION',
      title: 'Route every <code>docker pull</code> through your mirror.',
      description: 'Only an existing <code>daemon.json</code> is updated; it is backed up first and can be restored with the command on the right.',
      applyMeta: 'Back up and write', restoreMeta: 'Restore backup',
      fallback: 'If the command does not succeed, or the default configuration file is missing, no file is created. Manually merge the <code>registry-mirrors</code> field below into the configuration file your Docker daemon actually uses.',
      copy: 'Copy all'
    }
  },
  init({ panel }) {
    const origin = window.location.origin;
    panel.querySelector('#setup-command').textContent = createSetupCommand(origin);
    panel.querySelector('#restore-command').textContent = `if [ -f /etc/docker/daemon.json.bak ]; then\n  cp /etc/docker/daemon.json.bak /etc/docker/daemon.json &&\n  systemctl restart docker\nelse\n  echo "No backup found"\nfi`;
    panel.querySelector('#manual-mirror').textContent = `{\n  "registry-mirrors": ["${origin}"]\n}`;
    return {
      setLanguage(message) {
        panel.querySelector('[data-setup-meta="apply"]').textContent = message.applyMeta;
        panel.querySelector('[data-setup-meta="restore"]').textContent = message.restoreMeta;
        panel.querySelector('[data-setup-fallback]').innerHTML = message.fallback;
      }
    };
  }
};
