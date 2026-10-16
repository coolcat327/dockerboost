import { Hono } from 'hono';
import type { ApiEnv } from '../../common/types';
import { getRoute } from '../../common/http';
import { healthResponse, sourcesResponse } from './responses';

export const statusRoutes = new Hono<ApiEnv>();
getRoute(statusRoutes, '/health', c => healthResponse(c.env));
getRoute(statusRoutes, '/sources', c => sourcesResponse(c.env));
