import { Hono } from 'hono';
import type { ApiEnv } from '../../common/types';
import { getRoute } from '../../common/http';
import { shareResponse } from './link';

export const shareRoutes = new Hono<ApiEnv>();
getRoute(shareRoutes, '/share', c => shareResponse(c.req.raw));
