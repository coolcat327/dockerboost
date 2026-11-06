export const setupMirrors = (origin) => [
  'https://docker.1ms.run',
  'https://docker.xuanyuan.me',
  'https://docker.m.daocloud.io',
  origin
];

export const createSetupCommand = (origin, daemonJsonPath = '/etc/docker/daemon.json') => `(
  daemon_json="${daemonJsonPath}"
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required" >&2
    exit 1
  fi
  if [ ! -f "$daemon_json" ]; then
    echo "daemon.json not found; no changes made" >&2
    exit 1
  fi

  daemon_json_tmp="$daemon_json.tmp"
  (set -C; : > "$daemon_json_tmp") 2>/dev/null || {
    echo "daemon.json.tmp already exists or cannot be created" >&2
    exit 1
  }
  trap 'rm -f "$daemon_json_tmp"' EXIT
  cp -p "$daemon_json" "$daemon_json_tmp" || exit 1
  jq -e --argjson mirrors '${JSON.stringify(setupMirrors(origin))}'  '
    ."registry-mirrors" = (
      $mirrors[:-1] + [(."registry-mirrors" // [])[] | select(. as $item | $mirrors | index($item) | not)] + $mirrors[-1:]
    )
  ' "$daemon_json" > "$daemon_json_tmp" || exit 1
  cp -p "$daemon_json" "$daemon_json.bak" || exit 1
  mv -f "$daemon_json_tmp" "$daemon_json" || exit 1
  systemctl restart docker
)`;
