import { config } from '../../../config.js';
import type { Env, RegistrySource } from './types';
import { HttpError } from './errors';

export const AUTO_SOURCE = 'auto';
export const DOCKER_HUB_MIRROR_SOURCE = 'mirror-gcr';

function validateSource(source: Partial<RegistrySource>): RegistrySource {
  if (!source || typeof source.id !== 'string' || typeof source.label !== 'string' || !source.label || typeof source.url !== 'string') throw new Error('IMAGE_SOURCES 配置无效');
  const url = new URL(source.url);
  const naming = source.naming ?? (source.id === DOCKER_HUB_MIRROR_SOURCE ? 'docker-hub' : 'native');
  if (!/^[a-z0-9-]+$/.test(source.id) || url.protocol !== 'https:' || !['docker-hub', 'native'].includes(naming) ||
      (source.requiresNamespace !== undefined && typeof source.requiresNamespace !== 'boolean') ||
      (source.example !== undefined && typeof source.example !== 'string')) throw new Error('IMAGE_SOURCES 配置无效');
  return { id: source.id, label: source.label, url: url.origin, naming, requiresNamespace: source.requiresNamespace ?? false, example: source.example };
}

/** The single configuration seam for every registry source exposed by this Worker. */
export function registrySources(env: Env): RegistrySource[] {
  try {
    const value = env.IMAGE_SOURCES ?? config.imageSources;
    const sources = typeof value === 'string' ? JSON.parse(value) : value;
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

export function usesDockerHubNaming(env: Env, source: string) {
  return source === AUTO_SOURCE || registrySource(env, source).naming === 'docker-hub';
}

/** Only the reserved namespace carries an explicit source; ordinary namespaces remain intact. */
export function sourceProxyTarget(env: Env, pathname: string) {
  if (!pathname.startsWith('/v2/dkbst/')) return { source: undefined, path: pathname };
  const match = pathname.match(/^\/v2\/dkbst\/([a-z0-9-]+)(\/.*)$/);
  if (!match) throw new HttpError('无效的镜像源路径', 400);
  return { source: registrySource(env, match[1]).id, path: `/v2${match[2]}` };
}
