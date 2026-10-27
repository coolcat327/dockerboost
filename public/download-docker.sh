#!/bin/sh
set -eu
[ "$#" -eq 5 ] || { echo 'Usage: sh download-docker.sh ORIGIN ARCH DOCKER COMPOSE VERSION' >&2; exit 1; }
origin=${1%/} arch=$2 docker=$3 compose=$4 version=$5
case "$origin" in https://*|http://*) ;; *) echo 'Invalid origin' >&2; exit 1;; esac
case "$arch" in x86_64|aarch64|armhf|ppc64le|s390x) ;; *) echo 'Invalid architecture' >&2; exit 1;; esac
for value in "$docker" "$compose"; do printf '%s\n' "$value" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo 'Invalid version' >&2; exit 1; }; done
script_path=$0
case "$script_path" in /*) ;; *) script_path="$PWD/$script_path";; esac
work='' child=''
cleanup() {
  if [ -n "$child" ]; then kill "$child" 2>/dev/null || :; wait "$child" 2>/dev/null || :; fi
  [ -z "$work" ] || rm -rf -- "$work"
  rm -f -- "$script_path"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' HUP TERM
for cmd in curl jq tar sha256sum; do command -v "$cmd" >/dev/null || { echo "Missing dependency: $cmd" >&2; exit 1; }; done
name="docker-offline-$arch-docker-$docker-compose-$compose"
output="$PWD/$name.tar"
[ ! -e "$output" ] || { echo "File already exists: $output" >&2; exit 1; }
work=$(mktemp -d "$PWD/.dockerboost-install.XXXXXX")
mkdir "$work/$name"
curl -fsSL --get --data-urlencode "arch=$arch" --data-urlencode "docker=$docker" --data-urlencode "compose=$compose" -o "$work/plan.json" "$origin/api/install/plan"
for file in readme.md daemon.json docker.service install_docker.sh uninstall_docker.sh; do
  jq -ejr --arg file "$file" '.files[$file] | select(type == "string")' "$work/plan.json" > "$work/$name/$file"
done
for kind in docker compose; do
  if [ "$kind" = docker ]; then file="docker-$docker.tgz"; else file=docker-compose; fi
  printf 'Downloading: %s\n' "$file"
  if [ -t 2 ]; then set -- -fSL --progress-bar; else set -- -fsSL; fi
  curl "$@" --retry 3 --get --data-urlencode "arch=$arch" --data-urlencode "docker=$docker" --data-urlencode "compose=$compose" --data-urlencode "version=$version" --data-urlencode "kind=$kind" -o "$work/$name/$file" "$origin/api/install/asset" &
  child=$!
  wait "$child"
  child=''
  printf 'Downloaded: %s\n' "$file"
done
cd "$work/$name"
chmod +x docker-compose install_docker.sh uninstall_docker.sh
printf 'Creating bundle and checksums…\n'
sha256sum "docker-$docker.tgz" docker-compose readme.md daemon.json docker.service install_docker.sh uninstall_docker.sh > SHA256SUMS
tar -cf "$work/$name.tar" -C "$work" "$name"
ln "$work/$name.tar" "$output"
echo "Saved: $output"
