import type { Env, RegistrySource } from './types';
import { HttpError } from './errors';

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
  if (!source) throw new HttpError('不支持的镜像源', 400);
  return source;
}

export function sourceFrom(url: URL) {
  return url.searchParams.get('source') || AUTO_SOURCE;
}

export function usesDockerHubNaming(source: string) {
  return source === AUTO_SOURCE || source === DOCKER_HUB_MIRROR_SOURCE;
}

/** Only the reserved namespace carries an explicit source; ordinary namespaces remain intact. */
export function sourceProxyTarget(env: Env, pathname: string) {
  if (!pathname.startsWith('/v2/dkbst/')) return { source: undefined, path: pathname };
  const match = pathname.match(/^\/v2\/dkbst\/([a-z0-9-]+)(\/.*)$/);
  if (!match) throw new HttpError('无效的镜像源路径', 400);
  return { source: registrySource(env, match[1]).id, path: `/v2${match[2]}` };
}
