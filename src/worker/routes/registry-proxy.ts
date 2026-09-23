import type { Env } from '../types';
import { registryFetch, registryPublicFetch, proxyHeaders, passthrough } from '../registry';
import { sourceProxyTarget } from '../sources';
import { HttpError } from '../errors';

export async function registryProxyResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const proxy = sourceProxyTarget(env, url.pathname);
  if (proxy.source && url.searchParams.has('source') && url.searchParams.get('source') !== proxy.source) {
    throw new HttpError('路径与查询参数的镜像源不一致', 400);
  }
  const source = url.searchParams.get('source') || proxy.source;
  url.searchParams.delete('source');
  const readOnly = ['GET', 'HEAD'].includes(request.method);
  const init = { method: request.method, headers: proxyHeaders(request), body: readOnly ? undefined : request.body };
  const response = readOnly || source
    ? await registryPublicFetch(env, proxy.path + url.search, init, source || 'auto')
    : await registryFetch(env, proxy.path + url.search, init);
  return passthrough(response);
}
