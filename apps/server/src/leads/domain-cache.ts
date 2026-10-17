// The shared crawl cache (migration 0300_privacy). A domain row records the
// last crawl's outcome; domain_emails holds the generic role addresses it
// found on the domain's own site, and domain_pages (1300_openers) the text of
// a few of its pages, for openers, and domain_people (1610_domain_people)
// the people its pages name, without addresses. Personal, webmail and other
// domains' addresses are never cached: a domain that had any is crawled
// again by every search, so they stay in that search's own rows.

import type { Sql, TransactionSql } from 'postgres';
import type { Seniority } from '@nvoke/shared';
import { personKey, type FoundPerson } from '@nvoke/shared/crawl';
import type { CrawlResult } from './crawl.js';
import type { SitePage } from './page-text.js';
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
  /** The people the last crawl found, in its order. */
  people: FoundPerson[];
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
  return {
    crawlStatus: row.crawl_status,
    emails: emails.map((e) => ({ address: e.address, sourceUrl: e.source_url })),
    people: await cachedPeople(tx, domain),
  };
}

async function cachedPeople(tx: Sql | TransactionSql, domain: string): Promise<FoundPerson[]> {
  const people = await tx<{ first_name: string; last_name: string; title: string | null; seniority: Seniority | null; source_url: string | null }[]>`
    select first_name, last_name, title, seniority, source_url from domain_people where domain = ${domain} order by position
  `;
  return people.map((p) => ({ firstName: p.first_name, lastName: p.last_name, title: p.title, seniority: p.seniority, sourceUrl: p.source_url }));
}

/** How long Claude's reading of a domain's people pages stands before it is asked again. */
export const PEOPLE_READ_DAYS = 90;

/**
 * The cached people of a domain whose people pages Claude read within
 * PEOPLE_READ_DAYS, or null when it has not: then the people step may ask.
 */
export async function recentPeopleRead(sql: Sql | TransactionSql, domain: string, now: Date): Promise<FoundPerson[] | null> {
  const since = new Date(now.getTime() - PEOPLE_READ_DAYS * 86_400_000).toISOString();
  const [row] = await sql`select 1 from domains where domain = ${domain} and people_read_at > ${since}::timestamptz`;
  return row ? cachedPeople(sql, domain) : null;
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
  outcome: {
    status: CrawlOutcome;
    hasPersonal: boolean;
    generic: { address: string; sourceUrl: string | null }[];
    /** The pages' text, replacing what the last crawl kept. */
    texts?: SitePage[];
    /** The people found, replacing the last crawl's. Left as they are when absent. */
    people?: FoundPerson[];
    /** Claude read the people pages in this crawl (people-llm.ts). */
    peopleRead?: boolean;
  },
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  await tx`
    insert into domains (domain, crawl_status, crawled_at, has_personal, recheck_at, people_read_at)
    values (${domain}, ${outcome.status}, ${at}, ${outcome.hasPersonal}, ${recheckAt(outcome.status, now).toISOString()},
            ${outcome.peopleRead ? at : null})
    on conflict (domain) do update
    set crawl_status = excluded.crawl_status, crawled_at = excluded.crawled_at,
        has_personal = excluded.has_personal, recheck_at = excluded.recheck_at,
        people_read_at = coalesce(excluded.people_read_at, domains.people_read_at)
  `;
  await recordPages(tx, domain, outcome.texts ?? [], now);
  if (outcome.people) await recordPeople(tx, domain, outcome.people, now);
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

/** Replaces the kept page text of `domain`. The domain row must exist. */
async function recordPages(tx: TransactionSql, domain: string, texts: SitePage[], now: Date): Promise<void> {
  await tx`delete from domain_pages where domain = ${domain}`;
  const unique = [...new Map(texts.map((t) => [t.url, t])).values()];
  if (unique.length === 0) return;
  const at = now.toISOString();
  const rows = unique.map((t) => ({ domain, url: t.url, title: t.title, description: t.description, text: t.text, fetched_at: at }));
  await tx`insert into domain_pages ${tx(rows, 'domain', 'url', 'title', 'description', 'text', 'fetched_at')}`;
}

/** Replaces the cached people of `domain`. The domain row must exist. */
async function recordPeople(tx: TransactionSql, domain: string, people: FoundPerson[], now: Date): Promise<void> {
  await tx`delete from domain_people where domain = ${domain}`;
  // The first mention wins: the list comes best first.
  const byName = new Map<string, FoundPerson>();
  for (const p of people) byName.set(personKey(p), byName.get(personKey(p)) ?? p);
  const unique = [...byName.values()];
  if (unique.length === 0) return;
  const at = now.toISOString();
  const rows = unique.map((p, i) => ({
    domain,
    first_name: p.firstName,
    last_name: p.lastName,
    title: p.title,
    seniority: p.seniority,
    source_url: p.sourceUrl,
    position: i,
    fetched_at: at,
  }));
  await tx`
    insert into domain_people ${tx(rows, 'domain', 'first_name', 'last_name', 'title', 'seniority', 'source_url', 'position', 'fetched_at')}
    on conflict do nothing
  `;
}

/** The kept page text of each domain, homepage first (it was read first). */
export async function domainPages(sql: Sql | TransactionSql, domains: string[]): Promise<Map<string, SitePage[]>> {
  const out = new Map<string, SitePage[]>();
  if (domains.length === 0) return out;
  const rows = await sql<{ domain: string; url: string; title: string; description: string; text: string }[]>`
    select domain, url, title, description, text from domain_pages
    where domain in ${sql(domains)}
    order by domain, length(url), url
  `;
  for (const r of rows) {
    const list = out.get(r.domain) ?? [];
    list.push({ url: r.url, title: r.title, description: r.description, text: r.text });
    out.set(r.domain, list);
  }
  return out;
}
