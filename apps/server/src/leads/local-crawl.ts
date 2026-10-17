// The desktop's local render crawl (docs/desktop/local-crawl.md).
// The app claims the companies the server crawl ended without an address
// (handsToLocalCrawl in @nvoke/shared: which outcomes) from the user's own searches,
// reads them on the user's computer and sends back addresses. Nothing it
// sends is trusted: every address goes through the server's own acceptance,
// classification and own-domain rule again, and none of it enters the shared
// crawl cache. Verification and billing run in the worker as for any crawl.

import type { Sql } from 'postgres';
import { LOCAL_CRAWL_LEGACY_REASONS, type LocalCrawlReason, type LocalCrawlResultRequest, type LocalCrawlTask } from '@nvoke/shared';
import { acceptAddress, classifyAddress, isPlatformDomain, selectForCompany, type ExtractedEmail } from '@nvoke/shared/crawl';
import { enqueue } from '../worker/queue.js';
import { quotaExhausted } from './quota.js';
import { domainSuppressedSql, suppressedAddresses } from './suppression.js';

/** How long a claim is held before the company may be claimed again. */
export const LOCAL_CLAIM_LEASE_MS = 10 * 60_000;
/** Claims per company. A lease that runs out after the last one settles it as failed. */
export const LOCAL_CLAIM_ATTEMPTS = 2;
/** Only searches this recent are offered. */
export const LOCAL_CLAIM_MAX_AGE_DAYS = 30;

interface Candidate {
  id: string;
  search_id: string;
  domain: string;
  website: string;
  crawl_status: LocalCrawlReason;
}

/**
 * Claims up to `max` companies for the user's desktop whose crawl ended in
 * one of `reasons` without an address, refused and JS-only sites first.
 * Empty while the allowance is used up.
 */
export async function claimLocalCrawl(
  sql: Sql,
  userId: string,
  max: number,
  reasons: LocalCrawlReason[] = LOCAL_CRAWL_LEGACY_REASONS,
  now: Date = new Date(),
): Promise<LocalCrawlTask[]> {
  if (await quotaExhausted(sql, userId, now)) return [];
  const at = now.toISOString();
  const leaseUntil = new Date(now.getTime() + LOCAL_CLAIM_LEASE_MS).toISOString();
  const since = new Date(now.getTime() - LOCAL_CLAIM_MAX_AGE_DAYS * 86_400_000).toISOString();

  return sql.begin(async (tx) => {
    // Leases that ran out on their last attempt end here.
    await tx`
      update companies
      set local_crawl = 'failed', local_crawled_at = ${at}::timestamptz, local_claimed_until = null
      where clerk_user_id = ${userId} and local_crawl = 'claimed'
        and local_claimed_until < ${at}::timestamptz and local_attempts >= ${LOCAL_CLAIM_ATTEMPTS}
    `;
    const candidates = await tx<Candidate[]>`
      select c.id, c.search_id, c.domain, c.website, c.crawl_status
      from companies c
      join searches s on s.id = c.search_id
      where c.clerk_user_id = ${userId}
        and c.crawl_status in ${tx(reasons)}
        and not exists (select 1 from emails e where e.company_id = c.id)
        and (c.local_crawl is null or (c.local_crawl = 'claimed' and c.local_claimed_until < ${at}::timestamptz))
        and c.local_attempts < ${LOCAL_CLAIM_ATTEMPTS}
        and s.status <> 'canceled' and s.created_at > ${since}::timestamptz
        and not ${domainSuppressedSql(tx, 'c.domain')}
      order by (c.crawl_status = 'done'), s.created_at desc, c.created_at, c.id
      limit ${max * 2}
      for update of c skip locked
    `;
    // Find never keeps platform domains, but a logged-in site is never opened, so check again.
    const platform = candidates.filter((c) => isPlatformDomain(c.domain));
    if (platform.length > 0) {
      await tx`
        update companies set local_crawl = 'blocked', local_crawled_at = ${at}::timestamptz
        where id in ${tx(platform.map((c) => c.id))}
      `;
    }
    const picked = candidates.filter((c) => !isPlatformDomain(c.domain)).slice(0, max);
    if (picked.length === 0) return [];
    await tx`
      update companies
      set local_crawl = 'claimed', local_claimed_until = ${leaseUntil}::timestamptz, local_attempts = local_attempts + 1
      where id in ${tx(picked.map((c) => c.id))}
    `;
    return picked.map((c) => ({
      companyId: c.id,
      searchId: c.search_id,
      domain: c.domain,
      website: c.website,
      reason: c.crawl_status,
    }));
  });
}

function httpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The addresses the server accepts from a local crawl of `companyDomain`:
 * well formed, not junk, on the company's own site when any are, with the
 * server's own classification and an http(s) source URL or none.
 */
export function acceptLocalEmails(emails: LocalCrawlResultRequest['emails'], companyDomain: string): ExtractedEmail[] {
  const found: ExtractedEmail[] = [];
  for (const e of emails) {
    const address = acceptAddress(e.address);
    if (!address) continue;
    found.push({ address, kind: classifyAddress(address), via: 'text', sourceUrl: httpUrl(e.sourceUrl) });
  }
  return selectForCompany(found, companyDomain);
}

export type LocalResult = { status: 'stored'; stored: number } | { status: 'not_found' } | { status: 'not_claimed' };

/** Records a local crawl's outcome and queues a check per new address. */
export async function submitLocalCrawl(
  sql: Sql,
  userId: string,
  body: LocalCrawlResultRequest,
  now: Date = new Date(),
): Promise<LocalResult> {
  const [company] = await sql<{ id: string; search_id: string; domain: string; local_crawl: string | null }[]>`
    select id, search_id, domain, local_crawl from companies
    where id = ${body.companyId} and clerk_user_id = ${userId}
  `;
  if (!company) return { status: 'not_found' };
  if (company.local_crawl !== 'claimed') return { status: 'not_claimed' };

  const accepted = body.outcome === 'done' ? acceptLocalEmails(body.emails, company.domain) : [];
  const suppressed = await suppressedAddresses(sql, accepted.map((e) => e.address));
  const emails = accepted.filter((e) => !suppressed.has(e.address));

  return sql.begin(async (tx) => {
    const claimed = await tx`
      update companies
      set local_crawl = ${body.outcome}, local_crawled_at = ${now.toISOString()}::timestamptz, local_claimed_until = null
      where id = ${company.id} and local_crawl = 'claimed'
      returning id
    `;
    if (claimed.length === 0) return { status: 'not_claimed' as const };
    let stored = 0;
    if (emails.length > 0) {
      const rows = emails.map((e) => ({
        company_id: company.id,
        search_id: company.search_id,
        clerk_user_id: userId,
        address: e.address,
        kind: e.kind,
        source_url: e.sourceUrl,
      }));
      const inserted = await tx<{ id: string }[]>`
        insert into emails ${tx(rows, 'company_id', 'search_id', 'clerk_user_id', 'address', 'kind', 'source_url')}
        on conflict (company_id, address) do nothing
        returning id
      `;
      stored = inserted.length;
      await enqueue(
        tx,
        inserted.map((r) => ({ type: 'verify' as const, payload: { emailId: r.id }, searchId: company.search_id })),
      );
      await tx`update searches set emails_found = emails_found + ${stored} where id = ${company.search_id}`;
    }
    return { status: 'stored' as const, stored };
  });
}
