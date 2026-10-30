#!/bin/sh
set -eu
script_path=$0
case "$script_path" in /*) ;; *) script_path="$PWD/$script_path";; esac
queue='' pids='' monitor_pid=''
cleanup() {
  if [ -n "$monitor_pid" ]; then kill "$monitor_pid" 2>/dev/null || :; wait "$monitor_pid" 2>/dev/null || :; fi
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

download_image() {
  image=$1 platform=$2 source=$3 job_dir=$4
  work='' pids=''
  cleanup_image() {
    for pid in $pids; do kill "$pid" 2>/dev/null || :; done
    for pid in $pids; do wait "$pid" 2>/dev/null || :; done
    if [ -f "$job_dir/download-start" ]; then
      if [ ! -f "$job_dir/download-end" ]; then date +%s > "$job_dir/download-end"; fi
      completed_bytes=0
      if [ -f "$work/blobs.list" ]; then
        while IFS="$(printf '\t')" read -r digest size; do
          if [ -f "$job_dir/completed/${digest#sha256:}" ]; then completed_bytes=$((completed_bytes + size)); fi
        done < "$work/blobs.list"
      fi
      printf '%s\n' "$completed_bytes" > "$job_dir/downloaded"
    fi
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
  printf 'metadata\n' > "$job_dir/phase"
  printf 'Starting: %s (%s)\n' "$image" "$platform"
  printf '%s\n' 'Could not retrieve image metadata; check the image, platform, source and network.' > "$job_dir/reason"
  work=$(mktemp -d "$script_dir/.dockerboost-download.XXXXXX")
  printf '%s\n' "$work" > "$job_dir/work"
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
  jq '[.config] + .layers | unique_by(.digest) | map(.size) | add // 0' "$work/plan.json" > "$job_dir/total"
  jq -r '[.layers[].digest] | unique | .[]' "$work/plan.json" > "$job_dir/layers"
  mkdir "$job_dir/completed"
  date +%s > "$job_dir/download-start"
  printf 'downloading\n' > "$job_dir/phase"
  download_blob() {
    digest=$1 size=$2 path=$3
    child=''
    stop_blob() {
      if [ -n "$child" ]; then kill "$child" 2>/dev/null || :; wait "$child" 2>/dev/null || :; fi
    }
    trap stop_blob 0
    trap 'exit 1' HUP INT TERM
    attempt=0 delay=1
    while :; do
      rm -f -- "$job_dir/errors/${digest#sha256:}.retry"
      rm -f -- "$path"
      curl -fsSL --connect-timeout 30 --get --data-urlencode "source=$resolved" -o "$path" "$origin/v2/$repository/blobs/$digest" 2> "$path.error" &
      child=$!
      if wait "$child"; then
        child=''
        error_reason='Incomplete blob download'
        if [ -f "$path" ] && [ "$(wc -c < "$path")" -eq "$size" ]; then rm -f -- "$path.error"; : > "$job_dir/completed/${digest#sha256:}"; return 0; fi
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
      printf '%s\n' "$attempt" > "$job_dir/errors/${digest#sha256:}.retry"
      printf 'Retrying %s · %.19s (%s/3) in %ss\n' "$image" "$digest" "$attempt" "$delay" >&2
      sleep "$delay" &
      child=$!
      wait "$child"
      child=''
      delay=$((delay * 2))
    done
  }
  count=0
  while IFS="$(printf '\t')" read -r digest size; do
    path="$work/blobs/sha256/${digest#sha256:}"
    download_blob "$digest" "$size" "$path" &
    pids="$pids $!"
    count=$((count + 1))
    if [ "$count" -eq 3 ]; then wait_batch; count=0; fi
  done < "$work/blobs.list"
  [ "$count" -eq 0 ] || wait_batch
  date +%s > "$job_dir/download-end"
  printf '%s\n' 'Could not create or save the archive; check disk space and permissions.' > "$job_dir/reason"
  printf 'packing\n' > "$job_dir/phase"
  tar -cf "$work/image.tar" -C "$work" manifest.json blobs &
  pids="$!"
  wait_batch
  ln "$work/image.tar" "$output"
  echo "Saved: $output"
  cleanup_image
  trap - 0
}

worker() {
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
      if [ "$interactive" = 1 ]; then
        download_image "$image" "$platform" "$source" "$queue/$index" > "$queue/$index/log" 2>&1 &
      else
        download_image "$image" "$platform" "$source" "$queue/$index" &
      fi
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
}

# Only the monitor writes live progress to the terminal. Workers keep their logs
# separately so concurrent messages cannot corrupt the display.
interactive=0
if [ -t 2 ] && [ "${TERM:-dumb}" != dumb ]; then interactive=1; fi
monitor() {
  sleep_pid=''
  trap 'if [ -n "$sleep_pid" ]; then kill "$sleep_pid" 2>/dev/null || :; wait "$sleep_pid" 2>/dev/null || :; fi' 0
  trap 'exit 0' HUP INT TERM
  lines=0
  while :; do
    if [ "$lines" -gt 0 ]; then printf '\033[%sA' "$lines" >&2; fi
    lines=0
    columns=$(tput cols 2>/dev/null || printf 80)
    rows=$(tput lines 2>/dev/null || printf 24)
    case "$columns" in ''|*[!0-9]*) columns=80;; esac
    case "$rows" in ''|*[!0-9]*) rows=24;; esac
    [ "$columns" -ge 10 ] || columns=10
    [ "$rows" -ge 6 ] || rows=6
    name_width=$((columns - 65))
    [ "$name_width" -ge 10 ] || name_width=10
    [ "$name_width" -le 45 ] || name_width=45
    content_width=$((columns - 5))
    border=$(printf '%*s' "$((columns - 3))" '' | tr ' ' '-')
    title='Download details'
    title_padding=$(((content_width - ${#title}) / 2))
    [ "$title_padding" -ge 0 ] || title_padding=0
    title=$(printf '%*s%s' "$title_padding" '' "$title")
    printf '\033[2K  %-*.*s\n' "$content_width" "$content_width" "$title" >&2
    printf '\033[2K+%s+\n' "$border" >&2
    header=$(printf '%-*s | %-11s | %-7s | %-19s | %s' "$name_width" Image Status Layers Size Speed)
    printf '\033[2K| %-*.*s |\n' "$content_width" "$content_width" "$header" >&2
    printf '\033[2K+%s+\n' "$border" >&2
    lines=4 shown=0
    for group in active queued success failed; do
      index=1
      while [ "$index" -le "$jobs" ]; do
        job_dir="$queue/$index"
        status=$(cat "$job_dir/status" 2>/dev/null || :)
        if [ -n "$status" ]; then category=$status
        elif [ -d "$job_dir/claimed" ]; then category=active
        else category=queued; fi
        if [ "$category" = "$group" ] && [ "$shown" -lt $((rows - 6)) ]; then
          image=$(cat "$job_dir/image")
          phase=$category layers='-' size_text='-' speed_text='-'
          if [ "$category" = active ]; then
            phase=$(cat "$job_dir/phase" 2>/dev/null || printf 'metadata')
            for retry in "$job_dir/errors/"*.retry; do
              if [ -f "$retry" ]; then phase=retrying; break; fi
            done
          fi
          if [ -f "$job_dir/layers" ]; then
            layer_total=0 layer_done=0
            while IFS= read -r layer; do
              layer_total=$((layer_total + 1))
              [ ! -f "$job_dir/completed/${layer#sha256:}" ] || layer_done=$((layer_done + 1))
            done < "$job_dir/layers"
            layers="$layer_done/$layer_total"
          fi
          if [ "$category" = success ] && [ -f "$job_dir/total" ]; then
            total=$(cat "$job_dir/total")
            size_text=$(awk -v t="$total" 'BEGIN {printf "%.1f/%.1f MiB", t/1048576, t/1048576}')
          fi
          if [ "$category" = active ] && [ -s "$job_dir/work" ]; then
            work=$(cat "$job_dir/work")
            if [ -f "$work/blobs.list" ]; then
              current=0 total=0
              while IFS="$(printf '\t')" read -r digest size; do
                total=$((total + size))
                path="$work/blobs/sha256/${digest#sha256:}"
                if [ -f "$path" ]; then
                  bytes=$(wc -c < "$path" 2>/dev/null) || bytes=0
                  current=$((current + bytes))
                fi
              done < "$work/blobs.list"
              now=$(date +%s)
              previous=$(cat "$job_dir/sample" 2>/dev/null || printf '%s %s' "$now" "$current")
              set -- $previous
              elapsed=$((now - $1)); delta=$((current - $2)); speed=0
              if [ "$elapsed" -gt 0 ] && [ "$delta" -gt 0 ]; then speed=$((delta / elapsed)); fi
              printf '%s %s\n' "$now" "$current" > "$job_dir/sample"
              size_text=$(awk -v c="$current" -v t="$total" 'BEGIN {printf "%.1f/%.1f MiB", c/1048576, t/1048576}')
              if [ "$phase" = downloading ] && [ "$total" -gt 0 ]; then phase="$(awk -v c="$current" -v t="$total" 'BEGIN {n=int(c*100/t); if(n>100)n=100; printf "%d%%",n}')"; fi
              if [ "$phase" != packing ]; then speed_text=$(awk -v s="$speed" 'BEGIN {printf "%.1f M/s", s/1048576}'); fi
            fi
          fi
          # Truncate the image field independently so the other columns remain visible.
          image=$(printf '%s' "$image" | cut -c 1-"$name_width")
          row=$(printf '%-*s | %-11s | %-7s | %-19s | %s' "$name_width" "$image" "$phase" "$layers" "$size_text" "$speed_text")
          printf '\033[2K| %-*.*s |\n' "$content_width" "$content_width" "$row" >&2
          lines=$((lines + 1)); shown=$((shown + 1))
        fi
        index=$((index + 1))
      done
    done
    if [ "$shown" -lt "$jobs" ]; then
      message="... $((jobs - shown)) more tasks"
      printf '\033[2K| %-*.*s |\n' "$content_width" "$content_width" "$message" >&2
      lines=$((lines + 1))
    fi
    printf '\033[2K+%s+\n' "$border" >&2
    lines=$((lines + 1))
    while [ "$lines" -lt "${old_lines:-0}" ]; do printf '\033[2K\n' >&2; lines=$((lines + 1)); done
    old_lines=$lines
    [ ! -f "$queue/stop-monitor" ] || break
    sleep 1 &
    sleep_pid=$!
    wait "$sleep_pid" || :
    sleep_pid=''
  done
}
if [ "$interactive" = 1 ]; then
  tput clear >&2 2>/dev/null || printf '\033[2J\033[H' >&2
  monitor & monitor_pid=$!
fi

count=0
while [ "$count" -lt "$jobs" ] && [ "$count" -lt 4 ]; do
  worker &
  pids="$pids $!"
  count=$((count + 1))
done
failed=0
for pid in $pids; do wait "$pid" || failed=1; done
pids=''
if [ -n "$monitor_pid" ]; then
  : > "$queue/stop-monitor"
  wait "$monitor_pid" 2>/dev/null || :
  monitor_pid=''
fi
# Size columns to the supplied values so the final report retains full names.
image_width=5 platform_width=8
index=1
while [ "$index" -le "$jobs" ]; do
  image=$(cat "$queue/$index/image"); platform=$(cat "$queue/$index/platform")
  [ "${#image}" -le "$image_width" ] || image_width=${#image}
  [ "${#platform}" -le "$platform_width" ] || platform_width=${#platform}
  index=$((index + 1))
done
summary_border=$(printf '+-%*s-+-%*s-+-%*s-+-%*s-+-%*s-+-%*s-+' "$image_width" '' 7 '' "$platform_width" '' 14 '' 13 '' 12 '' | tr ' ' '-')
summary_title='Download summary'
summary_padding=$(((${#summary_border} - ${#summary_title}) / 2))
printf '\n%*s%s\n' "$summary_padding" '' "$summary_title"
printf '%s\n' "$summary_border"
printf '| %-*s | %-7s | %-*s | %-14s | %-13s | %-12s |\n' "$image_width" Image Status "$platform_width" Platform Size Time Speed
printf '%s\n' "$summary_border"
success_count=0 failed_count=0 index=1 total_downloaded=0 first_download='' last_download=''
while [ "$index" -le "$jobs" ]; do
  status=$(cat "$queue/$index/status" 2>/dev/null || printf 'failed')
  if [ "$status" = success ]; then success_count=$((success_count + 1)); else failed_count=$((failed_count + 1)); fi
  image=$(cat "$queue/$index/image"); platform=$(cat "$queue/$index/platform")
  total_text='-' duration_text='-' average_text='-'
  if [ -f "$queue/$index/total" ]; then
    total_text=$(awk -v t="$(cat "$queue/$index/total")" 'BEGIN {printf "%.1f MiB", t/1048576}')
  fi
  if [ -f "$queue/$index/download-start" ] && [ -f "$queue/$index/download-end" ]; then
    started=$(cat "$queue/$index/download-start")
    ended=$(cat "$queue/$index/download-end")
    downloaded=$(cat "$queue/$index/downloaded")
    total_downloaded=$((total_downloaded + downloaded))
    if [ -z "$first_download" ] || [ "$started" -lt "$first_download" ]; then first_download=$started; fi
    if [ -z "$last_download" ] || [ "$ended" -gt "$last_download" ]; then last_download=$ended; fi
    elapsed=$((ended - started))
    if [ "$elapsed" -gt 0 ]; then
      duration_text="${elapsed}s"
      average_text=$(awk -v b="$downloaded" -v t="$elapsed" 'BEGIN {printf "%.1f M/s", b/1048576/t}')
    else
      duration_text='<1s'
    fi
  fi
  printf '| %-*s | %-7s | %-*s | %-14s | %-13s | %-12s |\n' "$image_width" "$image" "$status" "$platform_width" "$platform" "$total_text" "$duration_text" "$average_text"
  index=$((index + 1))
done
printf '%s\n' "$summary_border"
total_size='-' total_time='-' total_speed='-'
if [ -n "$first_download" ]; then
  total_size=$(awk -v b="$total_downloaded" 'BEGIN {printf "%.1f MiB", b/1048576}')
  elapsed=$((last_download - first_download))
  if [ "$elapsed" -gt 0 ]; then
    total_time="${elapsed}s"
    total_speed=$(awk -v b="$total_downloaded" -v t="$elapsed" 'BEGIN {printf "%.1f M/s", b/1048576/t}')
  else
    total_time='<1s'
  fi
fi
printf 'Succeeded (%s)  Failed (%s)  Size %s  Time %s  Speed %s\n' "$success_count" "$failed_count" "$total_size" "$total_time" "$total_speed"
index=1
while [ "$index" -le "$jobs" ]; do
  status=$(cat "$queue/$index/status" 2>/dev/null || printf 'failed')
  if [ "$status" = failed ]; then
    printf '\n%s:\n' "$(cat "$queue/$index/image")"
    if [ -f "$queue/$index/reason" ]; then printf '  %s\n' "$(cat "$queue/$index/reason")"; else printf '  Task did not finish.\n'; fi
    for detail in "$queue/$index/errors/"*; do
      [ -f "$detail" ] || continue
      case "$detail" in *.retry) continue;; esac
      printf '  %s\n' "$(cat "$detail")"
    done
  fi
  index=$((index + 1))
done
[ "$failed" -eq 0 ] || exit 1
