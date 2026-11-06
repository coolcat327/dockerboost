import type { Env, Descriptor, Manifest, ImageConfig } from './types';
import { registryPublicFetch, OCI_ACCEPT } from './registry';
import { HttpError, upstreamError } from './errors';
import { registrySources, sourceFrom, usesDockerHubNaming } from './sources';
import { splitImageReference } from '../../common/image-syntax.js';

export function requestedImage(url: URL, env: Env) {
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
  const image = parseImage(input, false);
  const display = matched && host !== 'docker.io' ? `${host}/${image.display}` : image.display;
  return { source, image, display };
}

export function parseImage(input: string, dockerHubPath = true) {
  const clean = input.trim().replace(/^docker\.io\//, "").replace(/^https?:\/\//, "").replace(/^\/+/, "");
  if (!clean || /[^a-zA-Z0-9._/@:-]/.test(clean)) throw new HttpError("镜像名包含不支持的字符", 400);
  const parts = splitImageReference(clean);
  if (!parts) throw new HttpError('无效的镜像名或引用', 400);
  const { repository: sourceRepo, reference: sourceRef, digest } = parts;
  const normalizedSourceRepo = dockerHubPath && !sourceRepo.includes("/") ? `library/${sourceRepo}` : sourceRepo;
  return { repo: normalizedSourceRepo, reference: sourceRef, display: digest ? clean : `${sourceRepo}:${sourceRef}` };
}

export function imageForSource(env: Env, image: ReturnType<typeof parseImage>, source: string) {
  return parseImage(image.display, usesDockerHubNaming(env, source));
}

function parsePlatform(value: string) {
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?$/i.test(value)) throw new HttpError("无效的目标架构", 400);
  const [os, architecture, variant] = value.split("/");
  return { os, architecture, variant };
}

function platformName(platform: NonNullable<Descriptor["platform"]>) {
  return [platform.os, platform.architecture, platform.variant].filter(Boolean).join("/");
}

async function directManifestPlatform(env: Env, image: ReturnType<typeof parseImage>, manifest: Manifest, source: string, signal?: AbortSignal) {
  if (!manifest.config) return undefined;
  try {
    const response = await registryPublicFetch(env, `/v2/${image.repo}/blobs/${manifest.config.digest}`, { signal }, source);
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return undefined;
    }
    const config = await response.json<ImageConfig>();
    return config?.os && config.architecture ? config : undefined;
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}

export async function resolveImage(env: Env, image: ReturnType<typeof parseImage>, requestedPlatform = "linux/amd64", requestedSource = "auto", signal?: AbortSignal) {
  const platform = parsePlatform(requestedPlatform);
  const manifestResponse = await registryPublicFetch(env, (candidate) => `/v2/${imageForSource(env, image, candidate.id).repo}/manifests/${image.reference}`, { headers: { accept: OCI_ACCEPT }, signal }, requestedSource);
  if (!manifestResponse.ok) throw upstreamError(manifestResponse.status, `镜像仓库返回 ${manifestResponse.status}`);
  const source = manifestResponse.headers.get("x-dockerboost-source") || requestedSource;
  const resolvedImage = imageForSource(env, image, source);
  let manifest = await manifestResponse.json<Manifest>();
  let resolvedPlatform = requestedPlatform;
  let platformVerified = false;
  if (manifest.manifests) {
    const matching = manifest.manifests.filter((item) => item.platform?.os === platform.os && item.platform?.architecture === platform.architecture);
    const descriptor = matching.find((item) => (item.platform?.variant || undefined) === platform.variant)
      || (!platform.variant ? matching[0] : undefined);
    if (!descriptor) throw new HttpError(`未找到 ${requestedPlatform} 平台镜像`, 404);
    resolvedPlatform = platformName(descriptor.platform!);
    platformVerified = true;
    const response = await registryPublicFetch(env, `/v2/${resolvedImage.repo}/manifests/${descriptor.digest}`, { headers: { accept: OCI_ACCEPT }, signal }, source);
    if (!response.ok) throw upstreamError(response.status, `无法解析镜像平台 (${response.status})`);
    manifest = await response.json<Manifest>();
  } else {
    const directPlatform = await directManifestPlatform(env, resolvedImage, manifest, source, signal);
    if (directPlatform && (directPlatform.os !== platform.os || directPlatform.architecture !== platform.architecture
      || (platform.variant && directPlatform.variant !== platform.variant))) throw new HttpError(`未找到 ${platformName(platform)} 平台镜像`, 404);
    if (directPlatform) { resolvedPlatform = platformName(directPlatform); platformVerified = true; }
  }
  if (!manifest.config || !Array.isArray(manifest.layers)) throw new HttpError("该镜像不是可导出的 OCI 镜像", 422);
  return { manifest, platform: resolvedPlatform, platformVerified, source, repository: resolvedImage.repo };
}
