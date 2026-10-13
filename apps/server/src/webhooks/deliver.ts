// The worker's webhook sender (docs/SPEC.md, "Webhooks"). Claims due
// deliveries with SKIP LOCKED, builds each payload from the current data,
// sends it signed and schedules a retry on failure.

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import type { Company, Search, WebhookEvent, WebhookPayload, WebhookSearchRef } from '@nvoke/shared';
import { toSearch } from '../leads/repo.js';
import { domainSuppressedSql, suppressedSql } from '../leads/suppression.js';
import type { WebhookSender } from './send.js';

/** Wait after the nth failed attempt. One more failure after the last ends the delivery. */
export const RETRY_DELAYS_MS = [5_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 5 * 3_600_000, 10 * 3_600_000, 10 * 3_600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Deliveries one tick sends at once. */
export const DELIVERY_BATCH = 20;
/** How long a claimed delivery stays claimed: well past the request timeout. */
const LOCK_MS = 60_000;

interface ClaimedRow {
  id: string;
  webhook_id: string;
  event: WebhookEvent;
  search_id: string;
  company_id: string | null;
  attempts: number;
  created_at: Date;
  url: string;
  secret: string;
  clerk_user_id: string;
}

interface SearchRow {
  id: string;
  kind: Search['kind'];
  params: Record<string, unknown>;
  limit: number;
  status: Search['status'];
  error: string | null;
  companies_found: number;
  companies_crawled: number;
  emails_found: number;
  emails_valid: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  drop_id: string | null;
}

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

async function loadSearch(sql: Sql, userId: string, id: string): Promise<SearchRow | null> {
  const [row] = await sql<SearchRow[]>`
    select id, kind, params, "limit", status, error, companies_found, companies_crawled, emails_found, emails_valid,
           created_at, started_at, finished_at, drop_id
    from searches where id = ${id} and clerk_user_id = ${userId}
  `;
  return row ?? null;
}

function searchRef(s: SearchRow): WebhookSearchRef {
  const dropName = s.params['dropName'];
  return { id: s.id, kind: s.kind, dropId: s.drop_id, dropName: typeof dropName === 'string' ? dropName : null };
}

interface CompanyRow {
  id: string;
  name: string;
  domain: string;
  website: string;
  source: string;
  source_ref: string | null;
  location: string | null;
  phone: string | null;
  category: string | null;
  crawl_status: Company['crawlStatus'];
  crawled_at: Date | null;
  local_crawl: Company['localCrawl'];
  emails: Array<{
    id: string;
    address: string;
    kind: 'generic' | 'personal';
    source_url: string | null;
    verification: NonNullable<Company['emails'][number]['verification']>;
    checked_at: string | null;
  }>;
}

/** The company as the API shows it: checked addresses we may still hand over. Null when there is no valid one left. */
async function loadLead(sql: Sql, userId: string, companyId: string): Promise<Company | null> {
  const [row] = await sql<CompanyRow[]>`
    select c.id, c.name, c.domain, c.website, c.source, c.source_ref, c.location, c.phone, c.category,
           c.crawl_status, c.crawled_at, c.local_crawl,
           coalesce(
             json_agg(json_build_object(
               'id', e.id, 'address', e.address, 'kind', e.kind, 'source_url', e.source_url,
               'verification', e.verification, 'checked_at', e.checked_at
             ) order by e.kind, e.address) filter (where e.id is not null),
             '[]'::json
           ) as emails
    from companies c
    left join emails e on e.company_id = c.id and e.verification is not null and not ${suppressedSql(sql, 'e.address')}
    where c.id = ${companyId} and c.clerk_user_id = ${userId} and not ${domainSuppressedSql(sql, 'c.domain')}
    group by c.id
  `;
  if (!row || !row.emails.some((e) => e.verification === 'valid')) return null;
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    website: row.website,
    source: row.source,
    sourceRef: row.source_ref,
    location: row.location,
    phone: row.phone,
    category: row.category,
    crawlStatus: row.crawl_status,
    crawledAt: iso(row.crawled_at),
    localCrawl: row.local_crawl,
    emails: row.emails.map((e) => ({
      id: e.id,
      address: e.address,
      kind: e.kind,
      sourceUrl: e.source_url,
      verification: e.verification,
      checkedAt: iso(e.checked_at),
    })),
  };
}

/** The body for a delivery from the current data, or null when what it was about is gone. */
export async function buildPayload(
  sql: Sql,
  d: Pick<ClaimedRow, 'event' | 'search_id' | 'company_id' | 'clerk_user_id' | 'created_at'>,
): Promise<WebhookPayload | null> {
  const search = await loadSearch(sql, d.clerk_user_id, d.search_id);
  if (!search) return null;
  const timestamp = d.created_at.toISOString();
  if (d.event === 'search.finished') {
    return { type: 'search.finished', timestamp, data: { search: toSearch(search) } };
  }
  if (!d.company_id) return null;
  const company = await loadLead(sql, d.clerk_user_id, d.company_id);
  if (!company) return null;
  return { type: 'lead.ready', timestamp, data: { search: searchRef(search), company } };
}

