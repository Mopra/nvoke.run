// Operator alerts: email to whoever runs nvoke, through the Day3 API.
// https://docs.day3.app
//
// An alert has a key. The same key goes out at most once per `everyMs`,
// across every worker, so a failing source does not flood the inbox.
// Without DAY3_API_KEY or ALERT_EMAIL_TO alerts are only logged.

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import type { FetchLike } from './leads/http.js';

export const DAY3_EMAILS_URL = 'https://go.day3.app/api/v1/emails';

export interface Alert {
  /** Dedupe key, for example "source-unavailable:brave". */
  key: string;
  subject: string;
  text: string;
  /** Minimum time between two sends of this key. Default one hour. */
  everyMs?: number;
}

export interface Alerter {
  /** Never throws. Resolves true when the alert was emailed. */
  send(alert: Alert): Promise<boolean>;
}

export interface AlerterOptions {
  sql: Sql;
  log: Logger;
  apiKey?: string;
  to: string[];
  from?: string;
  fetch?: FetchLike;
  now?: () => Date;
}

export function createAlerter(opts: AlerterOptions): Alerter {
  const doFetch = opts.fetch ?? fetch;
  return {
    async send(alert) {
      const now = opts.now?.() ?? new Date();
      const everyMs = alert.everyMs ?? 60 * 60_000;
      try {
        // Claims the key: a row comes back only when it was never sent or its interval has passed.
        const claimed = await opts.sql`
          insert into alerts_sent (key, sent_at) values (${alert.key}, ${now.toISOString()})
          on conflict (key) do update set sent_at = excluded.sent_at
          where alerts_sent.sent_at < ${new Date(now.getTime() - everyMs).toISOString()}::timestamptz
          returning key
        `;
        if (claimed.length === 0) return false;
        opts.log.error({ alert: alert.key, subject: alert.subject }, 'alert');
        if (!opts.apiKey || opts.to.length === 0 || !opts.from) return false;

        const res = await doFetch(DAY3_EMAILS_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': `nvoke-alert:${alert.key}:${now.getTime()}`,
          },
          body: JSON.stringify({ from: opts.from, to: opts.to, subject: `[nvoke] ${alert.subject}`, text: alert.text }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          opts.log.error({ alert: alert.key, status: res.status, body: (await res.text()).slice(0, 300) }, 'alert: email failed');
          return false;
        }
        return true;
      } catch (err) {
        opts.log.error({ err, alert: alert.key }, 'alert: could not send');
        return false;
      }
    },
  };
}
