// Job handlers for one search: find -> crawl (per company) -> verify (per email).
// A plain words (icp) search scores fit after the crawl: a crawled company
// with someone to check waits for the fit job (per batch of companies), and
// only a company it keeps gets its checks and people job.

import type { Logger } from 'pino';
import type { Sql, TransactionSql } from 'postgres';
import {
  DomainsSearchParams,
  emailWeight,
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
import { cachedCrawl, domainPages, isCacheable, recentPeopleRead, recordCrawl, type CrawlOutcome } from '../leads/domain-cache.js';
import { isPlatformDomain, normalizeDomain, normalizeWebsite, registrableDomain } from '../leads/domain.js';
import { checkPolicy, checkTier, needsFit, type Decision, type PolicyContext, type PolicyEmail, type PolicySelf } from '../leads/check-policy.js';
import { FIT_THRESHOLD, scoreCandidates, type FitCandidate, type FitVerdict } from '../leads/fit.js';
import { IcpPlan } from '../leads/planner.js';
import { rememberRejected } from '../leads/sources/icp.js';
import { classifyAddress, companyAsPerson, mergePeople, personForAddress, type FoundPerson } from '../leads/extract.js';
import { nameFromLocal } from '../leads/patterns.js';
import type { SitePage } from '../leads/page-text.js';
import { needsPeopleLlm, peopleFromText } from '../leads/people-llm.js';
import { sleep } from '../leads/limits.js';
import { chargeVerified, quotaExhausted } from '../leads/quota.js';
import type { AdapterRegistry } from '../leads/sources/index.js';
import type { Ai } from '../ai/client.js';
import type { Alerter } from '../alerts.js';
import { holdForEscalation } from '../leads/ongoing.js';
import { pauseSource } from '../leads/source-pause.js';
import { PermanentError, SourceUnavailableError } from '../leads/sources/types.js';
import { isDomainSuppressed, suppressedAddresses } from '../leads/suppression.js';
import { isCapacityDeferral, isTempfail, type Verifier, type VerifyResult } from '../leads/verify/index.js';
import { leadSettled, searchFinished } from '../webhooks/events.js';
import { cancelSearchJobs, enqueue, FIT_WAIT_MS, queueFit, requeue, type Job, type VerifyPayload, verifyPriority } from './queue.js';

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
  /** How long a crawled company waits for others before the fit job runs. Default FIT_WAIT_MS. */
  fitWaitMs?: number;
  /** How long a plain words find waits at its limit for crawls and fit to turn companies down. Default FIND_SETTLE_MS. */
  findSettleMs?: number;
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

/**
 * How long the find job of a plain words search waits at its limit for the
 * crawls and fit of its companies, so a company fit turns down after the
 * crawl is replaced: the limit counts companies kept. Past it the find ends,
 * and never short (leads/ongoing.ts) closes any gap.
 */
export const FIND_SETTLE_MS = 2 * 60_000;
const SETTLE_POLL_MS = 2_000;

/**
 * Waits until the search's companies cannot fall below `limit` any more (none
 * waits for a crawl or for fit that could turn it down), until they did, or
 * until `ms` passed. Returns the companies the search holds.
 */
async function settleFit(sql: Sql, searchId: string, limit: number, ms: number, signal: AbortSignal): Promise<number> {
  const until = Date.now() + ms;
  for (;;) {
    const [row] = await sql<{ held: number; waiting: number; running: boolean }[]>`
      select count(*)::int as held,
        count(*) filter (where fit_state = 'pending' or (fit_state = 'gate' and crawl_status = 'pending'))::int as waiting,
        coalesce((select status = 'running' from searches where id = ${searchId}), false) as running
      from companies where search_id = ${searchId}
    `;
    const held = row?.held ?? 0;
    if (held < limit || held - (row?.waiting ?? 0) >= limit || !row?.running || Date.now() >= until || signal.aborted) return held;
    await sleep(SETTLE_POLL_MS, signal).catch(() => undefined);
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
  // A plain words company gets fit's second look after its crawl, and one turned down then is deleted.
  const icp = search.kind === 'icp';
  const heldBefore = found;
  let inserted = 0;
  let dropped = 0;

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
    adapter.find(params, { limit: search.limit, signal, log, onUsage, userId: search.clerk_user_id, searchId, onStage, dropped: () => dropped }),
    signal,
  );
  try {
    for await (const company of iterator) {
      seen++;
      const website = normalizeWebsite(company.website);
      const domain = website ? normalizeDomain(website) : null;
      if (!website || !domain || isPlatformDomain(domain)) continue;

      if (await isDomainSuppressed(sql, domain)) continue;

      const stored = await sql.begin(async (tx) => {
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
            fit_state: icp ? 'gate' : null,
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
      if (!stored) continue;
      found++;
      inserted++;
      if (found >= search.limit) {
        if (!icp) break;
        // Companies turned down after their crawl free their place: wait for them, then find more.
        found = await settleFit(sql, searchId, search.limit, deps.findSettleMs ?? FIND_SETTLE_MS, signal);
        dropped = Math.max(0, inserted - (found - heldBefore));
        if (found >= search.limit) break;
      }
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
  log.info({ found, seen, dropped, sourceRequests: usage.request, sourceCacheHits: usage.cache_hit }, 'find: done');
}

// crawl

interface CompanyRow {
  id: string;
  search_id: string;
  clerk_user_id: string;
  name: string;
  domain: string;
  website: string;
  crawl_status: string;
  /** companies.fit_state: 'gate' while a plain words company waits to be crawled. */
  fit_state: string | null;
}

export async function runCrawl(deps: PipelineDeps, job: Job, signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const companyId = str(job.payload, 'companyId');
  const [company] = await sql<CompanyRow[]>`
    select id, search_id, clerk_user_id, name, domain, website, crawl_status, fit_state from companies where id = ${companyId}
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

/**
 * How sure nvoke is that a printed address reaches a person or an inbox
 * (emails.confidence). An address whose owner's name was read from the
 * address itself (anna.berg@, nobody printed for it) is less sure of the
 * person than one printed next to their name.
 */
export const PAGE_CONFIDENCE = { personal: 90, nameFromAddress: 80, generic: 60 } as const;

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
 * real crawl, which also refreshes the shared cache. A plain words company
 * with someone to check (needsFit) gets neither yet: it waits for the fit
 * job, which queues them when it keeps the company.
 */
async function finishCrawl(
  deps: PipelineDeps,
  company: CompanyRow,
  status: CrawlOutcome,
  emails: FoundEmail[],
  { crawledAt, texts, people = [], peopleRead = false }: FinishOptions = {},
): Promise<void> {
  const { sql } = deps;
  // A "person" that is the company itself ("Agence Nova" on agencenova.com) is not one.
  people = people.filter((p) => !companyAsPerson(p, company.name));
  const stored = await sql.begin(async (tx) => {
    // Only the first finisher records the crawl (guards against a retried job).
    const claimed = await tx`
      update companies set crawl_status = ${status}, crawled_at = now()
      where id = ${company.id} and crawl_status = 'pending'
      returning id
    `;
    if (claimed.length === 0) return 0;
    const [search] = await tx<{ check_inboxes: boolean }[]>`
      select coalesce((to_jsonb(s) ->> 'check_inboxes')::boolean, false) as check_inboxes from searches s where s.id = ${company.search_id}
    `;

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
    }
    const owners = named.map((p) => ({ firstName: p.first_name, lastName: p.last_name, row: p }));
    const rows = emails.map((e) => {
      const owner = e.kind === 'personal' ? personForAddress(e.address, owners)?.row : undefined;
      // Nobody printed for it: anna.berg@ still names Anna Berg, with no title and less confidence.
      const read = e.kind === 'personal' && !owner ? nameFromLocal(e.address.slice(0, e.address.lastIndexOf('@')), owners) : null;
      return {
        company_id: company.id,
        search_id: company.search_id,
        clerk_user_id: company.clerk_user_id,
        address: e.address,
        kind: e.kind,
        source_url: e.sourceUrl,
        person_id: owner?.id ?? null,
        first_name: owner?.first_name ?? read?.firstName ?? null,
        last_name: owner?.last_name ?? read?.lastName ?? null,
        title: owner?.title ?? null,
        seniority: owner?.seniority ?? null,
        found_via: e.foundVia,
        confidence: read ? PAGE_CONFIDENCE.nameFromAddress : PAGE_CONFIDENCE[e.kind],
      };
    });
    // Fit's second look first: nothing of a company it may turn down is checked or probed.
    const awaitFit = company.fit_state === 'gate' && needsFit(rows, named, search?.check_inboxes ?? false);
    if (awaitFit) await tx`update companies set fit_state = 'pending' where id = ${company.id}`;
    else if (named.length > 0) await enqueue(tx, { type: 'people', payload: { companyId: company.id }, searchId: company.search_id });

    let stored = 0;
    if (rows.length > 0) {
      // Storing costs nothing: the user is charged only when a check comes
      // back valid (runVerify), and unchecked addresses are never shown.
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
      if (!awaitFit) {
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
    }
    await tx`
      update searches
      set companies_crawled = companies_crawled + 1, emails_found = emails_found + ${stored}
      where id = ${company.search_id}
    `;
    // After the search row's update, which holds the other crawls of the search back until this commits.
    if (awaitFit) await queueFit(tx, company.search_id, [company.id], deps.fitWaitMs ?? FIT_WAIT_MS);
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

/**
 * A check we could not make on our side (isCapacityDeferral) goes back in
 * the queue, first after PACED_DELAY_MS when only the minute's slots were
 * taken (smtp_paced, a job that ran out of time), else after
 * CAPACITY_DELAY_MS (port 25 blocked on every IPv4 lane, Google or
 * Microsoft throttling us), doubling each time up to CAPACITY_MAX_DELAY_MS.
 * It never counts as a retry. Past CAPACITY_DEADLINE_MS since the first
 * such wait it settles unknown.
 */
export const PACED_DELAY_MS = 60_000;
export const CAPACITY_DELAY_MS = 10 * 60_000;
export const CAPACITY_MAX_DELAY_MS = 2 * 60 * 60_000;
export const CAPACITY_DEADLINE_MS = 48 * 60 * 60_000;

/** How long a check waits after its `defers`-th capacity wait (0 for the first), with up to 20% jitter so waits spread out. */
export function capacityDelayMs(reason: string, defers: number, retryAfterMs = 0, random: () => number = Math.random): number {
  const base = reason === 'smtp_paced' || reason === 'aborted' ? PACED_DELAY_MS : CAPACITY_DELAY_MS;
  const delay = Math.max(base * 2 ** Math.min(defers, 16), retryAfterMs);
  return Math.min(CAPACITY_MAX_DELAY_MS, Math.round(delay * (1 + random() * 0.2)));
}

/** The capacity wait so far, carried by every requeue of the check, so the deadline is overall. */
function capacityCarry(payload: Record<string, unknown>): Pick<VerifyPayload, 'capacityDefers' | 'capacitySince'> {
  return {
    ...(typeof payload.capacityDefers === 'number' ? { capacityDefers: payload.capacityDefers } : {}),
    ...(typeof payload.capacitySince === 'string' ? { capacitySince: payload.capacitySince } : {}),
  };
}

/**
 * A check that waits for the company's better addresses is woken as soon as
 * one of them settles (wakeDeferredChecks); this is only the fallback.
 */
export const CHECK_DEFER_MS = 5 * 60_000;
/** A check stops waiting after this many defers or this long, whichever comes first, and is decided. */
export const MAX_CHECK_DEFERS = 12;
export const MAX_CHECK_WAIT_MS = 30 * 60_000;

/** The company and search around an address, as checkPolicy needs them. Takes the company's lock. */
async function policyContext(
  tx: TransactionSql,
  emailId: string,
  companyId: string,
  searchId: string,
): Promise<{ others: PolicyEmail[]; ctx: Omit<PolicyContext, 'force'> } | null> {
  const [company] = await tx<{ crawl_status: string; people_pending: boolean; check_inboxes: boolean }[]>`
    select c.crawl_status, exists (
      select 1 from jobs j
      where j.type = 'people' and j.status in ('queued', 'running') and j.payload->>'companyId' = c.id::text
    ) as people_pending,
    coalesce((select (to_jsonb(s) ->> 'check_inboxes')::boolean from searches s where s.id = ${searchId}), false) as check_inboxes
    from companies c where c.id = ${companyId}
    for update of c
  `;
  if (!company) return null;
  const others = await tx<PolicyEmail[]>`
    select address, kind, first_name, last_name, seniority, title, verification, skipped from emails
    where company_id = ${companyId} and id <> ${emailId}
  `;
  return {
    others,
    ctx: { crawlPending: company.crawl_status === 'pending', peoplePending: company.people_pending, checkInboxes: company.check_inboxes },
  };
}

/** How long a deferred check has waited, from its payload. */
interface Waited {
  defers: number;
  since: string | null;
}

/**
 * Applies checkPolicy under the company's lock (the one recordVerification
 * takes), so a decision sees every settled check of the company and a
 * deferred check is queued before anyone can look for it to wake. A skip is
 * recorded here and may settle the company's lead. A check that waited
 * MAX_CHECK_DEFERS times or MAX_CHECK_WAIT_MS is decided without waiting more.
 */
async function decideCheck(
  deps: PipelineDeps,
  emailId: string,
  job: { searchId: string; retry: number; priority: number; waited: Waited; carry: Pick<VerifyPayload, 'capacityDefers' | 'capacitySince'> },
): Promise<Decision | 'gone'> {
  return deps.sql.begin(async (tx) => {
    const [self] = await tx<
      (PolicySelf & { company_id: string; search_id: string; verification: Verification | null; skipped: string | null; fit_state: string | null })[]
    >`
      select e.company_id, e.search_id, e.address, e.kind, e.first_name, e.last_name, e.seniority, e.title, e.verification, e.skipped,
        (select c.fit_state from companies c where c.id = e.company_id) as fit_state
      from emails e where e.id = ${emailId} for update
    `;
    if (!self || self.verification || self.skipped) return 'gone';
    // Its company waits for fit's second look, which queues this check again when it keeps the company.
    if (self.fit_state === 'pending') return 'gone';
    if (checkTier(self) === 'primary') return 'check';
    const around = await policyContext(tx, emailId, self.company_id, self.search_id);
    if (!around) return 'gone';
    const now = deps.now?.() ?? new Date();
    const since = job.waited.since ?? now.toISOString();
    const force = job.waited.defers >= MAX_CHECK_DEFERS || now.getTime() - new Date(since).getTime() >= MAX_CHECK_WAIT_MS;
    let decision = checkPolicy(self, around.others, { ...around.ctx, force });
    if (decision === 'skip' && checkTier(self) === 'role_inbox' && !around.ctx.checkInboxes) {
      // The shared inbox switch may have gone on since it was read: the write reads it again, and decides afresh when it did.
      const [kept] = await tx`
        update emails set skipped = 'role_inbox' where id = ${emailId}
          and not coalesce((select check_inboxes from searches where id = ${self.search_id}), false)
        returning id
      `;
      if (kept) {
        await leadSettled(tx, self.company_id);
        return decision;
      }
      decision = checkPolicy(self, around.others, { ...around.ctx, checkInboxes: true, force });
    }
    if (decision === 'skip') {
      await tx`update emails set skipped = ${checkTier(self)} where id = ${emailId}`;
      await leadSettled(tx, self.company_id);
    } else if (decision === 'defer') {
      // Not a retry: the company's other checks decide whether this one is needed.
      await enqueue(tx, {
        type: 'verify',
        payload: { emailId, retry: job.retry, deferred: true, defers: job.waited.defers + 1, deferredSince: since, ...job.carry },
        searchId: job.searchId,
        runAfter: new Date(now.getTime() + CHECK_DEFER_MS),
        priority: job.priority,
      });
    }
    return decision;
  });
}

/**
 * Wakes the company's deferred checks (checkPolicy) to decide again now: a
 * check of the company settled, or its people job finished. Call it holding
 * the company's lock.
 */
export async function wakeDeferredChecks(tx: TransactionSql, companyId: string): Promise<void> {
  await tx`
    update jobs set run_after = now()
    where type = 'verify' and status = 'queued' and payload ? 'deferred' and run_after > now()
      and payload->>'emailId' in (
        select id::text from emails where company_id = ${companyId} and verification is null and skipped is null
      )
  `;
}

export async function runVerify(deps: PipelineDeps, job: Job, signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const emailId = str(job.payload, 'emailId');
  const [email] = await sql<
    {
      address: string;
      search_id: string;
      clerk_user_id: string;
      verification: Verification | null;
      skipped: string | null;
      kind: string;
      seniority: string | null;
      first_name: string | null;
    }[]
  >`
    select address, search_id, clerk_user_id, verification, skipped, kind, seniority, first_name from emails where id = ${emailId}
  `;
  if (!email || email.verification || email.skipped) return;
  const status = await searchStatus(sql, email.search_id);
  if (status === null || status === 'canceled') return;
  if (await quotaExhausted(sql, email.clerk_user_id, deps.now?.())) {
    await failSearch(sql, email.search_id, QUOTA_EXCEEDED);
    return;
  }

  const retry = typeof job.payload.retry === 'number' ? job.payload.retry : 0;
  const waited = {
    defers: typeof job.payload.defers === 'number' ? job.payload.defers : 0,
    since: typeof job.payload.deferredSince === 'string' ? job.payload.deferredSince : null,
  };
  const carry = capacityCarry(job.payload);
  const decision = await decideCheck(deps, emailId, { searchId: email.search_id, retry, priority: verifyPriority(email), waited, carry });
  if (decision !== 'check') return;

  const result = await deps.verifier.verify(email.address, signal);
  // On shutdown the runner hands the job back as it was.
  if (signal.aborted && signal.reason instanceof Error && signal.reason.name === 'ShutdownSignal') throw signal.reason;
  const at = { searchId: email.search_id, emailId, mxHost: result.mxHost };
  if (isCapacityDeferral(result)) {
    await waitForCapacity(deps, job, email, result, retry);
    return;
  }
  if (isTempfail(result) && retry < GREYLIST_RETRIES) {
    // Greylisting: the server wants us to come back later. A queued job keeps the search running.
    const now = deps.now?.() ?? new Date();
    await enqueue(sql, {
      type: 'verify',
      payload: { emailId, retry: retry + 1, ...carry },
      searchId: email.search_id,
      runAfter: new Date(now.getTime() + GREYLIST_DELAY_MS),
      priority: verifyPriority(email),
    });
    deps.log.info({ ...at, reason: result.reason, retry: retry + 1, delayMs: GREYLIST_DELAY_MS }, 'verify: requeued');
    return;
  }
  // Unknown is the outcome that says the most about our own health (throttling, a blocked port 25).
  if (result.verification === 'unknown') deps.log.info({ ...at, reason: result.reason, retry }, 'verify: unknown');
  await recordVerification(deps, emailId, result.verification);
}

/**
 * A check we could not make (isCapacityDeferral) goes back in the queue,
 * the same job row, later each time (capacityDelayMs), and is never settled
 * for that reason until CAPACITY_DEADLINE_MS has passed since its first such
 * wait. Its greylisting retries are left as they were.
 */
async function waitForCapacity(
  deps: PipelineDeps,
  job: Job,
  email: { search_id: string; kind: string; seniority: string | null; first_name: string | null },
  result: VerifyResult,
  retry: number,
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const emailId = str(job.payload, 'emailId');
  const at = { searchId: email.search_id, emailId, mxHost: result.mxHost };
  const since = typeof job.payload.capacitySince === 'string' ? job.payload.capacitySince : now.toISOString();
  const defers = typeof job.payload.capacityDefers === 'number' ? job.payload.capacityDefers : 0;
  if (now.getTime() - new Date(since).getTime() >= CAPACITY_DEADLINE_MS) {
    deps.log.warn({ ...at, reason: 'capacity_deadline', lastReason: result.reason, defers, since }, 'verify: unknown');
    await recordVerification(deps, emailId, 'unknown');
    return;
  }
  const delayMs = capacityDelayMs(result.reason, defers, result.retryAfterMs);
  const payload: VerifyPayload = { emailId, retry, capacity: true, capacityDefers: defers + 1, capacitySince: since };
  const runAfter = new Date(now.getTime() + delayMs);
  if (!(await requeue(deps.sql, job.id, payload, runAfter))) {
    await enqueue(deps.sql, { type: 'verify', payload, searchId: email.search_id, runAfter, priority: verifyPriority(email) });
  }
  deps.log.info({ ...at, reason: result.reason, defers: defers + 1, delayMs }, 'verify: requeued');
}

/**
 * Records a check. A valid address is charged in the same transaction; when
 * the allowance ran out meanwhile, it stays unchecked (and hidden) and the
 * search stops with quota_exceeded. The policy is applied once more under
 * the company's lock: a role inbox, untitled or unnamed address that
 * became unnecessary while it was checked (a colleague came back valid) is
 * recorded skipped and not charged.
 */
async function recordVerification(deps: PipelineDeps, emailId: string, verification: Verification): Promise<void> {
  const { sql } = deps;
  const outcome = await sql.begin(async (tx) => {
    const [email] = await tx<(PolicySelf & { search_id: string; company_id: string; clerk_user_id: string; address: string })[]>`
      select search_id, company_id, clerk_user_id, address, kind, first_name, last_name, seniority, title from emails
      where id = ${emailId} and verification is null and skipped is null
      for update
    `;
    if (!email) return null;
    // Checks of one company finishing together queue behind this lock, so
    // the last one sees every other result and announces the lead.
    const around = await policyContext(tx, emailId, email.company_id, email.search_id);
    if (around && checkTier(email) !== 'primary' && checkPolicy(email, around.others, { ...around.ctx, force: true }) === 'skip') {
      await tx`update emails set skipped = ${checkTier(email)} where id = ${emailId}`;
      await leadSettled(tx, email.company_id);
      return { searchId: email.search_id, overLimit: false };
    }
    if (verification === 'valid') {
      const [search] = await tx<{ kind: string }[]>`select kind from searches where id = ${email.search_id}`;
      const charge = await chargeVerified(tx, email.clerk_user_id, email.address, deps.now?.(), emailWeight(search?.kind ?? ''));
      if (charge === 'over_limit') return { searchId: email.search_id, overLimit: true };
    }
    await tx`update emails set verification = ${verification}, checked_at = now() where id = ${emailId}`;
    if (verification === 'valid') {
      await tx`update searches set emails_valid = emails_valid + 1 where id = ${email.search_id}`;
    }
    await leadSettled(tx, email.company_id);
    await wakeDeferredChecks(tx, email.company_id);
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
  if (typeof emailId !== 'string') return;
  deps.log.info({ searchId: job.searchId, emailId, reason: 'job_failed' }, 'verify: unknown');
  await recordVerification(deps, emailId, 'unknown');
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

// fit

interface FitRow {
  id: string;
  name: string;
  domain: string;
  website: string;
  source: string;
  source_ref: string | null;
  category: string | null;
  location: string | null;
}

/** How the search found a company, for fit's second look: the job post or list page says what the homepage may not. */
function foundLine(r: FitRow): string | undefined {
  if (r.source === 'hiring') return `a job post for a sales role${r.source_ref ? `: ${r.source_ref}` : ''}`;
  if (r.source === 'list_page' && r.source_ref) return `listed on ${r.source_ref}`;
  const place = [r.category, r.location].filter(Boolean).join(', ');
  return place ? `on the map: ${place}` : undefined;
}

function fitCompanyIds(payload: Record<string, unknown>): string[] {
  const ids = payload.companyIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Fit's second look for crawled plain words companies (leads/fit.ts, mode
 * final), from the homepage title, description and text the crawl kept. A
 * company it keeps, or that Claude could not be asked about at all, gets its
 * checks and people job; one it turns down is deleted with its addresses
 * and people before anything was checked, and its site joins the plan's
 * turned down sites, so no later round finds it again.
 */
export async function runFit(deps: PipelineDeps, job: Job, _signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const searchId = str(job.payload, 'searchId');
  const ids = fitCompanyIds(job.payload);
  if (ids.length === 0) return;
  const [search] = await sql<{ clerk_user_id: string; status: SearchStatus; params: unknown; plan: unknown }[]>`
    select clerk_user_id, status, params, plan from searches where id = ${searchId}
  `;
  // A canceled or stopped search leaves them waiting: its next run queues them again (leads/repo.ts). A done
  // one goes on: the desktop's local crawl hands in addresses after a search ended.
  if (!search || search.status === 'canceled' || search.status === 'failed') return;
  const rows = await sql<FitRow[]>`
    select id, name, domain, website, source, source_ref, category, location from companies
    where id in ${sql(ids)} and search_id = ${searchId} and fit_state = 'pending'
  `;
  if (rows.length === 0) return;
  const pages = await domainPages(sql, rows.map((r) => r.domain));
  const candidates: FitCandidate[] = rows.map((r) => {
    const home = pages.get(r.domain)?.[0];
    return { name: r.name, website: r.website, found: foundLine(r), head: home ? { title: home.title, description: home.description } : null, text: home?.text };
  });
  const params = IcpSearchParams.safeParse(search.params);
  const plan = IcpPlan.safeParse(search.plan);
  const log = deps.log.child({ searchId });
  // Without Claude every company is kept unscored, as the find keeps web results then.
  const verdicts: (FitVerdict | null)[] =
    deps.ai && params.success
      ? await scoreCandidates(
          {
            ai: deps.ai,
            userId: search.clerk_user_id,
            mode: 'final',
            brief: { description: params.data.description, product: params.data.product, plan: plan.success ? plan.data : undefined },
            onError: (err) => log.warn({ err }, 'fit: call failed'),
          },
          candidates,
        )
      : rows.map(() => null);
  const rejected: string[] = [];
  let kept = 0;
  for (const [i, r] of rows.entries()) {
    const v = verdicts[i] ?? null;
    if (!v || v.fit >= FIT_THRESHOLD) {
      if (await keepForChecks(sql, r.id, v)) kept++;
    } else if ((await dropOffTarget(sql, r.id)) && !v.unscored) {
      // A score Claude gave holds for the rest of the search; the 0 of a batch it could not score does not.
      rejected.push(registrableDomain(r.domain));
    }
  }
  if (rejected.length > 0) await sql.begin((tx) => rememberRejected(tx, searchId, rejected));
  log.info({ scored: rows.length, kept, rejected: rejected.length }, 'fit: done');
}

/**
 * Keeps a company that waited for fit: its score and reason are stored, and
 * its people job and a check per unchecked address go in the queue (a check
 * already queued is left to run). False when it no longer waits.
 */
async function keepForChecks(sql: Sql, companyId: string, v: FitVerdict | null): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [company] = await tx<{ search_id: string }[]>`
      update companies set fit_state = 'kept',
        fit = coalesce(${v?.fit ?? null}::smallint, fit), fit_reason = coalesce(${v?.reason || null}::text, fit_reason)
      where id = ${companyId} and fit_state = 'pending'
      returning search_id
    `;
    if (!company) return false;
    const searchId = company.search_id;
    const [named] = await tx`select 1 from people where company_id = ${companyId} limit 1`;
    if (named) await enqueue(tx, { type: 'people', payload: { companyId }, searchId });
    // A running check may have seen the company still waiting and dropped out: only a queued one is left to run.
    const open = await tx<{ id: string; kind: string; seniority: string | null; first_name: string | null }[]>`
      select e.id, e.kind, e.seniority, e.first_name from emails e
      where e.company_id = ${companyId} and e.verification is null and e.skipped is null
        and not exists (
          select 1 from jobs j where j.search_id = ${searchId} and j.type = 'verify' and j.status = 'queued'
            and j.payload->>'emailId' = e.id::text
        )
    `;
    await enqueue(
      tx,
      open.map((r) => ({ type: 'verify' as const, payload: { emailId: r.id }, searchId, priority: verifyPriority(r) })),
    );
    return true;
  });
}

/**
 * Deletes a company fit turned down after its crawl, with its addresses and
 * people, as if it had never been found: nothing of it was checked or
 * charged, and the search's counts drop back. False when it no longer waits.
 */
async function dropOffTarget(sql: Sql, companyId: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [company] = await tx<{ search_id: string; crawled: boolean; emails: number }[]>`
      select search_id, crawl_status <> 'pending' as crawled,
        (select count(*)::int from emails where company_id = ${companyId}) as emails
      from companies where id = ${companyId} and fit_state = 'pending'
      for update
    `;
    if (!company) return false;
    await tx`delete from companies where id = ${companyId}`;
    await tx`
      update searches set companies_found = greatest(0, companies_found - 1),
        companies_crawled = greatest(0, companies_crawled - ${company.crawled ? 1 : 0}),
        emails_found = greatest(0, emails_found - ${company.emails})
      where id = ${company.search_id}
    `;
    return true;
  });
}

/** A fit job out of attempts keeps its companies unscored, so their checks never wait for good. */
export async function onFitGaveUp(deps: PipelineDeps, job: Job): Promise<void> {
  for (const id of fitCompanyIds(job.payload)) await keepForChecks(deps.sql, id, null);
}
