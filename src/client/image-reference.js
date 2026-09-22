const scopedSourceIds = new Set(['ghcr', 'quay', 'gitlab', 'mcr', 'ecr-public']);

export const sourceExamples = {
  auto: '例如 nginx:latest',
  'mirror-gcr': '例如 nginx:latest',
  ghcr: '例如 owner/image:tag',
  quay: '例如 org/image:tag',
  k8s: '例如 pause:3.10',
  gitlab: '例如 group/project/image:tag',
  mcr: '例如 dotnet/aspnet:8.0',
  'ecr-public': '例如 namespace/image:tag'
};

function sourceLabel(source, sources) {
  return sources.find((item) => item.id === source)?.label || source;
}

function explicitSource(raw, sources) {
  const firstSlash = raw.indexOf('/');
  if (firstSlash < 1) return undefined;
  const host = raw.slice(0, firstSlash).toLowerCase();
  const source = sources.find((item) => (item.host || item.label).toLowerCase() === host);
  return source && { id: source.id, host: source.host || source.label };
}

/**
 * Parses one public image reference and hides source-specific repository rules.
 * Callers receive both the original reference and its Worker-facing repository.
 */
export function imageReference(value, { source, acceleratedSource, mirrorHost, sources = [] }) {
  const raw = value.trim().replace(/^docker\.io\//, '');
  if (!raw || /[^a-zA-Z0-9._/@:-]/.test(raw)) throw new Error('请输入有效的镜像名');
  const matchedSource = explicitSource(raw, sources);
  const effectiveSource = matchedSource?.id || source;
  const input = matchedSource ? raw.slice(matchedSource.host.length + 1) : raw;
  const digestIndex = input.indexOf('@');
  const lastSlash = input.lastIndexOf('/');
  const lastColon = input.lastIndexOf(':');
  const hasTag = digestIndex < 0 && lastColon > lastSlash;
  const repositoryName = hasTag ? input.slice(0, lastColon) : digestIndex >= 0 ? input.slice(0, digestIndex) : input;
  const reference = digestIndex >= 0 ? input.slice(digestIndex + 1) : hasTag ? input.slice(lastColon + 1) : 'latest';
  if (scopedSourceIds.has(effectiveSource) && !repositoryName.includes('/')) {
    throw new Error(`${sourceLabel(effectiveSource, sources)} 需要完整的命名空间/镜像名，例如 owner/image:tag`);
  }
  const repository = (effectiveSource === 'auto' || effectiveSource === 'mirror-gcr') && !repositoryName.includes('/')
    ? `library/${repositoryName}`
    : repositoryName;
  const original = raw.includes('@') ? raw : raw.lastIndexOf(':') > raw.lastIndexOf('/') ? raw : `${raw}:latest`;
  const acceleratedReference = digestIndex >= 0 ? `${repository}@${reference}` : `${repository}:${reference}`;
  return { original, repository, reference, source: effectiveSource, upstream: acceleratedReference, accelerated: `${mirrorHost}/${acceleratedSource}/${acceleratedReference}` };
}

export function archiveFilename(image, platform) {
  return `${image}_${platform}`.replaceAll(/[/:@]/g, '_') + '.tar';
}
