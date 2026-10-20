export function offlineInstaller(arch: string, docker: string): string {
  return `#!/bin/sh
# DockerBoost offline installer: no network requests are made here.
set -eu

# Resolve bundle files relative to this script, regardless of the current directory.
cd -- "$(dirname -- "$0")"

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
actual=$(uname -m)
[ "$actual" = '${arch}' ]${arch === 'armhf' ? ' || [ "$actual" = armv7l ]' : ''} || fail '安装包与 CPU 架构不匹配'
[ -f docker-${docker}.tgz ] && [ -f docker-compose ] && [ -f daemon.json ] && [ -f docker.service ] || fail '安装包不完整'
if command -v docker >/dev/null || [ -e /etc/systemd/system/docker.service ]; then
  fail '检测到现有 Docker，请先备份并手动处理旧安装，避免覆盖。'
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

# Collect and validate daemon settings before unpacking or installing binaries.
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

# Use a disposable directory for unpacking and validating the generated config.
work=$(mktemp -d)
trap 'rm -rf -- "$work"' 0
trap 'exit 1' HUP INT TERM
tar -xzf docker-${docker}.tgz -C "$work"
[ -x "$work/docker/docker-proxy" ] || fail '静态包缺少可执行的 docker-proxy'
"$work/docker/dockerd" --version
chmod +x docker-compose
./docker-compose version
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

# Configuration validation succeeded. Install binaries, plugin and service.
mkdir -p /usr/bin /usr/local/lib/docker/cli-plugins /etc/docker
if [ -f /etc/docker/daemon.json ]; then
  cp -p /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
fi
install -m 755 "$work"/docker/* /usr/bin/
install -m 755 docker-compose /usr/local/lib/docker/cli-plugins/docker-compose
ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose
install -m 644 "$work/daemon.json" /etc/docker/daemon.json
install -m 644 docker.service /etc/systemd/system/docker.service

# Enable the daemon and verify both Compose entry points.
systemctl daemon-reload
systemctl enable --now docker
docker --version
compose_version=$(docker compose version)
printf 'docker compose 可用：%s\\n' "$compose_version"
compose_version=$(docker-compose version)
printf 'docker-compose 可用：%s\\n' "$compose_version"
echo '安装完成。离线镜像请使用 docker load -i image.tar。'
`;
}
