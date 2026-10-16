import { Hono } from 'hono';
import type { ApiEnv } from './common/types';
import { HttpError } from './common/errors';
import { installRoutes } from './routes/install/index';
import { imagesRoutes } from './routes/images/index';
import { downloadRoutes } from './routes/download/index';
import { registryRoutes } from './routes/registry/index';
import { shareRoutes } from './routes/share/index';
import { statusRoutes } from './routes/status/index';

const app = new Hono<ApiEnv>();
app.route('/api/install', installRoutes);
app.route('/api', imagesRoutes);
app.route('/api', downloadRoutes);
app.route('/api', shareRoutes);
app.route('/api', statusRoutes);
app.route('/', registryRoutes);

app.onError((error) => Response.json({ error: error.message || '服务暂时不可用' }, { status: error instanceof HttpError ? error.status : 500 }));
app.notFound(c => c.req.path === '/api' || c.req.path.startsWith('/api/')
  ? Response.json({ error: '接口不存在' }, { status: 404 })
  : c.env.ASSETS.fetch(c.req.raw));

export default app;
