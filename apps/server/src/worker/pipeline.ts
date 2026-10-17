// Job handlers for one search: find -> crawl (per company) -> verify (per email).

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import {
  DomainsSearchParams,
  IcpSearchParams,
  LaunchesSearchParams,
  LocalSearchParams,
  WebSearchParams,
  type SearchKind,
  type SearchStatus,
  type Verification,
} from '@nvoke/shared';
import { DropRunInternal } from '../feed/drops.js';
import { crawlSite, type CrawlDeps } from '../leads/crawl.js';
import { cachedCrawl, isCacheable, recentPeopleRead, recordCrawl, type CrawlOutcome } from '../leads/domain-cache.js';
import { isPlatformDomain, normalizeDomain, normalizeWebsite } from '../leads/domain.js';
import { classifyAddress, mergePeople, personForAddress, type FoundPerson } from '../leads/extract.js';
import type { SitePage } from '../leads/page-text.js';
import { needsPeopleLlm, peopleFromText } from '../leads/people-llm.js';
import { chargeVerified, quotaExhausted } from '../leads/quota.js';
import type { AdapterRegistry } from '../leads/sources/index.js';
import type { Ai } from '../ai/client.js';
import type { Alerter } from '../alerts.js';
import { holdForEscalation } from '../leads/ongoing.js';
import { pauseSource } from '../leads/source-pause.js';
import { PermanentError, SourceUnavailableError } from '../leads/sources/types.js';
import { isDomainSuppressed, suppressedAddresses } from '../leads/suppression.js';
import { isTempfail, type Verifier } from '../leads/verify/index.js';
import { leadSettled, searchFinished } from '../webhooks/events.js';
import { cancelSearchJobs, enqueue, type Job, verifyPriority } from './queue.js';

export interface PipelineDeps {
  sql: Sql;
  /** Claude, for openers. Without it opener jobs fail. */
  ai?: Ai;
  adapters: AdapterRegistry;
  crawl: CrawlDeps;
  verifier: Verifier;
  log: Logger;
  now?: () => Date;
  /** Operator alerts. Without it they are only logged. */
  alert?: Alerter;
  /** Monthly Brave spend that triggers alerts at 80% and 100%. */
  braveBudget?: { monthlyUsd: number; costPer1000Usd: number };
}

/** Where the operator fixes a paused source. */
const SOURCE_DASHBOARDS: Record<string, string> = {
  brave: 'https://api-dashboard.search.brave.com/app/subscriptions/usage-limits',
};

/** Pauses a source that refused us and tells the operator. */
async function sourceUnavailable(deps: PipelineDeps, err: SourceUnavailableError): Promise<void> {
  await pauseSource(deps.sql, err.source, err.reason, deps.now?.());
  const dashboard = SOURCE_DASHBOARDS[err.source];
  await deps.alert?.send({
    key: `source-unavailable:${err.source}`,
    subject: `${err.source} is refusing searches`,
    text: [
      `${err.source} refused a request: ${err.reason}.`,
      '',
      `New searches that need ${err.source} are refused with a clear message for the next 10 minutes. After that the next search tries again, so it recovers by itself once the cause is fixed.`,
      dashboard ? `Fix it here: ${dashboard}` : '',
      `End the pause early on the VPS: nv sources resume ${err.source}`,
    ].join('\n'),
  });
}

/** Alerts at 80% and 100% of the monthly Brave budget, once each per month. */
async function checkBraveBudget(deps: PipelineDeps): Promise<void> {
  const budget = deps.braveBudget;
  if (!budget || !deps.alert) return;
  const now = deps.now?.() ?? new Date();
  const [row] = await deps.sql<{ requests: number }[]>`
    select coalesce(sum(source_requests), 0)::int as requests from searches
    where kind in ('web', 'domains', 'local', 'icp') and created_at >= date_trunc('month', ${now.toISOString()}::timestamptz)
  `;
  const spent = ((row?.requests ?? 0) / 1_000) * budget.costPer1000Usd;
  const share = spent / budget.monthlyUsd;
  const level = share >= 1 ? 100 : share >= 0.8 ? 80 : null;
  if (level === null) return;
  const month = now.toISOString().slice(0, 7);
  await deps.alert.send({
    key: `brave-budget:${month}:${level}`,
    everyMs: 40 * 86_400_000,
    subject: `Brave spend at ${level}% of the $${budget.monthlyUsd} budget`,
    text: [
      `About $${spent.toFixed(2)} of Brave Search used in ${month} (${row?.requests ?? 0} paid requests), against a budget of $${budget.monthlyUsd}.`,
      '',
      'When Brave hits its usage limit, web searches pause and users see that web search is down on our side.',
      `Raise the usage limit here: ${SOURCE_DASHBOARDS.brave}`,
      'Then raise BRAVE_MONTHLY_BUDGET_USD in /opt/nvoke/.env to match and restart the worker.',
    ].join('\n'),
  });
}

