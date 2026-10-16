import { Hono } from 'hono';
import type { ApiEnv } from '../../common/types';
import { getRoute } from '../../common/http';
import { platformResponse, inspectImageResponse } from './metadata';

export const imagesRoutes = new Hono<ApiEnv>();
getRoute(imagesRoutes, '/platforms', c => platformResponse(c.req.raw, c.env));
getRoute(imagesRoutes, '/inspect', c => inspectImageResponse(c.req.raw, c.env));
