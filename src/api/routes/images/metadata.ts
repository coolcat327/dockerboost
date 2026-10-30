import { jsonResponse } from '../../common/http';
import type { Env, ImageConfig, Manifest } from '../../common/types';
import { requestedImage, imageForSource, resolveImage } from '../../common/images';
import { registryPublicFetch, OCI_ACCEPT } from '../../common/registry';
import { upstreamError } from '../../common/errors';

export async function inspectImageResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url, env);
  const { manifest, platform, source: resolvedSource } = await resolveImage(env, image, url.searchParams.get('platform') || 'linux/amd64', source);
  const sizes = [manifest.config!, ...manifest.layers!].map((descriptor) => descriptor.size);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const sizeBytes = sizes.every((size) => Number.isSafeInteger(size) && size >= 0) && Number.isSafeInteger(total) ? total : null;
  return jsonResponse({ image: image.display, layers: manifest.layers?.length || 0, platform, source: resolvedSource, sizeBytes });
}

export async function platformResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url, env);
  const response = await registryPublicFetch(env, (candidate) => `/v2/${imageForSource(env, image, candidate.id).repo}/manifests/${image.reference}`, { headers: { accept: OCI_ACCEPT } }, source);
  if (!response.ok) {
    const error = upstreamError(response.status, `镜像仓库返回 ${response.status}`);
    return jsonResponse({ error: error.message }, { status: error.status });
  }
  const manifest = await response.clone().json<Manifest>().catch(() => undefined);
  if (!manifest?.config || Array.isArray(manifest.manifests)) return response;

  const resolvedSource = response.headers.get('x-dockerboost-source') || source;
  const repository = imageForSource(env, image, resolvedSource).repo;
  const configResponse = await registryPublicFetch(env, `/v2/${repository}/blobs/${manifest.config.digest}`, {}, resolvedSource);
  if (!configResponse.ok) return response;
  const config = await configResponse.json<ImageConfig>().catch(() => undefined);
  if (!config?.os || !config.architecture) return response;

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  return jsonResponse({ ...manifest, platforms: [[config.os, config.architecture, config.variant].filter(Boolean).join('/')] }, { headers });
}
