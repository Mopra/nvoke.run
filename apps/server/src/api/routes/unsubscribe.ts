// The unsubscribe link in every sent email (docs/sending/plan.md, RFC 8058).
// Public, no auth: the token is the proof. GET shows a page with one button
// and changes nothing, because link scanners and previews open URLs on
// their own. POST does it: the button, or the mail provider's one-click
// request (`List-Unsubscribe=One-Click` as form data).

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { Sql } from 'postgres';
import type { Secrets } from '../../crypto/secrets.js';
import { readUnsubscribe, unsubscribeByMessage } from '../../sending/unsubscribe.js';

export interface UnsubscribeRoutesOptions {
  getSql: () => Sql;
  /** Null when SECRETS_KEY is unset: no link can be checked. */
  secrets: Secrets | null;
}

function page(reply: FastifyReply, status: number, title: string, body: string) {
  // Plain HTML with the system's own colors, nothing loaded from anywhere.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
  main { max-width: 28rem; padding: 2rem 1rem; }
  h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; }
  p { line-height: 1.5; margin: 0 0 1.25rem; }
  button { font: inherit; padding: 0.6rem 1.2rem; border-radius: 6px; border: 1px solid ButtonBorder; background: ButtonFace; color: ButtonText; cursor: pointer; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
  return reply
    .code(status)
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store')
    .header('x-robots-tag', 'noindex')
    .header('referrer-policy', 'no-referrer')
    .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
    .send(html);
}

const invalid = (reply: FastifyReply) =>
  page(reply, 404, 'Link not valid', '<h1>This link does not work</h1><p>It may be cut short or too old. Reply to the email with "stop" and the sender will not write again.</p>');

export const unsubscribeRoutes: FastifyPluginAsync<UnsubscribeRoutesOptions> = async (app, opts) => {
  // One-click requests come as form data; the body carries nothing we need.
  app.addContentTypeParser(
    ['application/x-www-form-urlencoded', 'multipart/form-data'],
    { parseAs: 'string', bodyLimit: 4096 },
    (_req, body, done) => done(null, body),
  );

  const messageOf = (params: unknown): string | null => {
    const token = (params as { token?: unknown }).token;
    if (!opts.secrets || typeof token !== 'string' || token.length > 200) return null;
    return readUnsubscribe(opts.secrets, token);
  };

  app.get('/u/:token', async (req, reply) => {
    if (!messageOf(req.params)) return invalid(reply);
    return page(
      reply,
      200,
      'Unsubscribe',
      '<h1>Stop these emails?</h1><p>The sender will not write to you again.</p><form method="post"><button type="submit">Unsubscribe</button></form>',
    );
  });

  app.post('/u/:token', async (req, reply) => {
    const id = messageOf(req.params);
    if (!id || !(await unsubscribeByMessage(opts.getSql(), id))) return invalid(reply);
    return page(reply, 200, 'Unsubscribed', '<h1>You are unsubscribed</h1><p>You will not hear from this sender again.</p>');
  });
};
