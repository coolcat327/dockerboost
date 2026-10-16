import { Hono } from 'hono';
import type { ApiEnv } from '../../common/types';
import { getRoute } from '../../common/http';
import { catalogResponse, assetResponse, planResponse, scriptResponse } from './handlers';

export const installRoutes = new Hono<ApiEnv>();
getRoute(installRoutes, '/catalog', c => catalogResponse(c.req.raw));
getRoute(installRoutes, '/asset', c => assetResponse(c.req.raw));
getRoute(installRoutes, '/plan', c => planResponse(c.req.raw));
getRoute(installRoutes, '/script', c => scriptResponse(c.req.raw));
