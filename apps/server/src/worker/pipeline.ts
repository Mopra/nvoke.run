// Job handlers for one search: find -> crawl (per company) -> verify (per email).

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import {
  LaunchesSearchParams,
  LocalSearchParams,
  WebSearchParams,
  type SearchKind,
  type SearchStatus,
  type Verification,
} from '@nvoke/shared';
import { crawlSite, type CrawlDeps } from '../leads/crawl.js';
import { isPlatformDomain, normalizeDomain, normalizeWebsite, registrableDomain } from '../leads/domain.js';
import { chargeVerified, quotaExhausted } from '../leads/quota.js';
import type { AdapterRegistry } from '../leads/sources/index.js';
import { PermanentError } from '../leads/sources/types.js';
import type { Verifier } from '../leads/verify/index.js';
import { cancelSearchJobs, enqueue, type Job } from './queue.js';

export interface PipelineDeps {
  sql: Sql;
  adapters: AdapterRegistry;
  crawl: CrawlDeps;
  verifier: Verifier;
  log: Logger;
  now?: () => Date;
}

export const QUOTA_EXCEEDED = 'quota_exceeded';

const PARAMS = {
  local: LocalSearchParams,
  web: WebSearchParams,
  launches: LaunchesSearchParams,
} as const;

interface SearchRow {
  id: string;
  clerk_user_id: string;
  kind: SearchKind;
  params: unknown;
  limit: number;
  status: SearchStatus;
}

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== 'string' || !v) throw new PermanentError(`job payload is missing ${key}`);
  return v;
}

async function searchStatus(sql: Sql, searchId: string): Promise<SearchStatus | null> {
  const rows = await sql<{ status: SearchStatus }[]>`select status from searches where id = ${searchId}`;
  return rows[0]?.status ?? null;
}

/** Marks the search failed (unless it already ended) and cancels its remaining discovery work. */
export async function failSearch(sql: Sql, searchId: string, error: string, keepVerify = false): Promise<void> {
  await sql`
    update searches set status = 'failed', error = ${error.slice(0, 500)}, finished_at = now()
    where id = ${searchId} and status in ('queued', 'running')
  `;
  await cancelSearchJobs(sql, searchId, keepVerify ? ['find', 'crawl'] : undefined);
}

/**
 * A running search with no queued or running jobs left is done. Called after
 * every job; READ COMMITTED makes the last finisher see an empty queue.
 */
export async function maybeFinishSearch(sql: Sql, searchId: string): Promise<boolean> {
  const rows = await sql`
    update searches set status = 'done', finished_at = now()
    where id = ${searchId} and status = 'running'
      and not exists (select 1 from jobs where search_id = ${searchId} and status in ('queued', 'running'))
    returning id
  `;
  return rows.length > 0;
}

// find

/**
 * Iterates an adapter but gives up as soon as the signal aborts, even when
 * the adapter itself is stuck in something that ignores the signal.
 */
