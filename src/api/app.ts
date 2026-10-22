import { jsonResponse } from './common/http';
import { Hono } from 'hono';
import type { ApiEnv, Env } from './common/types';
import { HttpError } from './common/errors';
import { installRoutes } from './routes/install/index';
import { imagesRoutes } from './routes/images/index';
import { downloadRoutes } from './routes/download/index';
import { registryRoutes } from './routes/registry/index';
import { shareRoutes } from './routes/share/index';
import { statusRoutes } from './routes/status/index';

export function createApiApp(fallback?: (request: Request, env: Env) => Response | Promise<Response>) {
  const app = new Hono<ApiEnv>();
  app.route('/api/install', installRoutes);
  app.route('/api', imagesRoutes);
  app.route('/api', downloadRoutes);
  app.route('/api', shareRoutes);
  app.route('/api', statusRoutes);
  app.route('/', registryRoutes);

  app.onError((error) => jsonResponse({ error: error.message || '服务暂时不可用' }, { status: error instanceof HttpError ? error.status : 500 }));
  app.notFound(c => c.req.path === '/api' || c.req.path.startsWith('/api/')
    ? jsonResponse({ error: '接口不存在' }, { status: 404 })
    : fallback ? fallback(c.req.raw, c.env) : new Response('Not Found', { status: 404 }));

  return app;
}