export const QUOTA_EXCEEDED = 'quota_exceeded';

const PARAMS = {
  local: LocalSearchParams,
  web: WebSearchParams,
  launches: LaunchesSearchParams,
  domains: DomainsSearchParams,
  drop: DropRunInternal,
  icp: IcpSearchParams,
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

/**
 * Marks the search failed (unless it already ended) and cancels its remaining
 * discovery work. A search with a live progress line (plain words) gets an
 * honest last note instead of the step it was on; an ongoing one is picked up
 * again at its next daily round (leads/ongoing.ts).
 */
export async function failSearch(sql: Sql, searchId: string, error: string, keepVerify = false): Promise<void> {
  const quota = error === QUOTA_EXCEEDED;
  await sql.begin(async (tx) => {
    const rows = await tx`
      update searches set status = 'failed', error = ${error.slice(0, 500)}, finished_at = now(),
        stage = case when stage is null then null when ${quota} then 'paused' else 'failed' end,
        stage_note = case
          when stage is null then null
          when ${quota} and ongoing then 'This month’s allowance is used up. Paused until it renews'
          when ${quota} then 'This month’s allowance is used up'
          when ongoing then 'Stopped by an error. Trying again at the next daily round'
          else 'Stopped by an error. Search more to try again'
        end
      where id = ${searchId} and status in ('queued', 'running')
      returning id
    `;
    if (rows.length > 0) await searchFinished(tx, searchId);
  });
  await cancelSearchJobs(sql, searchId, keepVerify ? ['find', 'crawl'] : undefined);
}

/**
 * A running search with no queued or running jobs left is done. Called after
 * every job; READ COMMITTED makes the last finisher see an empty queue. A
 * plain words search that came up short is held running for a fresh round
 * instead (leads/ongoing.ts).
 */
export async function maybeFinishSearch(sql: Sql, searchId: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    if (await holdForEscalation(tx, searchId)) return false;
    const rows = await tx`
      update searches set status = 'done', finished_at = now()
      where id = ${searchId} and status = 'running'
        and not exists (select 1 from jobs where search_id = ${searchId} and status in ('queued', 'running'))
      returning id
    `;
    if (rows.length === 0) return false;
    await searchFinished(tx, searchId);
    return true;
  });
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

  // Paid source calls, recorded even when the find fails, so cost per valid email can be measured.
  const usage = { request: 0, cache_hit: 0 };
  const onUsage = (event: keyof typeof usage) => void usage[event]++;
  // The whole limit, not what is left: a later run skips the companies the search holds, so it may need to see them all.
  const onStage = async (stage: string, note: string): Promise<void> => {
    await sql`update searches set stage = ${stage}, stage_note = ${note} where id = ${searchId}`.catch((err: unknown) =>
      log.warn({ err }, 'find: could not record stage'),
    );
  };
  const iterator = abortable(
    adapter.find(params, { limit: search.limit, signal, log, onUsage, userId: search.clerk_user_id, searchId, onStage }),
    signal,
  );
  try {
    for await (const company of iterator) {
      seen++;
      const website = normalizeWebsite(company.website);
      const domain = website ? normalizeDomain(website) : null;
      if (!website || !domain || isPlatformDomain(domain)) continue;

      if (await isDomainSuppressed(sql, domain)) continue;

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
            fit: company.fit ?? null,
            fit_reason: company.fitReason ?? null,
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
  } finally {
    if (usage.request > 0 || usage.cache_hit > 0) {
      await sql`
        update searches
        set source_requests = source_requests + ${usage.request}, source_cache_hits = source_cache_hits + ${usage.cache_hit}
        where id = ${searchId}
      `.catch((err: unknown) => log.warn({ err }, 'find: could not record source usage'));
      if (usage.request > 0) await checkBraveBudget(deps).catch((err: unknown) => log.warn({ err }, 'find: budget check failed'));
    }
  }
  log.info({ found, seen, sourceRequests: usage.request, sourceCacheHits: usage.cache_hit }, 'find: done');
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

  const now = deps.now?.() ?? new Date();
  // A domain suppressed after find picked it up is not crawled or stored.
  if (await isDomainSuppressed(sql, company.domain)) {
    await finishCrawl(deps, company, 'blocked', []);
    return;
  }

  const cached = await cachedCrawl(sql, company.domain, now);
  if (cached) {
    const blocked = await suppressedAddresses(sql, cached.emails.map((e) => e.address));
    const emails = cached.emails
      .filter((e) => !blocked.has(e.address))
      .map((e) => ({ address: e.address, kind: classifyAddress(e.address), sourceUrl: e.sourceUrl, foundVia: 'cache' as const }));
    deps.log.debug(
      { companyId, domain: company.domain, status: cached.crawlStatus, emails: emails.length, people: cached.people.length },
      'crawl: cache hit',
    );
    await finishCrawl(deps, company, cached.crawlStatus, emails, { people: cached.people });
    return;
  }

  const result = await crawlSite(company.website, company.domain, deps.crawl, { signal });
  let people = result.people;
  let peopleRead = false;
  // No decision maker among the names the pages gave away: Claude reads the
  // people pages, once per domain in 90 days (the cache keeps what it found).
  if (deps.ai && needsPeopleLlm(people, result.peopleTexts)) {
    const recent = await recentPeopleRead(sql, company.domain, now);
    const read =
      recent ??
      (await peopleFromText({ ai: deps.ai, log: deps.log }, { userId: company.clerk_user_id, domain: company.domain, texts: result.peopleTexts }));
    peopleRead = recent === null && read !== null;
    people = mergePeople([...people, ...(read ?? [])]);
  }
  deps.log.debug(
    { companyId, domain: company.domain, status: result.status, pages: result.pages.length, emails: result.emails.length, people: people.length },
    'crawl: site done',
  );
  const blocked = await suppressedAddresses(sql, result.emails.map((e) => e.address));
  const emails = result.emails
    .filter((e) => !blocked.has(e.address))
    .map((e) => ({ address: e.address, kind: e.kind, sourceUrl: e.sourceUrl, foundVia: 'page' as const }));
  await finishCrawl(deps, company, result.status, emails, { crawledAt: now, texts: result.texts, people, peopleRead });
}

