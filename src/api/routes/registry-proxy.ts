import type { Env } from '../common/types';
import { registryFetch, registryPublicFetch, proxyHeaders, passthrough } from '../common/registry';
import { sourceProxyTarget } from '../common/sources';
import { HttpError } from '../common/errors';

export async function registryProxyResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const proxy = sourceProxyTarget(env, url.pathname);
  if (proxy.source && url.searchParams.has('source') && url.searchParams.get('source') !== proxy.source) {
    throw new HttpError('路径与查询参数的镜像源不一致', 400);
  }
  const source = url.searchParams.get('source') || proxy.source;
  url.searchParams.delete('source');
  // Browser version identity affects the local cache key, not Registry requests.
  url.searchParams.delete('version');
  const readOnly = ['GET', 'HEAD'].includes(request.method);
  const init = { method: request.method, headers: proxyHeaders(request), body: readOnly ? undefined : request.body };
  const response = readOnly || source
    ? await registryPublicFetch(env, proxy.path + url.search, init, source || 'auto')
    : await registryFetch(env, proxy.path + url.search, init);
  const result = passthrough(response);
  // Digest-addressed blobs are immutable; cache successful reads in the browser.
  const upstreamPolicy = response.headers.get('cache-control') || '';
  if (readOnly && [200, 206].includes(response.status) && /\/blobs\/sha256:[a-f0-9]{64}$/.test(proxy.path) && !/\b(no-store|no-cache)\b/i.test(upstreamPolicy)) {
    result.headers.set('cache-control', 'private, max-age=86400');
  } else if (upstreamPolicy) {
    result.headers.set('cache-control', upstreamPolicy);
  }
  return result;
}
