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
  const qualifiedDockerHub = value.trim().startsWith('docker.io/');
  const raw = value.trim().replace(/^docker\.io\//, '');
  if (!raw || /[^a-zA-Z0-9._/@:-]/.test(raw)) throw new Error('请输入有效的镜像名');
  const matchedSource = explicitSource(raw, sources);
  const indicatedSource = qualifiedDockerHub ? 'mirror-gcr' : matchedSource?.id;
  if (indicatedSource && source !== 'auto' && source !== indicatedSource) throw new Error('镜像地址与指定镜像源不一致');
  const effectiveSource = indicatedSource || source;
  const input = matchedSource ? raw.slice(matchedSource.host.length + 1) : raw;
  const digestIndex = input.indexOf('@');
  const lastSlash = input.lastIndexOf('/');
  const lastColon = input.lastIndexOf(':');
  const hasTag = digestIndex < 0 && lastColon > lastSlash;
  const repositoryName = hasTag ? input.slice(0, lastColon) : digestIndex >= 0 ? input.slice(0, digestIndex) : input;
  const reference = digestIndex >= 0 ? input.slice(digestIndex + 1) : hasTag ? input.slice(lastColon + 1) : 'latest';
  const sourcePolicy = sources.find((item) => item.id === effectiveSource);
  if (sourcePolicy?.requiresNamespace && !repositoryName.includes('/')) {
    throw new Error(`${sourceLabel(effectiveSource, sources)} 需要完整的命名空间/镜像名，例如 owner/image:tag`);
  }
  const dockerHubNaming = effectiveSource === 'auto' || sourcePolicy?.naming === 'docker-hub' || (effectiveSource === 'mirror-gcr' && !sourcePolicy);
  const repository = dockerHubNaming && !repositoryName.includes('/')
    ? `library/${repositoryName}`
    : repositoryName;
  const original = raw.includes('@') ? raw : raw.lastIndexOf(':') > raw.lastIndexOf('/') ? raw : `${raw}:latest`;
  const acceleratedReference = digestIndex >= 0 ? `${repository}@${reference}` : `${repository}:${reference}`;
  return { original, repository, reference, source: effectiveSource, upstream: acceleratedReference, accelerated: `${mirrorHost}/r/${acceleratedSource}/${acceleratedReference}` };
}

export function archiveFilename(image, platform) {
  const displayImage = image.replace(/^library\//, '');
  return `${displayImage}_${platform}`.replaceAll(/[/:@]/g, '_') + '.tar';
}