interface FoundEmail {
  address: string;
  kind: 'generic' | 'personal';
  sourceUrl: string | null;
  /** page: printed on the site in this crawl. cache: from the shared cache of an earlier one. */
  foundVia: 'page' | 'cache';
}

/** How sure nvoke is that a printed address reaches a person or an inbox (emails.confidence). */
export const PAGE_CONFIDENCE = { personal: 90, generic: 60 } as const;

interface FinishOptions {
  /** Set for a real crawl, which also refreshes the shared cache. */
  crawledAt?: Date;
  texts?: SitePage[];
  /** The people the site names, best first. */
  people?: FoundPerson[];
  /** Claude read the people pages in this crawl. */
  peopleRead?: boolean;
}

/**
 * Stores a crawl outcome for a company: its people, its addresses (linked to
 * the person whose name an address is made from) and a check per new
 * address, then a people job when it named anyone. `crawledAt` is set for a
 * real crawl, which also refreshes the shared cache.
 */
async function finishCrawl(
  deps: PipelineDeps,
  company: CompanyRow,
  status: CrawlOutcome,
  emails: FoundEmail[],
  { crawledAt, texts, people = [], peopleRead = false }: FinishOptions = {},
): Promise<void> {
  const { sql } = deps;
  const stored = await sql.begin(async (tx) => {
    // Only the first finisher records the crawl (guards against a retried job).
    const claimed = await tx`
      update companies set crawl_status = ${status}, crawled_at = now()
      where id = ${company.id} and crawl_status = 'pending'
      returning id
    `;
    if (claimed.length === 0) return 0;

    if (crawledAt) {
      await recordCrawl(
        tx,
        company.domain,
        {
          status,
          hasPersonal: emails.some((e) => !isCacheable(e, company.domain)),
          generic: emails.filter((e) => isCacheable(e, company.domain)),
          texts,
          people,
          peopleRead,
        },
        crawledAt,
      );
    }

    let named: PersonRow[] = [];
    if (people.length > 0) {
      const rows = mergePeople(people).map((p) => ({
        company_id: company.id,
        search_id: company.search_id,
        first_name: p.firstName,
        last_name: p.lastName,
        title: p.title,
        seniority: p.seniority,
        source: 'page',
        source_url: p.sourceUrl,
      }));
      await tx`
        insert into people ${tx(rows, 'company_id', 'search_id', 'first_name', 'last_name', 'title', 'seniority', 'source', 'source_url')}
        on conflict do nothing
      `;
      named = await tx<PersonRow[]>`
        select id, first_name, last_name, title, seniority from people where company_id = ${company.id} order by created_at, id
      `;
      await enqueue(tx, { type: 'people', payload: { companyId: company.id }, searchId: company.search_id });
    }

    let stored = 0;
    if (emails.length > 0) {
      // Storing costs nothing: the user is charged only when a check comes
      // back valid (runVerify), and unchecked addresses are never shown.
      const owners = named.map((p) => ({ firstName: p.first_name, lastName: p.last_name, row: p }));
      const rows = emails.map((e) => {
        const owner = e.kind === 'personal' ? personForAddress(e.address, owners)?.row : undefined;
        return {
          company_id: company.id,
          search_id: company.search_id,
          clerk_user_id: company.clerk_user_id,
          address: e.address,
          kind: e.kind,
          source_url: e.sourceUrl,
          person_id: owner?.id ?? null,
          first_name: owner?.first_name ?? null,
          last_name: owner?.last_name ?? null,
          title: owner?.title ?? null,
          seniority: owner?.seniority ?? null,
          found_via: e.foundVia,
          confidence: PAGE_CONFIDENCE[e.kind],
        };
      });
      const inserted = await tx<{ id: string; kind: string; seniority: string | null; first_name: string | null }[]>`
        insert into emails ${tx(
          rows,
          'company_id',
          'search_id',
          'clerk_user_id',
          'address',
          'kind',
          'source_url',
          'person_id',
          'first_name',
          'last_name',
          'title',
          'seniority',
          'found_via',
          'confidence',
        )}
        on conflict (company_id, address) do nothing
        returning id, kind, seniority, first_name
      `;
      stored = inserted.length;
      await enqueue(
        tx,
        inserted.map((r) => ({
          type: 'verify' as const,
          payload: { emailId: r.id },
          searchId: company.search_id,
          priority: verifyPriority(r),
        })),
      );
    }
    await tx`
      update searches
      set companies_crawled = companies_crawled + 1, emails_found = emails_found + ${stored}
      where id = ${company.search_id}
    `;
    return stored;
  });
  deps.log.debug({ companyId: company.id, stored }, 'crawl: stored');
}

interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  seniority: FoundPerson['seniority'];
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

/** Greylisted addresses are asked again this many times, this far apart, before settling as unknown. */
export const GREYLIST_RETRIES = 2;
export const GREYLIST_DELAY_MS = 10 * 60_000;

export async function runVerify(deps: PipelineDeps, job: Job, signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const emailId = str(job.payload, 'emailId');
  const [email] = await sql<
    {
      address: string;
      search_id: string;
      clerk_user_id: string;
      verification: Verification | null;
      kind: string;
      seniority: string | null;
      first_name: string | null;
    }[]
  >`
    select address, search_id, clerk_user_id, verification, kind, seniority, first_name from emails where id = ${emailId}
  `;
  if (!email || email.verification) return;
  const status = await searchStatus(sql, email.search_id);
  if (status === null || status === 'canceled') return;
  if (await quotaExhausted(sql, email.clerk_user_id, deps.now?.())) {
    await failSearch(sql, email.search_id, QUOTA_EXCEEDED);
    return;
  }

  const result = await deps.verifier.verify(email.address, signal);
  const retry = typeof job.payload.retry === 'number' ? job.payload.retry : 0;
  if (result.reason === 'smtp_paced') {
    // Over the probe budget for this minute: come back when a slot frees up, spread out. Not a retry.
    const now = deps.now?.() ?? new Date();
    const wait = Math.max(5_000, result.retryAfterMs ?? 60_000) + Math.floor(Math.random() * 60_000);
    await enqueue(sql, {
      type: 'verify',
      payload: { emailId, retry },
      searchId: email.search_id,
      runAfter: new Date(now.getTime() + wait),
      priority: verifyPriority(email),
    });
    return;
  }
  // Unknown is the outcome that says the most about our own health (throttling, a blocked port 25).
  if (result.verification === 'unknown') deps.log.info({ reason: result.reason, mxHost: result.mxHost, retry }, 'verify: unknown');
  if (isTempfail(result) && retry < GREYLIST_RETRIES) {
    // Greylisting: the server wants us to come back later. A queued job keeps the search running.
    const now = deps.now?.() ?? new Date();
    await enqueue(sql, {
      type: 'verify',
      payload: { emailId, retry: retry + 1 },
      searchId: email.search_id,
      runAfter: new Date(now.getTime() + GREYLIST_DELAY_MS),
      priority: verifyPriority(email),
    });
    return;
  }
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
    const [email] = await tx<{ search_id: string; company_id: string; clerk_user_id: string; address: string }[]>`
      select search_id, company_id, clerk_user_id, address from emails
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
    // Checks of one company finishing together queue behind this lock, so
    // the last one sees every other result and announces the lead.
    await tx`select id from companies where id = ${email.company_id} for update`;
    await leadSettled(tx, email.company_id);
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
  if (error instanceof SourceUnavailableError) await sourceUnavailable(deps, error);
  // Companies already found keep crawling; only discovery stopped.
  const found = await deps.sql<{ n: number }[]>`select count(*)::int as n from companies where search_id = ${searchId}`;
  const keepable = !(error instanceof PermanentError) || error instanceof SourceUnavailableError;
  if ((found[0]?.n ?? 0) > 0 && keepable) {
    deps.log.warn({ searchId, err: message }, 'find: gave up after partial results, keeping them');
    return;
  }
  await failSearch(deps.sql, searchId, error instanceof PermanentError && error.code ? error.code : message);
}
