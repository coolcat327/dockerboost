import { HttpError } from '../../common/errors';

const composeArch: Record<string, string> = { x86_64: 'x86_64', aarch64: 'aarch64', armhf: 'armv7', ppc64le: 'ppc64le', s390x: 's390x' };

export async function upstream(url: string) {
  const host = new URL(url).hostname;
  const label = host === 'download.docker.com' ? 'Docker 静态文件源' : host === 'api.github.com' ? 'GitHub Compose API' : 'GitHub Compose 发布页';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'DockerBoost', Accept: host === 'api.github.com' ? 'application/vnd.github+json' : '*/*' },
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (error) {
    console.error(`${label}请求失败`, error);
    throw new HttpError(`${label}连接失败或超时`, 502);
  } finally {
    // Only time out waiting for response headers; binary bodies remain streaming.
    clearTimeout(timer);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(`${label}返回 ${response.status}`, 502);
  }
  return response;
}

export async function latestComposeVersion(arch: string): Promise<string> {
  // GitHub's latest release redirect selects the latest official non-prerelease.
  const release = await upstream('https://github.com/docker/compose/releases/latest');
  const version = new URL(release.url).pathname.match(/^\/docker\/compose\/releases\/tag\/v(\d+\.\d+\.\d+)$/)?.[1];
  await release.body?.cancel();
  if (!version) throw new HttpError('GitHub Compose 最新发布版本无法识别，请稍后刷新', 502);
  const assets = await (await upstream(`https://github.com/docker/compose/releases/expanded_assets/v${version}`)).text();
  const path = `/docker/compose/releases/download/v${version}/docker-compose-linux-${composeArch[arch]}`;
  if (!assets.includes(`href="${path}"`)) throw new HttpError(`Compose 最新版本 ${version} 没有 ${arch} 架构文件`, 400);
  return version;
}
