export const messages = {
    'zh-CN': {
      tab: '配置', kicker: 'DAEMON CONFIGURATION',
      title: '配置镜像加速',
      description: '仅在现有 <code>daemon.json</code> 上合并配置；写入前会自动备份，如需撤销可使用右侧命令。',
      applyMeta: '备份并写入配置', restoreMeta: '恢复备份',
      fallback: '若上述命令未成功，或默认配置文件不存在：不会创建任何文件。请在 Docker daemon 实际使用的配置文件中手动合并下方的 <code>registry-mirrors</code> 字段。',
      resources: '相关资源', copy: '复制全部'
    },
    en: {
      tab: 'Setup', kicker: 'DAEMON CONFIGURATION',
      title: 'Accelerate every pull',
      description: 'Only an existing <code>daemon.json</code> is updated; it is backed up first and can be restored with the command on the right.',
      applyMeta: 'Back up and write', restoreMeta: 'Restore backup',
      fallback: 'If the command does not succeed, or the default configuration file is missing, no file is created. Manually merge the <code>registry-mirrors</code> field below into the configuration file your Docker daemon actually uses.',
      resources: 'Related resources', copy: 'Copy all'
    }
  };
