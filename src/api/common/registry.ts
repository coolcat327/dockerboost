import type { Env, RegistrySource } from './types';
import { registrySource, registrySources } from './sources';
import { HttpError } from './errors';

export const OCI_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json"
].join(", ");

type RegistryPath = string | ((source: RegistrySource) => string);

function pathForSource(path: RegistryPath, source: RegistrySource) {
  return typeof path === 'function' ? path(source) : path;
}

export function proxyHeaders(request: Request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-encoding", "authorization", "range", "if-none-match", "if-modified-since", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function registryFetch(env: Env, path: string, init: RequestInit = {}, sourceId?: string) {
  const source = sourceId ? registrySource(env, sourceId) : registrySources(env)[0];
  const url = new URL(path, source.url);
  try {
    return await fetch(url, { ...init, headers: init.headers, redirect: "follow" });
  } catch {
    throw new HttpError('镜像源不可用', 502);
  }
}

async function publicFetchFromSource(env: Env, path: RegistryPath, init: RequestInit, source: RegistrySource) {
  const sourcePath = pathForSource(path, source);
  const response = await registryFetch(env, sourcePath, init, source.id);
  if (response.status !== 401) return response;
  const challenge = response.headers.get("www-authenticate") || "";
  const realm = challenge.match(/realm="([^"]+)"/)?.[1];
  if (!realm) return response;
  const tokenUrl = new URL(realm);
  for (const [, key, value] of challenge.matchAll(/(service|scope)="([^"]+)"/g)) tokenUrl.searchParams.set(key, value);
  const tokenResponse = await fetch(tokenUrl, { signal: init.signal });
  if (!tokenResponse.ok) return response;
  const token = await tokenResponse.json<{ token?: string; access_token?: string }>();
  const value = token.token || token.access_token;
  if (!value) return response;
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${value}`);
  return registryFetch(env, sourcePath, { ...init, headers }, source.id);
}

function tagged(response: Response, source: RegistrySource) {
  const headers = new Headers(response.headers);
  headers.set("x-dockerboost-source", source.id);
  return new Response(response.body, { status: response.status, headers });
}

const HEDGE_DELAY_MS = 350;
type Attempt = { source: RegistrySource; controller: AbortController; promise: Promise<{ source: RegistrySource; response?: Response; status?: number }> };

async function hedgedPublicFetch(env: Env, path: RegistryPath, init: RequestInit, sources: RegistrySource[]) {
  const active = new Map<string, Attempt>();
  let next = 0;
  let batchSize = 1;
  let settled = false;
  const launch = (source: RegistrySource) => {
    const controller = new AbortController();
    const promise = publicFetchFromSource(env, path, { ...init, signal: controller.signal }, source)
      .then(async (response) => {
        if (settled && response.ok) await response.body?.cancel().catch(() => {});
        return response.ok ? { source, response } : { source, status: response.status };
      })
      .catch(() => ({ source, status: 502 }));
    active.set(source.id, { source, controller, promise });
  };
  const launchBatch = () => {
    const limit = Math.min(sources.length, next + batchSize);
    while (next < limit) launch(sources[next++]);
    batchSize *= 2;
  };
  const failures: number[] = [];
  launchBatch();
  while (active.size) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = next < sources.length ? new Promise<{ timeout: true }>((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), HEDGE_DELAY_MS); }) : undefined;
    const result = await Promise.race([
      ...[...active.values()].map((attempt) => attempt.promise),
      ...(timeout ? [timeout] : [])
    ]);
    if (timer) clearTimeout(timer);
    if ('timeout' in result) {
      launchBatch();
      continue;
    }
    active.delete(result.source.id);
    if (result.response) {
      settled = true;
      for (const attempt of active.values()) attempt.controller.abort();
      return tagged(result.response, result.source);
    }
    failures.push(result.status || 502);
    if (!active.size && next < sources.length) launchBatch();
  }
  const status = failures.every((value) => value === 404) ? 404 : failures.some((value) => value === 504) ? 504 : 502;
  return new Response(status === 404 ? "Image not found in configured sources" : "Configured image sources are unavailable", { status });
}

export async function registryPublicFetch(env: Env, path: RegistryPath, init: RequestInit = {}, sourceId = "auto") {
  if (sourceId !== "auto") {
    const source = registrySource(env, sourceId);
    return tagged(await publicFetchFromSource(env, path, init, source), source);
  }
  return hedgedPublicFetch(env, path, init, registrySources(env));
}

export function passthrough(response: Response) {
  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "docker-content-digest", "etag", "last-modified", "www-authenticate", "accept-ranges"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("access-control-expose-headers", "Docker-Content-Digest, Content-Range");
  return new Response(response.body, { status: response.status, headers });
}
