import type { Env, RegistrySource } from './types';

export const AUTO_SOURCE = 'auto';
export const DOCKER_HUB_MIRROR_SOURCE = 'mirror-gcr';

const defaultSources: RegistrySource[] = [
  { id: DOCKER_HUB_MIRROR_SOURCE, label: 'mirror.gcr.io', url: 'https://mirror.gcr.io' },
  { id: 'ghcr', label: 'ghcr.io', url: 'https://ghcr.io' },
  { id: 'quay', label: 'quay.io', url: 'https://quay.io' },
  { id: 'k8s', label: 'registry.k8s.io', url: 'https://registry.k8s.io' },
  { id: 'gitlab', label: 'registry.gitlab.com', url: 'https://registry.gitlab.com' },
  { id: 'mcr', label: 'mcr.microsoft.com', url: 'https://mcr.microsoft.com' },
  { id: 'ecr-public', label: 'public.ecr.aws', url: 'https://public.ecr.aws' }
];

function validateSource(source: RegistrySource): RegistrySource {
  const url = new URL(source.url);
  if (!/^[a-z0-9-]+$/.test(source.id) || !source.label || url.protocol !== 'https:') throw new Error('IMAGE_SOURCES 配置无效');
  return { id: source.id, label: source.label, url: url.origin };
}

/** The single configuration seam for every registry source exposed by this Worker. */
export function registrySources(env: Env): RegistrySource[] {
  if (!env.IMAGE_SOURCES) return defaultSources;
  try {
    const sources = JSON.parse(env.IMAGE_SOURCES) as RegistrySource[];
    if (!Array.isArray(sources) || !sources.length) throw new Error();
    return sources.map(validateSource);
  } catch {
    throw new Error('IMAGE_SOURCES 配置无效');
  }
}

export function registrySource(env: Env, id: string): RegistrySource {
  const source = registrySources(env).find((item) => item.id === id);
  if (!source) throw new Error('不支持的镜像源');
  return source;
}

export function sourceFrom(url: URL) {
  return url.searchParams.get('source') || AUTO_SOURCE;
}

export function usesDockerHubNaming(source: string) {
  return source === AUTO_SOURCE || source === DOCKER_HUB_MIRROR_SOURCE;
}

/** Removes an explicit source prefix from a Docker Registry v2 request path. */
export function sourceProxyTarget(env: Env, pathname: string) {
  const match = pathname.match(/^\/v2\/([a-z0-9-]+)(\/.*)$/);
  const source = match?.[1] && registrySources(env).find((item) => item.id === match[1]);
  return source ? { source: source.id, path: `/v2${match![2]}` } : { source: undefined, path: pathname };
}
