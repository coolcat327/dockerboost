import type { Env, Descriptor, Manifest, ImageConfig } from './types';
import { registryPublicFetch, OCI_ACCEPT } from './registry';
import { HttpError, upstreamError } from './errors';
import { usesDockerHubNaming } from './sources';

export function parseImage(input: string, dockerHubPath = true) {
  const clean = input.trim().replace(/^docker\.io\//, "").replace(/^https?:\/\//, "").replace(/^\/+/, "");
  if (!clean || /[^a-zA-Z0-9._/@:-]/.test(clean)) throw new HttpError("镜像名包含不支持的字符", 400);
  const digestMarker = clean.indexOf("@");
  const lastSlash = clean.lastIndexOf("/");
  const lastColon = clean.lastIndexOf(":");
  const tagged = digestMarker < 0 && lastColon > lastSlash;
  const sourceRepo = tagged ? clean.slice(0, lastColon) : digestMarker >= 0 ? clean.slice(0, digestMarker) : clean;
  const sourceRef = digestMarker >= 0 ? clean.slice(digestMarker + 1) : tagged ? clean.slice(lastColon + 1) : "latest";
  if (!sourceRepo.split('/').every((segment) => segment && segment !== '.' && segment !== '..') || !sourceRef || sourceRef.includes('/')) {
    throw new HttpError('无效的镜像名或引用', 400);
  }
  const normalizedSourceRepo = dockerHubPath && !sourceRepo.includes("/") ? `library/${sourceRepo}` : sourceRepo;
  return { repo: normalizedSourceRepo, reference: sourceRef, display: digestMarker >= 0 ? clean : `${sourceRepo}:${sourceRef}` };
}

export function imageForSource(image: ReturnType<typeof parseImage>, source: string) {
  return parseImage(image.display, usesDockerHubNaming(source));
}

function parsePlatform(value: string) {
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?$/i.test(value)) throw new HttpError("无效的目标架构", 400);
  const [os, architecture, variant] = value.split("/");
  return { os, architecture, variant };
}

function platformName(platform: NonNullable<Descriptor["platform"]>) {
  return [platform.os, platform.architecture, platform.variant].filter(Boolean).join("/");
}

async function directManifestPlatform(env: Env, image: ReturnType<typeof parseImage>, manifest: Manifest, source: string) {
  if (!manifest.config) return undefined;
  const response = await registryPublicFetch(env, `/v2/${image.repo}/blobs/${manifest.config.digest}`, {}, source);
  if (!response.ok) return undefined;
  const config = await response.json<ImageConfig>();
  return config.os && config.architecture ? platformName(config) : undefined;
}

export async function resolveImage(env: Env, image: ReturnType<typeof parseImage>, requestedPlatform = "linux/amd64", requestedSource = "auto") {
  const platform = parsePlatform(requestedPlatform);
  const manifestResponse = await registryPublicFetch(env, (candidate) => `/v2/${imageForSource(image, candidate.id).repo}/manifests/${image.reference}`, { headers: { accept: OCI_ACCEPT } }, requestedSource);
  if (!manifestResponse.ok) throw upstreamError(manifestResponse.status, `镜像仓库返回 ${manifestResponse.status}`);
  const source = manifestResponse.headers.get("x-dockerboost-source") || requestedSource;
  const resolvedImage = imageForSource(image, source);
  let manifest = await manifestResponse.json<Manifest>();
  if (manifest.manifests) {
    const descriptor = manifest.manifests.find((item) => item.platform?.os === platform.os && item.platform?.architecture === platform.architecture && (!platform.variant || item.platform?.variant === platform.variant));
    if (!descriptor) throw new HttpError(`未找到 ${requestedPlatform} 平台镜像`, 404);
    const response = await registryPublicFetch(env, `/v2/${resolvedImage.repo}/manifests/${descriptor.digest}`, { headers: { accept: OCI_ACCEPT } }, source);
    if (!response.ok) throw upstreamError(response.status, `无法解析镜像平台 (${response.status})`);
    manifest = await response.json<Manifest>();
  } else {
    const directPlatform = await directManifestPlatform(env, resolvedImage, manifest, source);
    if (directPlatform && directPlatform !== platformName(platform)) throw new HttpError(`未找到 ${platformName(platform)} 平台镜像`, 404);
  }
  if (!manifest.config || !manifest.layers) throw new HttpError("该镜像不是可导出的 OCI 镜像", 422);
  return { manifest, platform: requestedPlatform, source, repository: resolvedImage.repo };
}
