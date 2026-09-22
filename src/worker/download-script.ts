type BlobDescriptor = { digest: string; size: number };

const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";

export function downloadScript(origin: string, repository: string, image: string, config: BlobDescriptor, layers: BlobDescriptor[], platform = 'linux/amd64', source?: string) {
  const blobs = [...new Map([config, ...layers].map((blob) => [blob.digest, blob])).values()];
  for (const blob of blobs) {
    if (!/^sha256:[a-f0-9]{64}$/.test(blob.digest) || !Number.isSafeInteger(blob.size) || blob.size < 0) {
      throw new Error('Invalid image blob descriptor');
    }
  }
  const path = (blob: BlobDescriptor) => `blobs/sha256/${blob.digest.slice(7)}`;
  const filename = `${image}_${platform}`.replaceAll(/[/:@]/g, '_') + '.tar';
  const metadata = JSON.stringify([{ Config: path(config), RepoTags: image.includes('@') ? [] : [image], Layers: layers.map(path) }]);
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
command -v curl >/dev/null
command -v tar >/dev/null
script_path=$0
work=''
cleanup() {
  if [ -n "$work" ]; then rm -rf -- "$work"; fi
  rm -f -- "$script_path"
}
trap cleanup EXIT
output="$PWD/"${quote(filename)}
if [ -e "$output" ]; then
  printf '%s\\n' "File already exists: $output" >&2
  exit 1
fi
work=$(mktemp -d "$PWD/.dockerboost-download.XXXXXX")
trap 'exit 1' HUP INT TERM
mkdir -p "$work/blobs/sha256"
printf '%s\\n' ${quote(metadata)} > "$work/manifest.json"
${download}
printf '%s\\n' 'Creating archive…'
tar -cf "$work/image.tar" -C "$work" manifest.json blobs
mv -n "$work/image.tar" "$output"
printf '%s\\n' "Saved: $output"
`;
}
