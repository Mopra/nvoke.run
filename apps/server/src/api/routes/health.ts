import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@nvoke/shared';
import { VERSION } from '../../version.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    service: 'api',
    version: VERSION,
    uptimeSeconds: Math.round(process.uptime()),
  }));
}
