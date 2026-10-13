// POST /webhooks/clerk: Clerk Billing events. Any change to a user's
// subscription makes the server re-read that user's plan from Clerk, so the
// event payload never has to be trusted for the plan itself.

import type { FastifyInstance } from 'fastify';
import { verifyWebhook } from '@clerk/backend/webhooks';
import type { Accounts } from '../../leads/accounts.js';

/** The paying user behind a billing event, when it is a user (not an organization). */
export function billingUserId(type: string, data: unknown): string | null {
  if (!type.startsWith('subscription.') && !type.startsWith('subscriptionItem.')) return null;
  const payer = (data as { payer?: { user_id?: unknown } } | null)?.payer;
  return typeof payer?.user_id === 'string' && payer.user_id ? payer.user_id : null;
}

export async function webhookRoutes(
  app: FastifyInstance,
  opts: { signingSecret: string | null; accounts: Accounts },
): Promise<void> {
  // Signature checks need the exact bytes Clerk sent. Scoped to this plugin.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.post('/clerk', async (req, reply) => {
    if (!opts.signingSecret) return reply.code(503).send({ error: 'webhooks are not configured' });

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
    }
    const request = new Request(`http://localhost${req.url}`, {
      method: 'POST',
      headers,
      body: typeof req.body === 'string' ? req.body : '',
    });

    let event: { type: string; data: unknown };
    try {
      event = (await verifyWebhook(request, { signingSecret: opts.signingSecret })) as { type: string; data: unknown };
    } catch {
      req.log.warn('clerk webhook rejected: invalid signature');
      return reply.code(400).send({ error: 'invalid signature' });
    }

    const userId = billingUserId(event.type, event.data);
    if (userId) {
      await opts.accounts.syncPlan(userId);
      req.log.info({ type: event.type, userId }, 'clerk billing event: plan synced');
    }
    return reply.code(204).send();
  });
}
