import { installState } from './install-state';

export function offlineInstaller(arch: string, docker: string, compose: string): string {
  return `#!/bin/sh
# Offline installer: no network requests are made here.
set -eu

fail() {
  echo "错误: $*" >&2
  exit 1
}

# Check privileges, platform and bundle contents before making system changes.
[ "$(id -u)" = 0 ] || fail '请用 sudo sh offline_install_docker.sh'
command -v systemctl >/dev/null || fail '需要 systemd Linux'
command -v tar >/dev/null || fail '需要 tar'
# Static Docker bundles do not include the host firewall utilities.
for tool in iptables ip6tables; do
  command -v "$tool" >/dev/null || fail "缺少 \${tool}；Debian/Ubuntu 请先安装 iptables 软件包，离线主机需提前准备该包及其依赖。"
done
${installState}
if exists "$state"; then
  check_state
  [ "$(cat "$state/package")" = '${arch}/${docker}/${compose}' ] || fail '已有其他版本的安装记录，请先卸载再更换版本'
  [ "$(cat "$state/status")" = installed ] || fail '上次安装/卸载未完成，请先运行配套卸载脚本恢复'
  echo '已安装，无需重复安装；保留当前配置。'
  exit 0
fi
actual=$(uname -m)
[ "$actual" = '${arch}' ]${arch === 'armhf' ? ' || [ "$actual" = armv7l ]' : ''} || fail '安装包与 CPU 架构不匹配'
[ -f docker-${docker}.tgz ] && [ -f docker-compose ] && [ -f daemon.json ] && [ -f docker.service ] || fail '安装包不完整'
if command -v docker >/dev/null || exists /usr/local/bin/docker || systemctl cat docker.service >/dev/null 2>&1 || systemctl cat docker.socket >/dev/null 2>&1 || systemctl cat containerd.service >/dev/null 2>&1 || exists /etc/systemd/system/docker.service; then
  fail '检测到现有 Docker，请先备份并手动处理旧安装，避免覆盖。'
fi
for existing in /etc/systemd/system/docker.service.d /etc/systemd/system/multi-user.target.wants/docker.service; do
  exists "$existing" && fail "存在 Docker 服务配置，拒绝覆盖：$existing"
done
reuse_backup=false
if exists "$backup"; then
  check_parents "$backup"
  [ -f "$backup" ] && [ ! -L "$backup" ] || fail '配置备份不是普通文件'
  reuse_backup=true
  echo '检测到配置备份，将直接使用备份配置。'
fi
# Press Enter to accept the displayed default; input is always read literally.
ask() {
  printf '%s [%s]: ' "$1" "$2"
  IFS= read -r answer
  if [ -z "$answer" ]; then
    answer="$2"
  fi
}

matches() {
  printf '%s\\n' "$1" | LC_ALL=C grep -Eq "$2"
}

# Collect settings only when no saved configuration is available.
if [ "\${reuse_backup:-false}" = false ]; then
ask 'Docker 数据目录（绝对路径，无空格）' '/var/lib/docker'
data_root="$answer"
matches "$data_root" '^/[a-zA-Z0-9_./-]+$' || fail '数据目录无效'
ask '镜像加速地址（留空或输入 none 禁用）' ''
mirror="$answer"
[ -z "$mirror" ] || [ "$mirror" = none ] || matches "$mirror" '^https?://[a-zA-Z0-9.:/_-]+$' || fail '镜像地址无效'
ask '单个日志最大大小（如 10m）' '10m'
log_size="$answer"
matches "$log_size" '^[1-9][0-9]*[kmg]$' || fail '日志大小无效'
ask '保留日志文件数量' '3'
log_files="$answer"
matches "$log_files" '^[1-9][0-9]*$' || fail '日志数量无效'
ask '启用 live-restore（true/false）' 'true'
live="$answer"
[ "$live" = true ] || [ "$live" = false ] || fail '请输入 true 或 false'

fi

# Use a disposable directory for unpacking and validating the generated config.
work=$(mktemp -d)
tar -xzf docker-${docker}.tgz -C "$work"
[ -x "$work/docker/docker-proxy" ] || fail '静态包缺少可执行的 docker-proxy'
"$work/docker/dockerd" --version
chmod +x docker-compose
./docker-compose version
if [ "\${reuse_backup:-false}" = true ]; then
  cp -p -- "$backup" "$work/daemon.json"
else
if [ -z "$mirror" ] || [ "$mirror" = none ]; then
  mirrors='[]'
else
  mirrors="[\\\"$mirror\\\"]"
fi

write_daemon_config() {
  proxy_path="$1"

  cat > "$work/daemon.json" <<EOF_CONFIG
{
  "data-root": "$data_root",
  "userland-proxy-path": "$proxy_path",
  "registry-mirrors": $mirrors,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "$log_size",
    "max-file": "$log_files"
  },
  "live-restore": $live
}
EOF_CONFIG
}

# Validate with the unpacked proxy; the final installation path does not exist yet.
write_daemon_config "$work/docker/docker-proxy"
"$work/docker/dockerd" --validate --config-file="$work/daemon.json"
write_daemon_config /usr/bin/docker-proxy
fi

# Prepare the uninstall manifest and reject conflicts before writing system files.
: > "$work/files"
record() {
  check_parents "$1"
  if exists "$1"; then
    [ "$1" = /etc/docker/daemon.json ] && [ -f "$1" ] && [ ! -L "$1" ] || fail "目标已存在，拒绝覆盖：$1"
  fi
  printf '%s\\n' "$1" >> "$work/files"
}
for binary in "$work"/docker/*; do
  [ -f "$binary" ] && [ ! -L "$binary" ] || fail '静态包包含非普通程序文件'
  command -v "$(basename -- "$binary")" >/dev/null && fail "已有同名程序：$(basename -- "$binary")"
  record "/usr/bin/$(basename -- "$binary")"
done
for target in /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose /etc/docker/daemon.json /etc/systemd/system/docker.service /etc/systemd/system/multi-user.target.wants/docker.service; do
  record "$target"
done
# Publish only small metadata files before the first managed change.
mkdir -m 700 "$state.pending" || fail '存在未完成的安装记录暂存目录，请先检查'
pending_owned=true
cp "$work/files" "$state.pending/files"
printf '%s\\n' dockerboost-offline-v1 > "$state.pending/format"
printf '%s\\n' '${arch}/${docker}/${compose}' > "$state.pending/package"
echo pending > "$state.pending/status"
mv "$state.pending" "$state"
pending_owned=false

mkdir -p /usr/bin /usr/local/lib/docker/cli-plugins /etc/docker /etc/systemd/system
if [ -f /etc/docker/daemon.json ] && [ ! -f "$backup" ]; then
  atomic_copy /etc/docker/daemon.json "$backup"
  chmod 600 "$backup"
fi
install -m 755 "$work"/docker/* /usr/bin/
install -m 755 docker-compose /usr/local/lib/docker/cli-plugins/docker-compose
ln -s /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose
atomic_copy "$work/daemon.json" /etc/docker/daemon.json
chmod 644 /etc/docker/daemon.json
install -m 644 docker.service /etc/systemd/system/docker.service

# Validate the exact saved configuration after its referenced programs exist.
/usr/bin/dockerd --validate --config-file=/etc/docker/daemon.json

# Enable the daemon and verify both Compose entry points.
systemctl daemon-reload
systemctl enable --now docker
docker --version
compose_version=$(docker compose version)
printf 'docker compose 可用：%s\\n' "$compose_version"
compose_version=$(docker-compose version)
printf 'docker-compose 可用：%s\\n' "$compose_version"
echo installed > "$state/status"
echo '安装完成。离线镜像请使用 docker load -i image.tar。'
`;
}
