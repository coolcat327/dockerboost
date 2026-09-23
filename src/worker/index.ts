import type { Env, ImageConfig, Manifest } from './types';
import { downloadScript } from './download-script';
import { imageForSource, parseImage, resolveImage } from './images';
import { registryFetch, registryPublicFetch, proxyHeaders, passthrough, OCI_ACCEPT } from './registry';
import { registrySources, sourceFrom, sourceProxyTarget } from './sources';
import { HttpError, upstreamError } from './errors';

function requestedImage(url: URL, env: Env) {
  let source = sourceFrom(url);
  let input = url.searchParams.get('image') || '';
  const unqualified = input.trim().replace(/^https?:\/\//, '');
  const host = unqualified.split('/')[0].toLowerCase();
  const sources = registrySources(env);
  const matched = sources.find((item) => new URL(item.url).hostname.toLowerCase() === host);
  const explicit = host === 'docker.io' ? 'mirror-gcr' : matched?.id;
  if (explicit) {
    if (source !== 'auto' && source !== explicit) throw new HttpError('镜像地址与指定镜像源不一致', 400);
    if (!sources.some((item) => item.id === explicit)) throw new HttpError('不支持的镜像源', 400);
    source = explicit;
    input = unqualified.slice(host.length + 1);
  } else if (host.includes('.') || host.includes(':')) {
    if (unqualified.includes('/')) throw new HttpError('不支持的镜像源域名', 400);
  }
  return { source, image: parseImage(input, false) };
}

async function inspectImage(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url, env);
  const { manifest, platform, source: resolvedSource } = await resolveImage(env, image, url.searchParams.get("platform") || "linux/amd64", source);
  return Response.json({ image: image.display, layers: manifest.layers?.length || 0, platform, source: resolvedSource });
}

async function platformManifest(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url, env);
  return registryPublicFetch(env, (candidate) => `/v2/${imageForSource(image, candidate.id).repo}/manifests/${image.reference}`, { headers: { accept: OCI_ACCEPT } }, source);
}

async function platformResponse(request: Request, env: Env) {
  const response = await platformManifest(request, env);
  if (!response.ok) {
    const error = upstreamError(response.status, `镜像仓库返回 ${response.status}`);
    return Response.json({ error: error.message }, { status: error.status });
  }
  const manifest = await response.clone().json<Manifest>().catch(() => undefined);
  if (!manifest?.config || Array.isArray(manifest.manifests)) return response;

  const url = new URL(request.url);
  const { source, image } = requestedImage(url, env);
  const resolvedSource = response.headers.get("x-dockerboost-source") || source;
  const repository = imageForSource(image, resolvedSource).repo;
  const configResponse = await registryPublicFetch(env, `/v2/${repository}/blobs/${manifest.config.digest}`, {}, resolvedSource);
  if (!configResponse.ok) return response;
  const config = await configResponse.json<ImageConfig>().catch(() => undefined);
  if (!config?.os || !config.architecture) return response;

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  return Response.json({ ...manifest, platforms: [[config.os, config.architecture, config.variant].filter(Boolean).join("/")] }, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
        return Response.json({ ok: true, registry: new URL(registrySources(env)[0].url).hostname, sources: registrySources(env).map(({ id, label }) => ({ id, label })) });
      }
      if (url.pathname === "/api/sources") {
        if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
        return Response.json(
        { sources: registrySources(env).map(({ id, label, url }) => ({ id, label, host: new URL(url).hostname })) },
        { headers: { "cache-control": "public, max-age=300, s-maxage=3600" } }
      );
      }
      if (url.pathname === "/api/download-script") {
        if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: 'GET' } });
        const { source, image } = requestedImage(url, env);
        const { manifest, source: resolvedSource, repository } = await resolveImage(env, image, url.searchParams.get("platform") || "linux/amd64", source);
        return new Response(downloadScript(url.origin, repository, image.display, manifest.config!, manifest.layers!, url.searchParams.get('platform') || 'linux/amd64', resolvedSource), {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
        });
      }
      if (url.pathname === "/api/save") {
        return Response.json({ error: "Use the browser exporter or generated curl download script. This Worker does not build image archives." }, { status: 410 });
      }
      if (url.pathname === "/api/inspect") {
        if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: 'GET' } });
        return await inspectImage(request, env);
      }
      if (url.pathname === "/api/platforms") {
        if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: 'GET' } });
        return await platformResponse(request, env);
      }
      if (url.pathname === "/v2" || url.pathname.startsWith("/v2/")) {
        const proxy = sourceProxyTarget(env, url.pathname);
        if (proxy.source && url.searchParams.has('source') && url.searchParams.get('source') !== proxy.source) throw new HttpError('路径与查询参数的镜像源不一致', 400);
        const source = url.searchParams.get("source") || proxy.source;
        url.searchParams.delete("source");
        const readOnly = ["GET", "HEAD"].includes(request.method);
        const init = { method: request.method, headers: proxyHeaders(request), body: readOnly ? undefined : request.body };
        const response = readOnly || source
          ? await registryPublicFetch(env, proxy.path + url.search, init, source || "auto")
          : await registryFetch(env, proxy.path + url.search, init);
        return passthrough(response);
      }
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return Response.json({ error: '接口不存在' }, { status: 404 });
      return env.ASSETS.fetch(request);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "服务暂时不可用" }, { status: error instanceof HttpError ? error.status : 500 });
    }
  }
};
