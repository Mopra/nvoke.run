// Retention rules (docs/SPEC.md, "Privacy"). Every time limit on stored lead
// data lives here, and purge() applies the deleting ones.

import type { Sql } from 'postgres';

export const RETENTION = {
  /** A cached domain is crawled again by the next search after this many days. */
  domainRecheckDays: 90,
  /** The same for a domain whose last crawl failed or was blocked by robots.txt. */
  domainRecheckFailedDays: 7,
  /** A cached generic address is deleted this long after first_seen, which never moves. */
  domainEmailMonths: 12,
  /** A search, with its companies and emails, is deleted this long after created_at. */
  searchMonths: 12,
  /**
   * The billing ledger row for an address is deleted this long after it was
   * billed. Finding the address again after that charges it again.
   */
  billedEmailMonths: 12,
  /** Verification results are deleted after this many days. */
  emailCheckDays: 30,
  /** A domain row not crawled again within this many months after its recheck date is dropped. */
  domainRowMonths: 12,
  /** A cached Brave Search result page is reused, then deleted, after this many days. */
  webSearchCacheDays: 7,
  /** How often the worker runs purge(). */
  purgeIntervalMs: 60 * 60_000,
} as const;

/** When a domain crawled at `now` with this outcome is due for a recrawl. */
export function recheckAt(status: 'done' | 'failed' | 'blocked', now: Date): Date {
  const days = status === 'done' ? RETENTION.domainRecheckDays : RETENTION.domainRecheckFailedDays;
  return new Date(now.getTime() + days * 86_400_000);
}

export interface PurgeResult {
  searches: number;
  domainEmails: number;
  domains: number;
  emailChecks: number;
  billedEmails: number;
  webSearchPages: number;
}

/**
 * Deletes everything past its retention period. Safe to run from several
 * workers at once and as often as wanted. Suppressions are kept forever.
 */
export async function purge(sql: Sql, now: Date = new Date()): Promise<PurgeResult> {
  const at = now.toISOString();
  // Companies, emails and jobs go with their search (on delete cascade).
  const searches = await sql`
    delete from searches
    where created_at < ${at}::timestamptz - make_interval(months => ${RETENTION.searchMonths})
    returning id
  `;
  const domainEmails = await sql`
    delete from domain_emails
    where first_seen < ${at}::timestamptz - make_interval(months => ${RETENTION.domainEmailMonths})
    returning address
  `;
  const domains = await sql`
    delete from domains
    where recheck_at < ${at}::timestamptz - make_interval(months => ${RETENTION.domainRowMonths})
    returning domain
  `;
  const emailChecks = await sql`
    delete from email_checks
    where checked_at < ${at}::timestamptz - make_interval(days => ${RETENTION.emailCheckDays})
    returning address
  `;
  const billedEmails = await sql`
    delete from billed_emails
    where billed_at < ${at}::timestamptz - make_interval(months => ${RETENTION.billedEmailMonths})
    returning address
  `;
  const webSearchPages = await sql`
    delete from web_search_cache
    where fetched_at < ${at}::timestamptz - make_interval(days => ${RETENTION.webSearchCacheDays})
    returning page
  `;
  return {
    searches: searches.length,
    domainEmails: domainEmails.length,
    domains: domains.length,
    emailChecks: emailChecks.length,
    billedEmails: billedEmails.length,
    webSearchPages: webSearchPages.length,
  };
}
