import { installState } from './install-state';

export function offlineUninstaller(): string {
  return `#!/bin/sh
# Only uninstall an installation recorded by the paired offline installer.
set -eu
fail() { echo "错误: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail '请用 sudo sh offline_uninstall_docker.sh'
${installState}
if ! exists "$state"; then
  echo '没有对应的安装记录，无需卸载；未修改现有 Docker。'
  exit 0
fi
check_state
# Changed contents are allowed. Never follow a replaced parent directory during removal.
while IFS= read -r target; do
  check_parents "$target"
  [ ! -d "$target" ] || [ -L "$target" ] || fail "安装文件的位置已变成目录：$target"
done < "$state/files"
check_parents "$backup"
[ ! -d "$backup" ] || fail '配置备份路径是目录，无法备份'
# Query the local daemon rather than a remote Docker context from the caller's environment.
if [ -x /usr/bin/docker ] && running=$(/usr/bin/docker --host unix:///var/run/docker.sock ps --quiet 2>/dev/null); then
  [ -z "$running" ] || fail '仍有运行中的容器，请先停止容器再卸载'
else
  if systemctl is-active --quiet docker; then
    fail '无法确认容器运行状态，请恢复 Docker 连接后再卸载'
  fi
  command -v pgrep >/dev/null || fail '无法检查残留容器进程，请安装 procps 工具后再卸载'
  if pgrep -f 'containerd-shim.*-namespace moby' >/dev/null; then
    fail '检测到仍在运行的容器进程，请先恢复 Docker 并停止容器'
  else
    [ "$?" = 1 ] || fail '无法检查残留容器进程，保留安装'
  fi
fi
# Preserve the latest configuration before stopping services or deleting anything.
if exists /etc/docker/daemon.json; then
  [ -f /etc/docker/daemon.json ] || fail 'daemon.json 不是可读取的配置文件，无法备份'
  # Dereference the source so a changed config symlink is backed up as actual contents.
  work=$(mktemp -d)
  cp -Lp -- /etc/docker/daemon.json "$work/daemon.json"
  atomic_copy "$work/daemon.json" "$backup"
  chmod 600 "$backup"
  echo '当前 daemon.json 已备份，下次安装将自动使用。'
fi
# Stop socket activation first. Missing or malformed inactive units must not block retries.
for unit in docker.socket docker.service; do
  if ! systemctl stop "$unit"; then
    systemctl is-active --quiet "$unit" && fail "无法停止服务：$unit"
  fi
  systemctl disable "$unit" || true
done
echo uninstalling > "$state/status"
while IFS= read -r target; do
  rm -f -- "$target"
done < "$state/files"
# Overrides are Docker configuration, not a reason to reject a clean uninstall.
rm -rf -- /etc/systemd/system/docker.service.d /etc/systemd/system/docker.socket.d
systemctl daemon-reload
# Only remove empty Docker-specific directories; leave system parents and data alone.
for directory in /etc/docker /usr/local/lib/docker/cli-plugins /usr/local/lib/docker; do
  rmdir -- "$directory" 2>/dev/null || true
done
rm -rf -- "$state"
echo '卸载完成，已保留配置备份。'
`;
}
