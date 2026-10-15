import { upstream, latestComposeVersion } from './releases';
import { installFiles } from './bundle';
import { bundleDownloadScript } from './offline-bundle-script';
export { installFiles } from './bundle';
import { HttpError } from '../../common/errors';

const architectures = ['x86_64', 'aarch64', 'armhf', 'ppc64le', 's390x'] as const;
const composeArch: Record<string, string> = { x86_64: 'x86_64', aarch64: 'aarch64', armhf: 'armv7', ppc64le: 'ppc64le', s390x: 's390x' };
const versionPattern = /^\d+\.\d+\.\d+$/;
function options(url: URL) {
  const arch = url.searchParams.get('arch') || 'x86_64';
  const docker = url.searchParams.get('docker') || '';
  const compose = url.searchParams.get('compose') || '';
  if (!architectures.includes(arch as typeof architectures[number]) || !versionPattern.test(docker) || !versionPattern.test(compose)) throw new HttpError('版本或架构无效', 400);
  return { arch, docker, compose };
}
export async function installResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const arch = url.searchParams.get('arch') || 'x86_64';
  if (!architectures.includes(arch as typeof architectures[number])) throw new HttpError('架构无效', 400);
  if (url.pathname === '/api/install/catalog') {
    const [listing, compose] = await Promise.all([
      upstream(`https://download.docker.com/linux/static/stable/${arch}/`).then(r => r.text()),
      latestComposeVersion(arch)
    ]);
    const docker = [...new Set([...listing.matchAll(/href="docker-(\d+\.\d+\.\d+)\.tgz"/g)].map(m => m[1]))].sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
    return Response.json({ docker, compose }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  }
  const selected = options(url);
  const dockerUrl = `https://download.docker.com/linux/static/stable/${arch}/docker-${selected.docker}.tgz`;
  const composeUrl = `https://github.com/docker/compose/releases/download/v${selected.compose}/docker-compose-linux-${composeArch[arch]}`;
  if (url.pathname === '/api/install/asset') {
    const kind = url.searchParams.get('kind');
    if (kind !== 'docker' && kind !== 'compose') throw new HttpError('文件类型无效', 400);
    const response = await upstream(kind === 'docker' ? dockerUrl : composeUrl);
    return new Response(response.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', ...(response.headers.has('content-length') ? { 'Content-Length': response.headers.get('content-length')! } : {}) } });
  }
  const files = installFiles(arch, selected.docker, selected.compose, url.origin);
  if (url.pathname === '/api/install/plan') return Response.json({ files }, { headers: { 'Cache-Control': 'no-store' } });
  const name = `docker-offline-${arch}-docker-${selected.docker}-compose-${selected.compose}`;
  const assetUrl = (kind: 'docker' | 'compose') => {
    const asset = new URL('/api/install/asset', url.origin);
    asset.search = new URLSearchParams({ arch, docker: selected.docker, compose: selected.compose, kind }).toString();
    const version = url.searchParams.get('version');
    if (version) asset.searchParams.set('version', version);
    return asset.href;
  };
  const script = bundleDownloadScript(files, name, selected.docker, assetUrl('docker'), assetUrl('compose'));
  return new Response(script, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
