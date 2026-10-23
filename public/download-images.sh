#!/bin/sh
set -eu

if [ "$#" -lt 4 ] || [ "$((($# - 1) % 3))" -ne 0 ]; then
  printf '%s\n' 'Usage: sh download-images.sh ORIGIN IMAGE PLATFORM SOURCE [IMAGE PLATFORM SOURCE ...]' >&2
  exit 1
fi
origin=${1%/}
shift
case "$origin" in
  https://*|http://*) ;;
  *) printf '%s\n' 'Invalid DockerBoost origin' >&2; exit 1 ;;
esac
script_path=$0
case "$script_path" in /*) ;; *) script_path="$PWD/$script_path" ;; esac
tmp=''
cleanup() {
  if [ -n "$tmp" ]; then rm -rf -- "$tmp"; fi
  rm -f -- "$script_path"
}
trap cleanup 0
trap 'exit 1' HUP INT TERM
command -v curl >/dev/null
tmp=$(mktemp -d)
while [ "$#" -gt 0 ]; do
  printf '\nDownloading %s (%s)\n' "$1" "$2"
  curl -fsSL --get --data-urlencode "image=$1" --data-urlencode "platform=$2" --data-urlencode "source=$3" \
    -o "$tmp/image.sh" "$origin/api/download-script"
  sh "$tmp/image.sh" </dev/null
  shift 3
done
