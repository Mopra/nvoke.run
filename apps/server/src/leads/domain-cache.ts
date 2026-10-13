// The shared crawl cache (migration 0300_privacy). A domain row records the
// last crawl's outcome; domain_emails holds the generic role addresses it
// found on the domain's own site. Personal, webmail and other domains'
// addresses are never cached: a domain that had any is crawled again by
// every search, so they stay in that search's own rows.

import type { Sql, TransactionSql } from 'postgres';
import type { CrawlResult } from './crawl.js';
import { isWebmailDomain, sameSite } from './domain.js';
import { recheckAt } from './retention.js';

export type CrawlOutcome = CrawlResult['status'];

/**
 * Whether a found address may go into the shared cache: a generic role
 * address on the company's own site, never on webmail. Anything else stays
 * in the search that found it and counts as has_personal, so the domain is
 * crawled again rather than served incomplete from the cache.
 */
export function isCacheable(email: { address: string; kind: 'generic' | 'personal' }, companyDomain: string): boolean {
  if (email.kind !== 'generic') return false;
  const host = email.address.slice(email.address.lastIndexOf('@') + 1);
  return !isWebmailDomain(host) && sameSite(host, companyDomain);
}

export interface CachedDomain {
  crawlStatus: CrawlOutcome;
  emails: { address: string; sourceUrl: string | null }[];
}

/**
 * The cached crawl for `domain`, when it is fresh and complete enough to
 * stand in for a real crawl: no personal addresses, or a failed or blocked
 * crawl (which found nothing either way). Null means crawl.
 */
export async function cachedCrawl(tx: Sql | TransactionSql, domain: string, now: Date): Promise<CachedDomain | null> {
  const [row] = await tx<{ crawl_status: CrawlOutcome; has_personal: boolean }[]>`
    select crawl_status, has_personal from domains
    where domain = ${domain} and recheck_at > ${now.toISOString()}::timestamptz
  `;
  if (!row) return null;
  if (row.crawl_status === 'done' && row.has_personal) return null;
  const emails = await tx<{ address: string; source_url: string | null }[]>`
    select address, source_url from domain_emails where domain = ${domain} order by address
  `;
  return { crawlStatus: row.crawl_status, emails: emails.map((e) => ({ address: e.address, sourceUrl: e.source_url })) };
}

/**
 * Records a real crawl: upserts the domain row and syncs its generic
 * addresses. New ones are inserted, ones found again get a new last_seen
 * (first_seen never moves), and ones not found this time are deleted.
 * `generic` must hold only cacheable addresses (isCacheable), free of
 * suppressed ones.
 */
export async function recordCrawl(
  tx: TransactionSql,
  domain: string,
  outcome: { status: CrawlOutcome; hasPersonal: boolean; generic: { address: string; sourceUrl: string | null }[] },
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  await tx`
    insert into domains (domain, crawl_status, crawled_at, has_personal, recheck_at)
    values (${domain}, ${outcome.status}, ${at}, ${outcome.hasPersonal}, ${recheckAt(outcome.status, now).toISOString()})
    on conflict (domain) do update
    set crawl_status = excluded.crawl_status, crawled_at = excluded.crawled_at,
        has_personal = excluded.has_personal, recheck_at = excluded.recheck_at
  `;
  const unique = [...new Map(outcome.generic.map((e) => [e.address, e])).values()];
  const addresses = unique.map((e) => e.address);
  if (addresses.length === 0) {
    await tx`delete from domain_emails where domain = ${domain}`;
    return;
  }
  await tx`delete from domain_emails where domain = ${domain} and address not in ${tx(addresses)}`;
  const rows = unique.map((e) => ({
    domain,
    address: e.address,
    source_url: e.sourceUrl,
    first_seen: at,
    last_seen: at,
  }));
  await tx`
    insert into domain_emails ${tx(rows, 'domain', 'address', 'source_url', 'first_seen', 'last_seen')}
    on conflict (domain, address) do update
    set last_seen = excluded.last_seen, source_url = excluded.source_url
  `;
}
