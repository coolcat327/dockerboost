#!/bin/sh
set -eu
script_path=$0
case "$script_path" in /*) ;; *) script_path="$PWD/$script_path";; esac
queue='' pids=''
cleanup() {
  for pid in $pids; do kill "$pid" 2>/dev/null || :; done
  for pid in $pids; do wait "$pid" 2>/dev/null || :; done
  [ -z "$queue" ] || rm -rf -- "$queue"
  rm -f -- "$script_path"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' HUP TERM
if [ "$#" -lt 4 ] || [ "$((($# - 1) % 3))" -ne 0 ]; then
  echo 'Usage: sh download-images.sh ORIGIN IMAGE PLATFORM SOURCE [IMAGE PLATFORM SOURCE ...]' >&2; exit 1
fi
origin=${1%/}; shift
case "$origin" in https://*|http://*) ;; *) echo 'Invalid origin' >&2; exit 1;; esac
for cmd in curl jq tar; do command -v "$cmd" >/dev/null || { echo "Missing dependency: $cmd" >&2; exit 1; }; done
script_dir=$(dirname -- "$script_path")
queue=$(mktemp -d "$script_dir/.dockerboost-queue.XXXXXX")
jobs=0
while [ "$#" -gt 0 ]; do
  jobs=$((jobs + 1))
  mkdir "$queue/$jobs"
  printf '%s' "$1" > "$queue/$jobs/image"
  printf '%s' "$2" > "$queue/$jobs/platform"
  printf '%s' "$3" > "$queue/$jobs/source"
  shift 3
done

download_image() (
  image=$1 platform=$2 source=$3 job_dir=$4
  work='' pids=''
  cleanup_image() {
    for pid in $pids; do kill "$pid" 2>/dev/null || :; done
    for pid in $pids; do wait "$pid" 2>/dev/null || :; done
    [ -z "$work" ] || rm -rf -- "$work"
  }
  wait_batch() {
    failed=0
    for pid in $pids; do wait "$pid" || failed=1; done
    pids=''
    [ "$failed" -eq 0 ]
  }
  trap cleanup_image 0
  trap 'exit 1' HUP INT TERM
  printf 'Starting: %s (%s)\n' "$image" "$platform"
  printf '%s\n' 'Could not retrieve image metadata; check the image, platform, source and network.' > "$job_dir/reason"
  work=$(mktemp -d "$script_dir/.dockerboost-download.XXXXXX")
  curl -fsSL --get --data-urlencode "image=$image" --data-urlencode "platform=$platform" --data-urlencode "source=$source" -o "$work/plan.json" "$origin/api/download-plan" 2> "$job_dir/metadata-error" &
  pids="$!"
  if ! wait_batch; then
    if [ -s "$job_dir/metadata-error" ]; then tail -n 1 "$job_dir/metadata-error" >> "$job_dir/reason"; fi
    exit 1
  fi
  printf '%s\n' 'Invalid image metadata returned by the server.' > "$job_dir/reason"
  jq -e '(.image|type=="string") and (.repository|type=="string") and (.source|type=="string") and ([.config] + .layers | all(.digest | test("^sha256:[a-f0-9]{64}$"))) and ([.config] + .layers | all(.size | type == "number" and . >= 0 and floor == .))' "$work/plan.json" >/dev/null
  display=$(jq -r '.image' "$work/plan.json")
  repository=$(jq -r '.repository' "$work/plan.json")
  resolved=$(jq -r '.source' "$work/plan.json")
  filename=$(printf '%s_%s' "${display#library/}" "$platform" | tr '/:@' '___').tar
  output="$PWD/$filename"
  if [ -e "$output" ]; then
    printf 'Output already exists: %s\n' "$output" > "$job_dir/reason"
    exit 1
  fi
  printf '%s\n' 'Unable to download or verify image blobs after retries.' > "$job_dir/reason"
  mkdir "$job_dir/errors"
  mkdir -p "$work/blobs/sha256"
  jq '[{Config: ("blobs/sha256/" + (.config.digest | ltrimstr("sha256:"))), RepoTags: (if .image | contains("@") then [] else [.image] end), Layers: [.layers[].digest | "blobs/sha256/" + ltrimstr("sha256:")]}]' "$work/plan.json" > "$work/manifest.json"
  jq -r '[.config] + .layers | unique_by(.digest) | .[] | [.digest, (.size|tostring)] | @tsv' "$work/plan.json" > "$work/blobs.list"
  download_blob() (
    digest=$1 size=$2 path=$3
    child=''
    stop_blob() {
      if [ -n "$child" ]; then kill "$child" 2>/dev/null || :; wait "$child" 2>/dev/null || :; fi
    }
    trap stop_blob 0
    trap 'exit 1' HUP INT TERM
    attempt=0 delay=1
    while :; do
      rm -f -- "$path"
      curl -fsSL --connect-timeout 30 --get --data-urlencode "source=$resolved" -o "$path" "$origin/v2/$repository/blobs/$digest" 2> "$path.error" &
      child=$!
      if wait "$child"; then
        child=''
        error_reason='Incomplete blob download'
        if [ -f "$path" ] && [ "$(wc -c < "$path")" -eq "$size" ]; then rm -f -- "$path.error"; return 0; fi
      else
        child=''
        error_reason='Download failed'
      fi
      rm -f -- "$path"
      if [ "$attempt" -ge 3 ]; then
        if [ -s "$path.error" ]; then detail=$(tail -n 1 "$path.error"); else detail=$error_reason; fi
        printf '%s: %s\n' "$digest" "$detail" > "$job_dir/errors/${digest#sha256:}"
        printf 'Failed: %s · %.19s (4 attempts): %s\n' "$image" "$digest" "$detail" >&2
        return 1
      fi
      attempt=$((attempt + 1))
      printf 'Retrying %s · %.19s (%s/3) in %ss\n' "$image" "$digest" "$attempt" "$delay" >&2
      sleep "$delay" &
      child=$!
      wait "$child"
      child=''
      delay=$((delay * 2))
    done
  )
  count=0
  while IFS="$(printf '\t')" read -r digest size; do
    path="$work/blobs/sha256/${digest#sha256:}"
    download_blob "$digest" "$size" "$path" &
    pids="$pids $!"
    count=$((count + 1))
    if [ "$count" -eq 3 ]; then wait_batch; count=0; fi
  done < "$work/blobs.list"
  [ "$count" -eq 0 ] || wait_batch
  printf '%s\n' 'Could not create or save the archive; check disk space and permissions.' > "$job_dir/reason"
  tar -cf "$work/image.tar" -C "$work" manifest.json blobs
  ln "$work/image.tar" "$output"
  echo "Saved: $output"
  rm -rf -- "$work"; work=''
)

worker() (
  job_pid=''
  stop_worker() {
    if [ -n "$job_pid" ]; then kill "$job_pid" 2>/dev/null || :; wait "$job_pid" 2>/dev/null || :; fi
  }
  trap stop_worker 0
  trap 'exit 1' HUP INT TERM
  failed=0
  index=1
  while [ "$index" -le "$jobs" ]; do
    if mkdir "$queue/$index/claimed" 2>/dev/null; then
      image=$(cat "$queue/$index/image")
      platform=$(cat "$queue/$index/platform")
      source=$(cat "$queue/$index/source")
      download_image "$image" "$platform" "$source" "$queue/$index" &
      job_pid=$!
      if wait "$job_pid"; then
        printf 'success\n' > "$queue/$index/status"
      else
        printf 'failed\n' > "$queue/$index/status"
        failed=1
      fi
      job_pid=''
    fi
    index=$((index + 1))
  done
  exit "$failed"
)

count=0
while [ "$count" -lt "$jobs" ] && [ "$count" -lt 4 ]; do
  worker &
  pids="$pids $!"
  count=$((count + 1))
done
failed=0
for pid in $pids; do wait "$pid" || failed=1; done
pids=''
printf '\nDownload summary:\n'
for category in success failed; do
  case "$category" in success) label='Succeeded';; failed) label='Failed';; esac
  total=0 index=1
  while [ "$index" -le "$jobs" ]; do
    status=$(cat "$queue/$index/status" 2>/dev/null || printf 'failed')
    [ "$status" != "$category" ] || total=$((total + 1))
    index=$((index + 1))
  done
  printf '%s (%s):\n' "$label" "$total"
  index=1
  while [ "$index" -le "$jobs" ]; do
    status=$(cat "$queue/$index/status" 2>/dev/null || printf 'failed')
    if [ "$status" = "$category" ]; then
      image=$(cat "$queue/$index/image")
      platform=$(cat "$queue/$index/platform")
      source=$(cat "$queue/$index/source")
      printf '  - %s (%s, source: %s)\n' "$image" "$platform" "$source"
      if [ "$category" = failed ]; then
        if [ -f "$queue/$index/reason" ]; then printf '    %s\n' "$(cat "$queue/$index/reason")"; else printf '    Task did not finish.\n'; fi
        for detail in "$queue/$index/errors/"*; do
          [ -f "$detail" ] || continue
          printf '    %s\n' "$(cat "$detail")"
        done
      fi
    fi
    index=$((index + 1))
  done
done
[ "$failed" -eq 0 ] || exit 1
