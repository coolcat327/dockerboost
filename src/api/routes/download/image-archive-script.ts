import { archiveFilename } from '../../../common/archive-filename.js';
import { localImageTag } from '../../../common/image-syntax.js';
import { HttpError } from '../../common/errors';

type BlobDescriptor = { digest: string; size: number };

const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";

export function validatedBlobs(config: BlobDescriptor, layers: BlobDescriptor[]) {
  const blobs = new Map<string, BlobDescriptor>();
  for (const blob of [config, ...layers]) {
    if (!blob || typeof blob.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(blob.digest) || !Number.isSafeInteger(blob.size) || blob.size < 0 || (blobs.has(blob.digest) && blobs.get(blob.digest)!.size !== blob.size)) {
      throw new HttpError('镜像清单包含无效或大小冲突的 blob 描述符', 502);
    }
    blobs.set(blob.digest, blob);
  }
  const result = [...blobs.values()];
  if (!Number.isSafeInteger(result.reduce((sum, blob) => sum + blob.size, 0))) throw new HttpError('镜像清单中的 blob 总大小超出支持范围', 502);
  return result;
}

export function downloadScript(origin: string, repository: string, image: string, config: BlobDescriptor, layers: BlobDescriptor[], platform = 'linux/amd64', source?: string) {
  const blobs = validatedBlobs(config, layers);
  const path = (blob: BlobDescriptor) => `blobs/sha256/${blob.digest.slice(7)}`;
  const filename = archiveFilename(image, platform);
  const tag = localImageTag(image);
  const metadata = JSON.stringify([{ Config: path(config), RepoTags: tag ? [tag] : [], Layers: layers.map(path) }]);
  const totalBytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
  const base = `${origin}/v2/${repository}`;
  const sourceQuery = source ? `?source=${encodeURIComponent(source)}` : '';
  const curlArguments = blobs.map((blob) => `--output "$work/${path(blob)}" ${quote(`${base}/blobs/${blob.digest}${sourceQuery}`)}`).join(' ');
  const checks = blobs.map((blob) => `actual=$(wc -c < "$work/${path(blob)}")
if [ "$actual" -ne ${blob.size} ]; then
  printf '%s\\n' ' failed: incomplete blob download; archive was not created.' >&2
  exit 1
fi`).join('\n');
  const download = `printf '%s\\n' ${quote(`Downloading ${blobs.length} blobs · ${Math.round(totalBytes / 1048576)} MB · max 5 concurrent`)}
curl -fSL --retry 3 --connect-timeout 30 --parallel --parallel-max 5 --progress-bar ${curlArguments}
${checks}
printf '%s\\n' ${quote(`Verified ${blobs.length} blobs · ${Math.round(totalBytes / 1048576)} MB`)}`;
  return `#!/bin/sh
set -eu
script_path=$0
case "$script_path" in /*) ;; *) script_path="$PWD/$script_path" ;; esac
work=''
cleanup() {
  if [ -n "$work" ]; then rm -rf -- "$work"; fi
  if [ -f "$script_path" ]; then rm -f -- "$script_path"; fi
}
trap cleanup 0
trap 'exit 1' HUP INT TERM
command -v curl >/dev/null
command -v tar >/dev/null
output="$PWD/"${quote(filename)}
if [ -e "$output" ]; then
  printf '%s\\n' "File already exists: $output" >&2
  exit 1
fi
work=$(mktemp -d "$PWD/.dockerboost-download.XXXXXX")
mkdir -p "$work/blobs/sha256"
printf '%s\\n' ${quote(metadata)} > "$work/manifest.json"
${download}
printf '%s\\n' 'Creating archive…'
tar -cf "$work/image.tar" -C "$work" manifest.json blobs
if ! ln "$work/image.tar" "$output"; then
  if [ -e "$output" ]; then printf '%s\\n' "File already exists: $output" >&2; fi
  exit 1
fi
printf '%s\\n' "Saved: $output"
`;
}
