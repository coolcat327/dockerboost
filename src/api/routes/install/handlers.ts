import { jsonResponse } from '../../common/http';
import { upstream, latestComposeVersion, architectures, composeAssetPath } from './releases';
import { installFiles } from './bundle';
import { bundleDownloadScript } from './offline-bundle-script';
import { HttpError } from '../../common/errors';

const versionPattern = /^\d+\.\d+\.\d+$/;
function architecture(url: URL) {
  const arch = url.searchParams.get('arch') || 'x86_64';
  if (!architectures.includes(arch)) throw new HttpError('架构无效', 400);
  return arch;
}
function options(url: URL) {
  const arch = architecture(url);
  const docker = url.searchParams.get('docker') || '';
  const compose = url.searchParams.get('compose') || '';
  if (!versionPattern.test(docker) || !versionPattern.test(compose)) throw new HttpError('版本或架构无效', 400);
  return { arch, docker, compose };
}
export async function catalogResponse(request: Request) {
  const arch = architecture(new URL(request.url));
  const [listing, compose] = await Promise.all([
    upstream(`https://download.docker.com/linux/static/stable/${arch}/`).then(r => r.text()),
    latestComposeVersion(arch)
  ]);
  const docker = [...new Set([...listing.matchAll(/href="docker-(\d+\.\d+\.\d+)\.tgz"/g)].map(m => m[1]))].sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
  return jsonResponse({ docker, compose }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
export async function assetResponse(request: Request) {
  const url = new URL(request.url);
  const selected = options(url);
  const kind = url.searchParams.get('kind');
  if (kind !== 'docker' && kind !== 'compose') throw new HttpError('文件类型无效', 400);
  const dockerUrl = `https://download.docker.com/linux/static/stable/${selected.arch}/docker-${selected.docker}.tgz`;
  const composeUrl = `https://github.com${composeAssetPath(selected.arch, selected.compose)}`;
  const response = await upstream(kind === 'docker' ? dockerUrl : composeUrl);
  return new Response(response.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', ...(response.headers.has('content-length') ? { 'Content-Length': response.headers.get('content-length')! } : {}) } });
}
export function planResponse(request: Request) {
  const url = new URL(request.url), selected = options(url);
  return jsonResponse({ files: installFiles(selected.arch, selected.docker, selected.compose, url.origin) }, { headers: { 'Cache-Control': 'no-store' } });
}
export function scriptResponse(request: Request) {
  const url = new URL(request.url), selected = options(url);
  const files = installFiles(selected.arch, selected.docker, selected.compose, url.origin);
  const name = `docker-offline-${selected.arch}-docker-${selected.docker}-compose-${selected.compose}`;
  const assetUrl = (kind: 'docker' | 'compose') => {
    const asset = new URL('/api/install/asset', url.origin);
    asset.search = new URLSearchParams({ arch: selected.arch, docker: selected.docker, compose: selected.compose, kind }).toString();
    const version = url.searchParams.get('version');
    if (version) asset.searchParams.set('version', version);
    return asset.href;
  };
  return new Response(bundleDownloadScript(files, name, selected.docker, assetUrl('docker'), assetUrl('compose')), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
