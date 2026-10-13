import type { FastifyInstance } from 'fastify';
import {
  DesktopAuthorizeRequest,
  DesktopTokenRequest,
  type DesktopAuthorizeResponse,
  type DesktopTokenResponse,
} from '@nvoke/shared';
import { exchangeAuthCode, issueAuthCode } from '../../auth/desktop.js';
import type { DesktopAuthStore } from '../../auth/store.js';

/**
 * Desktop sign-in through the system browser.
 *
 *   POST /v1/desktop/authorize  (Clerk session, from the site) -> one-time code
 *   POST /v1/desktop/token      (no auth, from the desktop main process) -> device token
 *   POST /v1/desktop/sign-out   (device token) -> revokes that device session
 */
export async function desktopRoutes(app: FastifyInstance, opts: { store: DesktopAuthStore }): Promise<void> {
  const { store } = opts;

  app.post('/authorize', { preHandler: app.requireClerkSession }, async (req, reply) => {
    const body = DesktopAuthorizeRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid request' });
    const { code, expiresAt } = await issueAuthCode(store, {
      clerkUserId: req.auth!.userId,
      codeChallenge: body.data.code_challenge,
    });
    const res: DesktopAuthorizeResponse = { code, expiresAt: expiresAt.toISOString() };
    return res;
  });

  app.post('/token', async (req, reply) => {
    const body = DesktopTokenRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid request' });
    const result = await exchangeAuthCode(store, {
      code: body.data.code,
      codeVerifier: body.data.code_verifier,
      deviceName: body.data.device_name ?? null,
      userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
    });
    if (!result.ok) {
      req.log.warn({ reason: result.reason }, 'desktop token exchange refused');
      return reply.code(400).send({ error: result.reason });
    }
    const res: DesktopTokenResponse = { token: result.token };
    return res;
  });

  app.post('/sign-out', { preHandler: app.requireDeviceSession }, async (req, reply) => {
    await store.revokeDeviceSession(req.auth!.deviceSessionId!);
    return reply.code(204).send();
  });
}
