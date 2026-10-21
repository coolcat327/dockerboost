// Shared only by the paired offline lifecycle scripts. Never source state as shell code.
export const installState = String.raw`
bundle_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd -- "$bundle_dir"
state=$bundle_dir/install-state
backup=$bundle_dir/daemon.json.bak
lock=$bundle_dir/.offline-install.lock
work=
write_tmp=
pending_owned=false
locked=false
cleanup() {
  if [ -n "$write_tmp" ]; then rm -f -- "$write_tmp"; fi
  if [ "$pending_owned" = true ]; then rm -rf -- "$state.pending"; fi
  if [ -n "$work" ]; then rm -rf -- "$work"; fi
  if [ "$locked" = true ]; then rmdir -- "$lock"; fi
}
trap cleanup 0
trap 'exit 1' HUP INT TERM
[ ! -L "$state" ] || fail '安装记录不能是符号链接'
mkdir -m 700 "$lock" 2>/dev/null || fail '另一个安装/卸载正在运行；若曾强制终止，请确认无进程运行后按安装说明清理锁目录'
locked=true
exists() { [ -e "$1" ] || [ -L "$1" ]; }
# Replace directory entries atomically instead of truncating pre-existing hard links.
atomic_copy() {
  write_tmp=$(mktemp "$2.offline.XXXXXX")
  cp -Pp -- "$1" "$write_tmp"
  mv -f -- "$write_tmp" "$2"
  write_tmp=
}
check_state() {
  [ -f "$state/format" ] && [ "$(cat "$state/format")" = dockerboost-offline-v1 ] || fail '安装记录无效，未修改系统'
  [ -f "$state/package" ] && [ -f "$state/files" ] && [ -f "$state/status" ] || fail '安装记录不完整，未修改系统'
}
check_parents() {
  parent=$(dirname -- "$1")
  while [ "$parent" != / ]; do
    [ ! -L "$parent" ] || fail "目标父目录是符号链接，拒绝操作：$parent"
    parent=$(dirname -- "$parent")
  done
}
`;
