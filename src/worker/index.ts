import type { Env } from './types';
import { downloadScript } from './download-script';
import { parseImage, resolveImage } from './images';
import { registryFetch, registryPublicFetch, proxyHeaders, passthrough, OCI_ACCEPT } from './registry';
import { registrySources, sourceFrom, sourceProxyTarget, usesDockerHubNaming } from './sources';

function requestedImage(url: URL) {
  const source = sourceFrom(url);
  return { source, image: parseImage(url.searchParams.get('image') || '', usesDockerHubNaming(source)) };
}

async function inspectImage(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url);
  const { manifest, platform, source: resolvedSource } = await resolveImage(env, image, url.searchParams.get("platform") || "linux/amd64", source);
  return Response.json({ image: image.display, layers: manifest.layers?.length || 0, platform, source: resolvedSource });
}

async function platformManifest(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url);
  if (source === 'auto') {
    const nativeImage = parseImage(url.searchParams.get('image') || '', false);
    return registryPublicFetch(env, (candidate) => {
      const repository = usesDockerHubNaming(candidate.id) ? image.repo : nativeImage.repo;
      return `/v2/${repository}/manifests/${nativeImage.reference}`;
    }, { headers: { accept: OCI_ACCEPT } }, source);
  }
  return registryPublicFetch(env, `/v2/${image.repo}/manifests/${image.reference}`, { headers: { accept: OCI_ACCEPT } }, source);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return Response.json({ ok: true, registry: new URL(registrySources(env)[0].url).hostname, sources: registrySources(env).map(({ id, label }) => ({ id, label })) });
      if (url.pathname === "/api/sources") return Response.json({ sources: registrySources(env).map(({ id, label, url }) => ({ id, label, host: new URL(url).hostname })) });
      if (url.pathname === "/api/download-script") {
        if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
        const { source, image } = requestedImage(url);
        const { manifest, source: resolvedSource } = await resolveImage(env, image, url.searchParams.get("platform") || "linux/amd64", source);
        return new Response(downloadScript(url.origin, image.repo, image.display, manifest.config!, manifest.layers!, url.searchParams.get('platform') || 'linux/amd64', resolvedSource), {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
        });
      }
      if (url.pathname === "/api/save") {
        return Response.json({ error: "Use the browser exporter or generated curl download script. This Worker does not build image archives." }, { status: 410 });
      }
      if (url.pathname === "/api/inspect") {
        if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
        return await inspectImage(request, env);
      }
      if (url.pathname === "/api/platforms") {
        if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
        return await platformManifest(request, env);
      }
      if (url.pathname === "/v2" || url.pathname.startsWith("/v2/")) {
        const proxy = sourceProxyTarget(env, url.pathname);
        const source = url.searchParams.get("source") || proxy.source;
        url.searchParams.delete("source");
        const readOnly = ["GET", "HEAD"].includes(request.method);
        const init = { method: request.method, headers: proxyHeaders(request), body: readOnly ? undefined : request.body };
        const response = readOnly || source
          ? await registryPublicFetch(env, proxy.path + url.search, init, source || "auto")
          : await registryFetch(env, proxy.path + url.search, init);
        return passthrough(response);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "服务暂时不可用" }, { status: 400 });
    }
  }
};
