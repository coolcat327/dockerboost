import { Hono } from 'hono';
import type { ApiEnv } from '../../common/types';
import { getRoute } from '../../common/http';
import { downloadScriptResponse, retiredSaveResponse } from './terminal';

export const downloadRoutes = new Hono<ApiEnv>();
getRoute(downloadRoutes, '/download-script', c => downloadScriptResponse(c.req.raw, c.env));
downloadRoutes.all('/save', () => retiredSaveResponse());