export interface DeliverDeps {
  sql: Sql;
  send: WebhookSender;
  log: Logger;
  now?: () => Date;
}

export interface DeliverResult {
  delivered: number;
  failed: number;
  retrying: number;
  skipped: number;
}

/** Claims and sends one batch of due deliveries. */
export async function deliverDue(deps: DeliverDeps): Promise<DeliverResult> {
  const { sql } = deps;
  // The database clock decides what is due unless a test fixes the time:
  // Node's clock can trail it by a few milliseconds.
  const fixed = deps.now?.() ?? null;
  const dbNow = sql`coalesce(${fixed}::timestamptz, now())`;
  // Leads go before the search.finished of the same moment, so a receiver
  // sees the summary last.
  const claimed = await sql<ClaimedRow[]>`
    update webhook_deliveries d set locked_until = ${dbNow} + ${LOCK_MS} * interval '1 millisecond'
    from webhooks w
    where w.id = d.webhook_id and d.id in (
      select d2.id from webhook_deliveries d2
      join webhooks w2 on w2.id = d2.webhook_id
      where d2.status = 'pending' and d2.next_attempt_at <= ${dbNow}
        and (d2.locked_until is null or d2.locked_until < ${dbNow})
        and w2.enabled
      order by d2.next_attempt_at, d2.event = 'search.finished', d2.created_at
      limit ${DELIVERY_BATCH}
      for update of d2 skip locked
    )
    returning d.id, d.webhook_id, d.event, d.search_id, d.company_id, d.attempts, d.created_at,
              w.url, w.secret, w.clerk_user_id
  `;
  const result: DeliverResult = { delivered: 0, failed: 0, retrying: 0, skipped: 0 };
  await Promise.all(claimed.map(async (d) => void (result[await deliverOne(deps, d)] += 1)));
  if (claimed.length > 0) deps.log.info({ ...result }, 'webhooks: sent');
  return result;
}

async function deliverOne(deps: DeliverDeps, d: ClaimedRow): Promise<keyof DeliverResult> {
  const { sql } = deps;
  const payload = await buildPayload(sql, d);
  if (!payload) {
    await sql`update webhook_deliveries set status = 'skipped', locked_until = null where id = ${d.id}`;
    return 'skipped';
  }
  const res = await deps.send({ url: d.url, secret: d.secret, id: d.id, body: JSON.stringify(payload), now: deps.now?.() });
  const attempts = d.attempts + 1;
  const at = deps.now?.() ?? new Date();

  if (res.ok) {
    await sql.begin(async (tx) => {
      await tx`
        update webhook_deliveries
        set status = 'delivered', attempts = ${attempts}, last_status = ${res.status}, last_error = null,
            delivered_at = ${at}, locked_until = null
        where id = ${d.id}
      `;
      await tx`update webhooks set last_success_at = ${at} where id = ${d.webhook_id}`;
    });
    return 'delivered';
  }

  const error = (res.error ?? 'failed').slice(0, 300);
  if (attempts < MAX_ATTEMPTS) {
    await sql.begin(async (tx) => {
      await tx`
        update webhook_deliveries
        set attempts = ${attempts}, last_status = ${res.status}, last_error = ${error},
            next_attempt_at = ${new Date(at.getTime() + RETRY_DELAYS_MS[attempts - 1]!)}, locked_until = null
        where id = ${d.id}
      `;
      await tx`update webhooks set last_failure_at = ${at}, last_error = ${error} where id = ${d.webhook_id}`;
    });
    return 'retrying';
  }

  await sql.begin(async (tx) => {
    await tx`
      update webhook_deliveries
      set status = 'failed', attempts = ${attempts}, last_status = ${res.status}, last_error = ${error}, locked_until = null
      where id = ${d.id}
    `;
    // A day of failures with no success since this delivery was made: turn it off.
    const disabled = await tx`
      update webhooks set enabled = false, disabled_reason = 'failing', last_failure_at = ${at}, last_error = ${error}
      where id = ${d.webhook_id} and enabled and (last_success_at is null or last_success_at < ${d.created_at})
      returning id
    `;
    if (disabled.length > 0) {
      await tx`delete from webhook_deliveries where webhook_id = ${d.webhook_id} and status = 'pending'`;
      deps.log.warn({ webhookId: d.webhook_id, error }, 'webhooks: disabled a failing webhook');
    } else {
      await tx`update webhooks set last_failure_at = ${at}, last_error = ${error} where id = ${d.webhook_id}`;
    }
  });
  return 'failed';
}
