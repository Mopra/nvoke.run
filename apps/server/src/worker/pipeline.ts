// Job handlers for one search: find -> crawl (per company) -> verify (per email).
// A plain words (icp) search scores fit after the crawl: a crawled company
// with someone to check waits for the fit job (per batch of companies), and
// only a company it keeps gets its checks, Claude's read of its people pages
// and its people job.

import type { Logger } from 'pino';
import type { Sql, TransactionSql } from 'postgres';
import {
  DomainsSearchParams,
  emailWeight,
  IcpSearchParams,
  isDecisionMaker,
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
import { checkPolicy, checkTier, needsFit, type Decision, type PolicyContext, type PolicyEmail, type PolicySelf, type SkipReason } from '../leads/check-policy.js';
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
import type { MxLookup } from '../leads/verify/mx.js';
import { leadSettled, searchFinished } from '../webhooks/events.js';
import { cancelSearchJobs, enqueue, FIT_WAIT_MS, flushFit, queueFit, requeue, type Job, type VerifyPayload, verifyPriority } from './queue.js';

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
  /**
   * The free MX lookup before Claude reads a company (verify/mx.ts lookupMx).
   * Without it no domain is taken as mailless.
   */
  mx?: (domain: string) => Promise<MxLookup>;
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
/** All the waiting one find job may do at its limit, so it never holds a find slot for long. */
const FIND_SETTLE_TOTAL_MS = 5 * 60_000;
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
  let settleLeft = FIND_SETTLE_TOTAL_MS;

  // Paid source calls, recorded even when the find fails, so cost per valid email can be measured.
  // own_request (the account's own search key) is counted but not stored: it is not our cost.
  const usage = { request: 0, own_request: 0, cache_hit: 0 };
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
        const wait = Math.min(deps.findSettleMs ?? FIND_SETTLE_MS, Math.max(0, settleLeft));
        const settleStart = Date.now();
        found = await settleFit(sql, searchId, search.limit, wait, signal);
        settleLeft -= Date.now() - settleStart;
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

/** runCrawl's row: an imported company (sending/import.ts) keeps no people, so Claude never reads its people pages. */
interface CrawlCompanyRow extends CompanyRow {
  imported: boolean;
}

export async function runCrawl(deps: PipelineDeps, job: Job, signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const companyId = str(job.payload, 'companyId');
  const [company] = await sql<CrawlCompanyRow[]>`
    select c.id, c.search_id, c.clerk_user_id, c.name, c.domain, c.website, c.crawl_status, c.fit_state,
      coalesce(s.params -> 'import' = 'true'::jsonb, false) as imported
    from companies c join searches s on s.id = c.search_id
    where c.id = ${companyId}
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
  // The cache keeps no people pages (crawl.ts), so a domain whose people
  // pages were never settled is crawled again for Claude's read: a plain
  // words company deferred it and fit turned that company down, or the read
  // failed. A domain that takes no mail is never read, so it stays cached.
  const unsettled =
    cached !== null &&
    deps.ai !== undefined &&
    !company.imported &&
    (cached.crawlStatus === 'done' || cached.crawlStatus === 'js_only') &&
    !cached.people.some((p) => isDecisionMaker(p.seniority)) &&
    !(await peopleSettled(sql, company.domain)) &&
    !(await takesNoMail(deps, company.domain));
  if (cached && !unsettled) {
    const blocked = await suppressedAddresses(sql, cached.emails.map((e) => e.address));
    const emails = cached.emails
      .filter((e) => !blocked.has(e.address))
      .map((e) => ({ address: e.address, kind: classifyAddress(e.address), sourceUrl: e.sourceUrl, foundVia: 'cache' as const }));
    deps.log.debug(
      { companyId, domain: company.domain, status: cached.crawlStatus, emails: emails.length, people: cached.people.length },
      'crawl: cache hit',
    );
    const mailless = !company.imported && (emails.length > 0 || cached.people.length > 0) && (await takesNoMail(deps, company.domain));
    await finishCrawl(deps, company, cached.crawlStatus, emails, { people: cached.people, mailless });
    return;
  }

  const result = await crawlSite(company.website, company.domain, deps.crawl, { signal });
  let people = result.people;
  let peopleRead = false;
  let peopleTexts: SitePage[] | undefined;
  // Free before paid: a domain that takes no mail can never verify, so Claude reads nothing of it.
  const worth = result.emails.length > 0 || people.length > 0 || result.peopleTexts.length > 0;
  const mailless = !unsettled && !company.imported && worth && (await takesNoMail(deps, company.domain));
  // No decision maker among the names the pages gave away: Claude reads the
  // people pages, once per domain in 90 days (the cache keeps what it found).
  // A plain words company keeps the pages for after fit: Claude reads them
  // only when fit keeps the company (runFit). Pages that give Claude nothing
  // to read settle the domain too, so its cache serves the next search.
  if (deps.ai && !company.imported && !mailless && !needsPeopleLlm(people, result.peopleTexts)) peopleRead = true;
  else if (deps.ai && !company.imported && !mailless) {
    const recent = await recentPeopleRead(sql, company.domain, now);
    if (recent) people = mergePeople([...people, ...recent]);
    else if (company.fit_state === 'gate') peopleTexts = result.peopleTexts;
    else {
      const read = await peopleFromText({ ai: deps.ai, log: deps.log }, { userId: company.clerk_user_id, domain: company.domain, texts: result.peopleTexts });
      peopleRead = read !== null;
      people = mergePeople([...people, ...(read ?? [])]);
    }
  }
  deps.log.debug(
    { companyId, domain: company.domain, status: result.status, pages: result.pages.length, emails: result.emails.length, people: people.length },
    'crawl: site done',
  );
  const blocked = await suppressedAddresses(sql, result.emails.map((e) => e.address));
  const emails = result.emails
    .filter((e) => !blocked.has(e.address))
    .map((e) => ({ address: e.address, kind: e.kind, sourceUrl: e.sourceUrl, foundVia: 'page' as const }));
  await finishCrawl(deps, company, result.status, emails, { crawledAt: now, texts: result.texts, people, peopleRead, peopleTexts, mailless });
}

/** Whether the domain's people pages were settled once (domains.people_read_at, see runCrawl). */
async function peopleSettled(sql: Sql, domain: string): Promise<boolean> {
  const [row] = await sql`select 1 from domains where domain = ${domain} and people_read_at is not null`;
  return row !== undefined;
}

/**
 * Whether the domain takes no mail: no MX and no address, or a null MX. No
 * address on it can ever verify and the people job has no server to ask. A
 * lookup that failed proves nothing.
 */
async function takesNoMail(deps: PipelineDeps, domain: string): Promise<boolean> {
  if (!deps.mx) return false;
  const mx = await deps.mx(domain).catch(() => null);
  return mx?.kind === 'none' || mx?.kind === 'null_mx';
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
  /** The people pages were settled in this crawl: Claude read them, or they gave Claude nothing to read. */
  peopleRead?: boolean;
  /** People pages Claude reads once fit keeps the company (needsPeopleLlm said so). */
  peopleTexts?: SitePage[];
  /** The company's domain takes no mail (takesNoMail). */
  mailless?: boolean;
}

/**
 * Stores a crawl outcome for a company: its people, its addresses (linked to
 * the person whose name an address is made from) and a check per new
 * address, then a people job when it named anyone. `crawledAt` is set for a
 * real crawl, which also refreshes the shared cache. A plain words company
 * with someone to check (needsFit), or people pages for Claude to read, gets
 * neither yet: it waits for the fit job, which queues them when it keeps the
 * company. A company whose domain takes no mail keeps no people and gets no
 * people job, and only addresses elsewhere make it wait for fit: its own
 * settle invalid in their checks, which cost nothing.
 */
async function finishCrawl(
  deps: PipelineDeps,
  company: CompanyRow,
  status: CrawlOutcome,
  emails: FoundEmail[],
  { crawledAt, texts, people = [], peopleRead = false, peopleTexts, mailless = false }: FinishOptions = {},
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
    const [search] = await tx<{ check_inboxes: boolean; import: boolean }[]>`
      select coalesce((to_jsonb(s) ->> 'check_inboxes')::boolean, false) as check_inboxes,
        coalesce(s.params -> 'import' = 'true'::jsonb, false) as import
      from searches s where s.id = ${company.search_id}
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
    // An imported lead (sending/import.ts) is written to at its own address only: the crawl fills the page cache,
    // and the imported address's check, which waited for the crawl, runs now.
    if (search?.import) {
      emails = [];
      people = [];
      peopleTexts = undefined;
      await wakeDeferredChecks(tx, company.id);
    }
    // The cache still keeps the names; the company has no address to find for them.
    if (mailless) people = [];

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
    const site = registrableDomain(company.domain);
    const reachable = mailless ? rows.filter((r) => registrableDomain(r.address.slice(r.address.lastIndexOf('@') + 1)) !== site) : rows;
    const toRead = peopleTexts && peopleTexts.length > 0 ? peopleTexts : null;
    const awaitFit = company.fit_state === 'gate' && (needsFit(reachable, named, search?.check_inboxes ?? false) || toRead !== null);
    if (awaitFit) {
      await tx`
        update companies set fit_state = 'pending', people_texts = ${toRead ? tx.json(toRead as unknown as Parameters<typeof tx.json>[0]) : null}
        where id = ${company.id}
      `;
    } else if (named.length > 0) await enqueue(tx, { type: 'people', payload: { companyId: company.id }, searchId: company.search_id });

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
    if (company.fit_state === 'gate') await flushFit(tx, company.search_id);
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
    if (!searchId) return;
    await tx`update searches set companies_crawled = companies_crawled + 1 where id = ${searchId}`;
    await flushFit(tx, searchId);
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

/** The email row recordVerification and the recheck of unknowns lock before they record a check. */
export type CheckedEmail = PolicySelf & { search_id: string; company_id: string; clerk_user_id: string; address: string };

/**
 * Takes the company's lock and applies the policy once more, for a check
 * that came back: the reason to record it skipped when a role inbox, untitled or
 * unnamed address became unnecessary while it was checked (a colleague came
 * back valid), else null. Call it holding the email's lock.
 */
export async function skipAfterCheck(tx: TransactionSql, emailId: string, email: CheckedEmail): Promise<SkipReason | null> {
  // Checks of one company finishing together queue behind this lock, so
  // the last one sees every other result and announces the lead.
  const around = await policyContext(tx, emailId, email.company_id, email.search_id);
  const tier = checkTier(email);
  if (!around || tier === 'primary' || checkPolicy(email, around.others, { ...around.ctx, force: true }) !== 'skip') return null;
  return tier;
}

/**
 * Records a verdict on a locked email: a valid address is charged first and
 * nothing is written when the allowance ran out ('over_limit'). Then the
 * search counts it, the lead may settle and the company's deferred checks
 * wake. `at` defaults to the database clock.
 */
export async function recordVerdict(
  tx: TransactionSql,
  emailId: string,
  email: CheckedEmail,
  verification: Verification,
  opts: { now?: Date; at?: Date } = {},
): Promise<'recorded' | 'over_limit'> {
  if (verification === 'valid') {
    const [search] = await tx<{ kind: string }[]>`select kind from searches where id = ${email.search_id}`;
    const charge = await chargeVerified(tx, email.clerk_user_id, email.address, opts.now, emailWeight(search?.kind ?? ''));
    if (charge === 'over_limit') return 'over_limit';
  }
  await tx`
    update emails set verification = ${verification}, checked_at = coalesce(${opts.at?.toISOString() ?? null}::timestamptz, now())
    where id = ${emailId}
  `;
  if (verification === 'valid') {
    await tx`update searches set emails_valid = emails_valid + 1 where id = ${email.search_id}`;
  }
  await leadSettled(tx, email.company_id);
  await wakeDeferredChecks(tx, email.company_id);
  return 'recorded';
}

/**
 * Records a check. A valid address is charged in the same transaction; when
 * the allowance ran out meanwhile, it stays unchecked (and hidden) and the
 * search stops with quota_exceeded. An address the policy no longer needs
 * (skipAfterCheck) is recorded skipped and not charged.
 */
async function recordVerification(deps: PipelineDeps, emailId: string, verification: Verification): Promise<void> {
  const { sql } = deps;
  const outcome = await sql.begin(async (tx) => {
    const [email] = await tx<CheckedEmail[]>`
      select search_id, company_id, clerk_user_id, address, kind, first_name, last_name, seniority, title from emails
      where id = ${emailId} and verification is null and skipped is null
      for update
    `;
    if (!email) return null;
    const skip = await skipAfterCheck(tx, emailId, email);
    if (skip) {
      await tx`update emails set skipped = ${skip} where id = ${emailId}`;
      await leadSettled(tx, email.company_id);
      return { searchId: email.search_id, overLimit: false };
    }
    const recorded = await recordVerdict(tx, emailId, email, verification, { now: deps.now?.() });
    return { searchId: email.search_id, overLimit: recorded === 'over_limit' };
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
  /** People pages left for Claude to read once fit keeps the company. */
  people_texts: unknown;
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
 * checks, Claude's read of its people pages when the crawl left one, and its
 * people job; one it turns down is deleted with its addresses
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
    select id, name, domain, website, source, source_ref, category, location, people_texts from companies
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
  // The 0 of a batch Claude could not score is no verdict: the company is kept unscored, like one fit gave up on.
  const keeps = rows.map((_, i) => {
    const v = verdicts[i] ?? null;
    return !v || v.unscored || v.fit >= FIT_THRESHOLD;
  });
  const reads = await readPeopleOfKept(deps, search.clerk_user_id, rows.filter((_, i) => keeps[i]));
  const rejected: string[] = [];
  let kept = 0;
  for (const [i, r] of rows.entries()) {
    const v = verdicts[i] ?? null;
    if (keeps[i]) {
      if (await keepForChecks(sql, r.id, v?.unscored ? null : v, reads.get(r.id))) kept++;
    } else if (await dropOffTarget(sql, r.id)) {
      rejected.push(registrableDomain(r.domain));
    }
  }
  if (rejected.length > 0) await sql.begin((tx) => rememberRejected(tx, searchId, rejected));
  log.info({ scored: rows.length, kept, rejected: rejected.length, peopleRead: reads.size }, 'fit: done');
}

/** People pages Claude reads at once after a fit job: a batch keeps up to FIT_BATCH companies. */
const PEOPLE_READS_AT_ONCE = 4;

/** What Claude read on a kept company's people pages, for keepForChecks. */
interface PeopleRead {
  people: FoundPerson[];
  /** Read now, not served from an earlier read of the domain: the domain cache records it. */
  fresh: boolean;
  at: Date;
}

/** The people pages a company kept for after fit (companies.people_texts). */
function storedPages(value: unknown): SitePage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((p: unknown) => {
    if (!p || typeof p !== 'object') return [];
    const { url, title, description, text } = p as Record<string, unknown>;
    if (typeof url !== 'string' || typeof text !== 'string') return [];
    return [{ url, title: typeof title === 'string' ? title : '', description: typeof description === 'string' ? description : '', text }];
  });
}

/**
 * Claude reads the people pages of the companies fit kept, the ones whose
 * crawl left them for after fit (needsPeopleLlm), unless another search read
 * the domain within PEOPLE_READ_DAYS meanwhile. Claude is never paid to
 * read a company fit turns down.
 */
async function readPeopleOfKept(deps: PipelineDeps, userId: string, kept: FitRow[]): Promise<Map<string, PeopleRead>> {
  const out = new Map<string, PeopleRead>();
  const todo = kept.flatMap((r) => {
    const texts = storedPages(r.people_texts);
    return texts.length > 0 ? [{ r, texts }] : [];
  });
  if (!deps.ai || todo.length === 0) return out;
  const at = deps.now?.() ?? new Date();
  for (let i = 0; i < todo.length; i += PEOPLE_READS_AT_ONCE) {
    await Promise.all(
      todo.slice(i, i + PEOPLE_READS_AT_ONCE).map(async ({ r, texts }) => {
        const recent = await recentPeopleRead(deps.sql, r.domain, at);
        if (recent) return out.set(r.id, { people: recent, fresh: false, at });
        const read = await peopleFromText({ ai: deps.ai, log: deps.log }, { userId, domain: r.domain, texts });
        if (read) out.set(r.id, { people: read, fresh: true, at });
      }),
    );
  }
  return out;
}

/**
 * Stores the people Claude read for a kept company and links its personal
 * addresses that no name printed on the site claimed (the crawl stored them
 * before Claude read). A fresh read also goes into the domain cache, after
 * the crawl's people, so the next search of the domain asks no one.
 */
async function storePeopleRead(tx: TransactionSql, company: { id: string; search_id: string; name: string; domain: string }, read: PeopleRead): Promise<void> {
  const people = mergePeople(read.people).filter((p) => !companyAsPerson(p, company.name));
  if (people.length > 0) {
    const rows = people.map((p) => ({
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
    const named = await tx<PersonRow[]>`
      select id, first_name, last_name, title, seniority from people where company_id = ${company.id} order by created_at, id
    `;
    const owners = named.map((p) => ({ firstName: p.first_name, lastName: p.last_name, row: p }));
    const loose = await tx<{ id: string; address: string }[]>`
      select id, address from emails where company_id = ${company.id} and kind = 'personal' and person_id is null
    `;
    for (const e of loose) {
      const owner = personForAddress(e.address, owners)?.row;
      if (!owner) continue;
      await tx`
        update emails set person_id = ${owner.id}, first_name = ${owner.first_name}, last_name = ${owner.last_name},
          title = ${owner.title}, seniority = ${owner.seniority}, confidence = ${PAGE_CONFIDENCE.personal}
        where id = ${e.id}
      `;
    }
  }
  if (!read.fresh) return;
  const at = read.at.toISOString();
  await tx`update domains set people_read_at = ${at} where domain = ${company.domain}`;
  if (people.length === 0) return;
  const [last] = await tx<{ position: number | null }[]>`select max(position)::int as position from domain_people where domain = ${company.domain}`;
  const from = (last?.position ?? -1) + 1;
  const cached = people.map((p, i) => ({
    domain: company.domain,
    first_name: p.firstName,
    last_name: p.lastName,
    title: p.title,
    seniority: p.seniority,
    source_url: p.sourceUrl,
    position: from + i,
    fetched_at: at,
  }));
  await tx`
    insert into domain_people ${tx(cached, 'domain', 'first_name', 'last_name', 'title', 'seniority', 'source_url', 'position', 'fetched_at')}
    on conflict do nothing
  `;
}

/**
 * Keeps a company that waited for fit: its score and reason are stored, the
 * people Claude read on its pages with them, and its people job and a check
 * per unchecked address go in the queue (a check already queued is left to
 * run). False when it no longer waits.
 */
async function keepForChecks(sql: Sql, companyId: string, v: FitVerdict | null, read?: PeopleRead): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [company] = await tx<{ search_id: string; name: string; domain: string }[]>`
      update companies set fit_state = 'kept', people_texts = null,
        fit = coalesce(${v?.fit ?? null}::smallint, fit), fit_reason = coalesce(${v?.reason || null}::text, fit_reason)
      where id = ${companyId} and fit_state = 'pending'
      returning search_id, name, domain
    `;
    if (!company) return false;
    const searchId = company.search_id;
    if (read) await storePeopleRead(tx, { id: companyId, ...company }, read);
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
    // Something of it was already checked or is being worked on (a local crawl can queue work early): keep it.
    const [started] = await tx`
      select 1 where exists (select 1 from emails where company_id = ${companyId} and verification is not null)
        or exists (
          select 1 from jobs where search_id = ${company.search_id} and type in ('verify', 'people')
            and status in ('queued', 'running') and payload->>'companyId' = ${companyId}
        )
        or exists (
          select 1 from jobs j join emails e on e.id::text = j.payload->>'emailId'
          where j.search_id = ${company.search_id} and j.type = 'verify' and j.status in ('queued', 'running')
            and e.company_id = ${companyId}
        )
    `;
    if (started) {
      await tx`update companies set fit_state = 'kept' where id = ${companyId}`;
      return false;
    }
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
