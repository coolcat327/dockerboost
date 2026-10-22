import { jsonResponse } from '../../common/http';
import type { Env } from '../../common/types';
import { downloadScript } from './image-archive-script';
import { requestedImage, resolveImage } from '../../common/images';

export async function downloadScriptResponse(request: Request, env: Env) {
  const url = new URL(request.url);
  const { source, image } = requestedImage(url, env);
  const platform = url.searchParams.get('platform') || 'linux/amd64';
  const { manifest, source: resolvedSource, repository } = await resolveImage(env, image, platform, source);
  return new Response(downloadScript(url.origin, repository, image.display, manifest.config!, manifest.layers!, platform, resolvedSource), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export function retiredSaveResponse() {
  return jsonResponse({ error: 'Use the browser exporter or generated curl download script. This Worker does not build image archives.' }, { status: 410 });
}
