import { jsonResponse } from '../../common/http';
import type { Env, ImageConfig, Manifest } from '../../common/types';
import { requestedImage, imageForSource, resolveImage } from '../../common/images';
import { registryPublicFetch, OCI_ACCEPT } from '../../common/registry';
import { upstreamError } from '../../common/errors';

export async function inspectImageResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url, env);
  const { manifest, platform, source: resolvedSource } = await resolveImage(env, image, url.searchParams.get('platform') || 'linux/amd64', source, request.signal);
  const sizes = new Map<string, number>();
  let valid = true;
  for (const descriptor of [manifest.config!, ...manifest.layers!]) {
    if (!descriptor || typeof descriptor.digest !== 'string') { valid = false; break; }
    const { digest, size } = descriptor;
    if (!digest || !Number.isSafeInteger(size) || size < 0 || (sizes.has(digest) && sizes.get(digest) !== size)) { valid = false; break; }
    sizes.set(digest, size);
  }
  const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  const sizeBytes = valid && Number.isSafeInteger(total) ? total : null;
  return jsonResponse({ image: image.display, layers: manifest.layers?.length || 0, platform, source: resolvedSource, sizeBytes });
}

export async function platformResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url, env);
  const response = await registryPublicFetch(env, (candidate) => `/v2/${imageForSource(env, image, candidate.id).repo}/manifests/${image.reference}`, { headers: { accept: OCI_ACCEPT }, signal: request.signal }, source);
  if (!response.ok) {
    const error = upstreamError(response.status, `镜像仓库返回 ${response.status}`);
    return jsonResponse({ error: error.message }, { status: error.status });
  }
  const manifest = await response.clone().json<Manifest>().catch(() => undefined);
  if (!manifest?.config || Array.isArray(manifest.manifests)) return response;

  const resolvedSource = response.headers.get('x-dockerboost-source') || source;
  const repository = imageForSource(env, image, resolvedSource).repo;
  let configResponse: Response;
  try {
    configResponse = await registryPublicFetch(env, `/v2/${repository}/blobs/${manifest.config.digest}`, { signal: request.signal }, resolvedSource);
  } catch (error) {
    if (request.signal.aborted) throw error;
    return response;
  }
  if (!configResponse.ok) {
    void configResponse.body?.cancel().catch(() => {});
    return response;
  }
  let config: ImageConfig;
  try {
    config = await configResponse.json<ImageConfig>();
  } catch (error) {
    if (request.signal.aborted) throw error;
    return response;
  }
  if (!config?.os || !config.architecture) return response;

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  void response.body?.cancel().catch(() => {});
  return jsonResponse({ ...manifest, platforms: [[config.os, config.architecture, config.variant].filter(Boolean).join('/')] }, { headers });
}
