import type { Env } from './types';
import { HttpError } from './errors';
import { healthResponse, sourcesResponse } from './routes/status';
import { inspectImageResponse, platformResponse } from './routes/images';
import { downloadScriptResponse, retiredSaveResponse } from './routes/download';
import { registryProxyResponse } from './routes/registry-proxy';
import { shareResponse } from './routes/share';

function getOnly(request: Request) {
  return request.method === 'GET' ? undefined : new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/health') return getOnly(request) || healthResponse(env);
      if (path === '/api/sources') return getOnly(request) || sourcesResponse(env);
      if (path === '/api/download-script') return getOnly(request) || await downloadScriptResponse(request, env);
      if (path === '/api/share') return getOnly(request) || await shareResponse(request);
      if (path === '/api/save') return retiredSaveResponse();
      if (path === '/api/inspect') return getOnly(request) || await inspectImageResponse(request, env);
      if (path === '/api/platforms') return getOnly(request) || await platformResponse(request, env);
      if (path === '/v2' || path.startsWith('/v2/')) return await registryProxyResponse(request, env);
      if (path === '/api' || path.startsWith('/api/')) return Response.json({ error: '接口不存在' }, { status: 404 });
      return env.ASSETS.fetch(request);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : '服务暂时不可用' }, { status: error instanceof HttpError ? error.status : 500 });
    }
  }
};
