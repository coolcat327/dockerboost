import { offlineUninstaller } from './uninstaller';
import { offlineInstaller } from './installer';
import { offlineReadme } from './readme';

export function installFiles(arch: string, docker: string, compose: string, origin: string) {
  const service = `[Unit]\nDescription=Docker Engine\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=notify\nExecStart=/usr/bin/dockerd\nRestart=always\nRestartSec=2\nDelegate=yes\nKillMode=process\nLimitNOFILE=infinity\nLimitNPROC=infinity\nTasksMax=infinity\n\n[Install]\nWantedBy=multi-user.target\n`;
  const daemon = JSON.stringify({ 'data-root': '/var/lib/docker', 'userland-proxy-path': '/usr/bin/docker-proxy', 'registry-mirrors': [], 'log-driver': 'json-file', 'log-opts': { 'max-size': '10m', 'max-file': '3' }, 'live-restore': true }, null, 2) + '\n';
  const installer = offlineInstaller(arch, docker, compose);
  const readme = offlineReadme(arch, docker, compose, origin);
  return { 'readme.md': readme, 'daemon.json': daemon, 'docker.service': service, 'offline_install_docker.sh': installer, 'offline_uninstall_docker.sh': offlineUninstaller() };
}
