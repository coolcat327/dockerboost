import { jsonResponse } from '../../common/http';
import type { Env } from '../../common/types';
import { downloadScript, validatedBlobs } from './image-archive-script';
import { requestedImage, resolveImage } from '../../common/images';
import { HttpError } from '../../common/errors';
import { archiveFilename } from '../../../common/archive-filename.js';

export async function downloadScriptResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image, display } = requestedImage(url, env);
  const platform = url.searchParams.get('platform') || 'linux/amd64';
  const { manifest, platform: resolvedPlatform, platformVerified, source: resolvedSource, repository } = await resolveImage(env, image, platform, source, request.signal);
  if (!platformVerified) throw new HttpError('无法确认镜像架构，请重试', 502);
  return new Response(downloadScript(url.origin, repository, display, manifest.config!, manifest.layers!, resolvedPlatform, resolvedSource), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export async function downloadPlanResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image, display } = requestedImage(url, env);
  const { manifest, platform, platformVerified, source: resolvedSource, repository } = await resolveImage(env, image, url.searchParams.get('platform') || 'linux/amd64', source, request.signal);
  if (!platformVerified) throw new HttpError('无法确认镜像架构，请重试', 502);
  validatedBlobs(manifest.config!, manifest.layers!);
  return jsonResponse({ image: display, repository, source: resolvedSource, platform, filename: archiveFilename(display, platform), config: manifest.config, layers: manifest.layers }, { headers: { 'Cache-Control': 'no-store' } });
}

export function retiredSaveResponse() {
  return jsonResponse({ error: 'Use the browser exporter or generated curl download script. This Worker does not build image archives.' }, { status: 410 });
}
