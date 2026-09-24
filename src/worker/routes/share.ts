import { HttpError } from '../errors';

const allowedTabs = new Set(['pull', 'download']);
const validSource = /^[a-z0-9][a-z0-9-]{0,63}$/;
const validPlatform = /^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/;
const readableValue = (value: string) => encodeURIComponent(value).replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%40/gi, '@');

export async function shareResponse(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const tab = query.get('tab');
  const image = query.get('image');
  const source = query.get('source');
  const platform = query.get('platform');
  if (!tab || !allowedTabs.has(tab)) throw new HttpError('分享页面无效', 400);
  if (image === null || !image.trim() || image.length > 512) throw new HttpError('镜像名无效', 400);
  if (source === null || !validSource.test(source)) throw new HttpError('镜像源无效', 400);
  if (platform === null || (platform && (platform.length > 128 || !validPlatform.test(platform)))) throw new HttpError('目标架构无效', 400);

  const url = new URL(request.url);
  url.pathname = '/';
  url.search = '';
  url.hash = `${tab}?image=${readableValue(image)}&source=${source}&platform=${readableValue(platform)}`;
  return Response.json({ url: url.toString() }, { headers: { 'Cache-Control': 'no-store' } });
}
