import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@nvoke/shared';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: app.requireAuth }, async (req): Promise<MeResponse> => {
    // requireAuth has either set req.auth or already replied.
    const auth = req.auth!;
    return { userId: auth.userId, sessionId: auth.sessionId };
  });
}