export async function* abortable<T>(source: AsyncIterable<T>, signal: AbortSignal): AsyncGenerator<T> {
  const it = source[Symbol.asyncIterator]();
  const aborted = new Promise<never>((_resolve, reject) => {
    const fail = () => reject(signal.reason ?? new Error('aborted'));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
  aborted.catch(() => undefined);
  try {
    for (;;) {
      const next = await Promise.race([it.next(), aborted]);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    // Fire and forget: a stuck adapter may never settle its return().
    void Promise.resolve(it.return?.()).catch(() => undefined);
  }
}

export async function runFind(deps: PipelineDeps, job: Job, signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const searchId = str(job.payload, 'searchId');
  const [search] = await sql<SearchRow[]>`
    update searches set status = 'running', started_at = coalesce(started_at, now())
    where id = ${searchId} and status in ('queued', 'running')
    returning id, clerk_user_id, kind, params, "limit", status
  `;
  if (!search) return; // canceled or deleted meanwhile

  const adapter = deps.adapters[search.kind];
  const params = PARAMS[search.kind].parse(search.params);
  const log = deps.log.child({ searchId, kind: search.kind });

  const countRows = await sql<{ n: number }[]>`select count(*)::int as n from companies where search_id = ${searchId}`;
  let found = countRows[0]?.n ?? 0;
  let seen = 0;
  if (found >= search.limit) return;

  const iterator = abortable(adapter.find(params, { limit: search.limit - found, signal, log }), signal);
  for await (const company of iterator) {
    seen++;
    const website = normalizeWebsite(company.website);
    const domain = website ? normalizeDomain(website) : null;
    if (!website || !domain || isPlatformDomain(domain)) continue;

    const optout = await sql`
      select 1 from crawl_optouts where domain in (${domain}, ${registrableDomain(domain)}) limit 1
    `;
    if (optout.length > 0) continue;

    const inserted = await sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into companies ${tx({
          search_id: searchId,
          clerk_user_id: search.clerk_user_id,
          name: company.name.slice(0, 300),
          domain,
          website,
          source: company.source,
          source_ref: company.sourceRef ?? null,
          location: company.location ?? null,
          phone: company.phone ?? null,
          category: company.category ?? null,
        })}
        on conflict (search_id, domain) do nothing
        returning id
      `;
      const id = rows[0]?.id;
      if (!id) return false;
      await enqueue(tx, { type: 'crawl', payload: { companyId: id }, searchId });
      await tx`update searches set companies_found = companies_found + 1 where id = ${searchId}`;
      return true;
    });
    if (!inserted) continue;
    found++;
    if (found >= search.limit) break;
    // Stop discovering when the user canceled or the quota ran out.
    if (found % 10 === 0 && (await searchStatus(sql, searchId)) !== 'running') break;
  }
  log.info({ found, seen }, 'find: done');
}

// crawl

interface CompanyRow {
  id: string;
  search_id: string;
  clerk_user_id: string;
  domain: string;
  website: string;
  crawl_status: string;
}

export async function runCrawl(deps: PipelineDeps, job: Job, signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const companyId = str(job.payload, 'companyId');
  const [company] = await sql<CompanyRow[]>`
    select id, search_id, clerk_user_id, domain, website, crawl_status from companies where id = ${companyId}
  `;
  if (!company || company.crawl_status !== 'pending') return;
  if ((await searchStatus(sql, company.search_id)) !== 'running') return;
  if (await quotaExhausted(sql, company.clerk_user_id, deps.now?.())) {
    await failSearch(sql, company.search_id, QUOTA_EXCEEDED);
    return;
  }

  const result = await crawlSite(company.website, company.domain, deps.crawl, { signal });
  deps.log.debug(
    { companyId, domain: company.domain, status: result.status, pages: result.pages.length, emails: result.emails.length },
    'crawl: site done',
  );

  const stored = await sql.begin(async (tx) => {
    // Only the first finisher records the crawl (guards against a retried job).
    const claimed = await tx`
      update companies set crawl_status = ${result.status}, crawled_at = now()
      where id = ${companyId} and crawl_status = 'pending'
      returning id
    `;
    if (claimed.length === 0) return 0;

    let stored = 0;
    if (result.emails.length > 0) {
      // Storing costs nothing: the user is charged only when a check comes
      // back valid (runVerify), and unchecked addresses are never shown.
      const rows = result.emails.map((e) => ({
        company_id: companyId,
        search_id: company.search_id,
        clerk_user_id: company.clerk_user_id,
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
    }
    await tx`
      update searches
      set companies_crawled = companies_crawled + 1, emails_found = emails_found + ${stored}
      where id = ${company.search_id}
    `;
    return stored;
  });
  deps.log.debug({ companyId, stored }, 'crawl: stored');
}

/** A crawl job that ran out of attempts still counts as crawled, with status failed. */
export async function onCrawlGaveUp(deps: PipelineDeps, job: Job): Promise<void> {
  const companyId = job.payload.companyId;
  if (typeof companyId !== 'string') return;
  await deps.sql.begin(async (tx) => {
    const rows = await tx<{ search_id: string }[]>`
      update companies set crawl_status = 'failed', crawled_at = now()
      where id = ${companyId} and crawl_status = 'pending'
      returning search_id
    `;
    const searchId = rows[0]?.search_id;
    if (searchId) await tx`update searches set companies_crawled = companies_crawled + 1 where id = ${searchId}`;
  });
}

// verify

export async function runVerify(deps: PipelineDeps, job: Job, signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const emailId = str(job.payload, 'emailId');
  const [email] = await sql<{ address: string; search_id: string; clerk_user_id: string; verification: Verification | null }[]>`
    select address, search_id, clerk_user_id, verification from emails where id = ${emailId}
  `;
  if (!email || email.verification) return;
  const status = await searchStatus(sql, email.search_id);
  if (status === null || status === 'canceled') return;
  if (await quotaExhausted(sql, email.clerk_user_id, deps.now?.())) {
    await failSearch(sql, email.search_id, QUOTA_EXCEEDED);
    return;
  }

  const result = await deps.verifier.verify(email.address, signal);
  await recordVerification(deps, emailId, result.verification);
}

/**
 * Records a check. A valid address is charged in the same transaction; when
 * the allowance ran out meanwhile, it stays unchecked (and hidden) and the
 * search stops with quota_exceeded.
 */
async function recordVerification(deps: PipelineDeps, emailId: string, verification: Verification): Promise<void> {
  const { sql } = deps;
  const outcome = await sql.begin(async (tx) => {
    const [email] = await tx<{ search_id: string; clerk_user_id: string; address: string }[]>`
      select search_id, clerk_user_id, address from emails
      where id = ${emailId} and verification is null
      for update
    `;
    if (!email) return null;
    if (verification === 'valid') {
      const charge = await chargeVerified(tx, email.clerk_user_id, email.address, deps.now?.());
      if (charge === 'over_limit') return { searchId: email.search_id, overLimit: true };
    }
    await tx`update emails set verification = ${verification}, checked_at = now() where id = ${emailId}`;
    if (verification === 'valid') {
      await tx`update searches set emails_valid = emails_valid + 1 where id = ${email.search_id}`;
    }
    return { searchId: email.search_id, overLimit: false };
  });
  if (outcome?.overLimit) {
    deps.log.info({ searchId: outcome.searchId }, 'verify: quota exceeded, failing search');
    await failSearch(sql, outcome.searchId, QUOTA_EXCEEDED);
  }
}

/** A verify job that ran out of attempts leaves the address as "unknown". */
export async function onVerifyGaveUp(deps: PipelineDeps, job: Job): Promise<void> {
  const emailId = job.payload.emailId;
  if (typeof emailId === 'string') await recordVerification(deps, emailId, 'unknown');
}

/** A find job that failed for good fails its search. */
export async function onFindGaveUp(deps: PipelineDeps, job: Job, error: unknown): Promise<void> {
  const searchId = job.payload.searchId;
  if (typeof searchId !== 'string') return;
  const message = error instanceof Error ? error.message : String(error);
  // Companies already found keep crawling; only discovery stopped.
  const found = await deps.sql<{ n: number }[]>`select count(*)::int as n from companies where search_id = ${searchId}`;
  if ((found[0]?.n ?? 0) > 0 && !(error instanceof PermanentError)) {
    deps.log.warn({ searchId, err: message }, 'find: gave up after partial results, keeping them');
    return;
  }
  await failSearch(deps.sql, searchId, message);
}
