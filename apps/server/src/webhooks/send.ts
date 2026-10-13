// Signing and sending one webhook request (docs/SPEC.md, "Webhooks"). The
// signature follows Standard Webhooks, so its libraries verify our requests:
// HMAC SHA-256 over `{id}.{timestamp}.{body}`, keyed with the base64 part of
// the whsec_ secret.

import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { WEBHOOK_SECRET_PREFIX, type WebhookTestResponse } from '@nvoke/shared';
import { checkUrlShape, guardedLookup, WebhookUrlError, type Resolve, type UrlPolicy } from './address.js';

export const WEBHOOK_USER_AGENT = 'nvoke-webhooks/1.0 (+https://nvoke.run/docs/webhooks)';
export const WEBHOOK_TIMEOUT_MS = 10_000;
/** How much of an error answer we keep to show the user. */
const MAX_ERROR_BODY = 200;

export function newWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(24).toString('base64')}`;
}

/** The `webhook-signature` header value. */
export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.slice(WEBHOOK_SECRET_PREFIX.length), 'base64');
  const mac = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${mac}`;
}

export interface WebhookRequest {
  url: string;
  secret: string;
  /** The delivery id, the same on every retry. */
  id: string;
  body: string;
  now?: Date;
}

export type SendResult = WebhookTestResponse;

/** Sends one signed request. Never throws: the outcome says what happened. */
export type WebhookSender = (req: WebhookRequest) => Promise<SendResult>;

export interface SenderOptions extends UrlPolicy {
  timeoutMs?: number;
  resolve?: Resolve;
}

/** node:http(s) with the address guard on the socket and no redirects. */
export function httpSender(opts: SenderOptions): WebhookSender {
  const lookup = guardedLookup(opts, opts.resolve);
  const timeoutMs = opts.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
  return async (req) => {
    const started = Date.now();
    const done = (status: number | null, error: string | null): SendResult => ({
      ok: status !== null && status >= 200 && status < 300,
      status,
      error,
      durationMs: Date.now() - started,
    });
    let url: URL;
    try {
      url = checkUrlShape(req.url, opts);
    } catch (err) {
      return done(null, err instanceof Error ? err.message : 'invalid URL');
    }
    const timestamp = Math.floor((req.now ?? new Date()).getTime() / 1000);
    const headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(req.body)),
      'user-agent': WEBHOOK_USER_AGENT,
      'webhook-id': req.id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': signWebhook(req.secret, req.id, timestamp, req.body),
    };
    const client = url.protocol === 'https:' ? https : http;
    return new Promise<SendResult>((resolve) => {
      const request = client.request(url, { method: 'POST', headers, lookup, timeout: timeoutMs }, (res) => {
        const status = res.statusCode ?? null;
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          if (size < MAX_ERROR_BODY) chunks.push(chunk);
          size += chunk.length;
        });
        res.on('end', () => {
          if (status !== null && status >= 200 && status < 300) return resolve(done(status, null));
          const text = Buffer.concat(chunks).toString('utf8').replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_BODY);
          resolve(done(status, `HTTP ${status}${text ? `: ${text}` : ''}`));
        });
        // A 2xx that never finishes its body still counts: the status line is the answer.
        res.on('error', () => resolve(done(status, status !== null && status >= 200 && status < 300 ? null : `HTTP ${status}`)));
      });
      const hardStop = setTimeout(() => request.destroy(new Error('timeout')), timeoutMs);
      request.on('timeout', () => request.destroy(new Error('timeout')));
      request.on('error', (err: NodeJS.ErrnoException) => {
        const reason =
          err instanceof WebhookUrlError
            ? err.message
            : err.message === 'timeout'
              ? 'timeout'
              : (err.code ?? err.message ?? 'connection failed');
        resolve(done(null, reason));
      });
      request.on('close', () => clearTimeout(hardStop));
      request.end(req.body);
    });
  };
}
