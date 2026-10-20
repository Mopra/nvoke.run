// "Describe your customer" (docs/SPEC.md): the user says who they sell to in
// plain words and nvoke plans the searches (planner.ts), runs them tier by
// tier until the search holds enough companies, and keeps the ones that fit
// (fit.ts).
//
// Tier 1 runs the core queries, the directory and list page queries and the
// local pairs, interleaved so the first companies arrive within seconds.
// Tier 2 widens to synonyms and adjacent niches, tier 3 to more countries or
// cities, then job posts for sales roles (when the plan has them), and tier 4
// reads further result pages of the queries that paid off.
// A result that is a list page ("Top 25 ... agencies", a directory category)
// is read for the companies it links to, and its next pages when it is
// paginated (listicle.ts): free pages instead of many paid requests. A
// result that is a job post for a sales role on a public job board is
// mapped to the company's own site (hiring.ts): that company is building an
// outbound team now. Every step says what it does through ctx.onStage.
//
// Before any of that, each round asks our own company index
// (company-index.ts): companies an earlier crawl or the launch feed already
// knows, matched on the plan's words. They are scored like Brave's results,
// from the homepage text the crawl kept, so Brave pays only for the gap.

import type { Sql } from 'postgres';
import type { IcpSearchParams, LocalSearchParams } from '@nvoke/shared';
import { AiError, type Ai } from '../../ai/client.js';
import { INDEX_MAX, searchCompanyIndex, type IndexAsk, type IndexCandidate } from '../company-index.js';
import { normalizeDomain, registrableDomain } from '../domain.js';
import { FIT_BATCH, FIT_THRESHOLD, isObviousNonCompany, scoreCandidates, type FitHead, type FitVerdict } from '../fit.js';
import { hiringSnippet, postingFromResult, resolvePosting, type HiringPosting } from '../hiring.js';
import type { FetchLike } from '../http.js';
import { RateLimiter } from '../limits.js';
import { isDirectoryDomain, isListPage, listPageDeps, mineListPage, readHead, type MineResult } from '../listicle.js';
import { keptYields, makePlan, ranKeys, savePlan, storedPlan, type IcpPlan, type LocalPair, type PlanQuery, type QueryYield } from '../planner.js';
import { PermanentError, type FoundCompany, type SourceAdapter } from './types.js';
import { braveQuery, type BraveClient } from './web.js';

/** List pages tried per run, next pages included. Each is free but takes a few seconds. */
export const MAX_LIST_PAGES = 400;
/** List pages read at once, on different hosts. */
const LIST_CONCURRENCY = 6;
/** Bytes all list pages of one run may read, with LIST_PAGE_MAX_BYTES a page: about 200 full pages. */
export const LIST_BYTES_BUDGET = 100_000_000;
/** Time one run may spend reading list pages, so they never crowd out the find job's timeout. */
export const LIST_TIME_BUDGET_MS = 12 * 60_000;
/** Next pages read of one paginated list. */
const MAX_LIST_FOLLOW = 3;
/** Job boards read at once while mapping postings to companies; one host is still read one page at a time. */
const BOARD_CONCURRENCY = 8;
/** Fit calls in flight while the next queries run. */
const FIT_IN_FLIGHT = 3;
/** Companies one local pair may add, so one city cannot fill the search. */
const LOCAL_PER_PAIR = 60;
/** Hosts of a company's app or sign-in rather than its site: "app.acme.com", "account.acme.nl". */
const APP_HOST = /^(app|apps|account|accounts|login|signin|signup|auth|my|portal|dashboard|go|get|try)\./i;
/** Queries failing one after another before the find gives up and the job retries. */
const MAX_FAILED_IN_A_ROW = 4;
/** Deepest result page tier 4 reads (Brave pages are 0 based). */
const MAX_DEEP_PAGE = 3;
/** Share of a query's results that must fit for tier 4 to read its next page. */
const DEEP_FIT_RATE = 0.25;
/** Candidates kept from a query's last page before tier 4 pays for its next one, so a page that kept one or two buys no more. */
export const DEEP_MIN_FITS = 3;
/** Homepages one run reads for fit scoring. Each is free but takes a second or two. */
export const MAX_HEADS = 2_500;
/** Paid Brave requests per search when the server sets none (ICP_BRAVE_BUDGET). */
export const DEFAULT_BRAVE_BUDGET = 120;
/** Sites turned down that a plan remembers, newest kept: about 100 KB of plan at most. */
export const MAX_REJECTED = 5_000;
/** Index candidates asked per company the run still wants: a fit call scores 30 for about a tenth of a cent. */
export const INDEX_PER_WANTED = 3;

export interface IcpAdapterOptions {
  brave: BraveClient;
  /** Plans the queries and scores the fit. Without it the kind is refused. */
  ai?: Ai;
  /** Keeps the plan on the search, so a retry or a later run reuses it. */
  sql?: Sql;
  /** Runs local pairs; without it they are skipped. OpenStreetMap only: it must not call Brave. */
  local?: SourceAdapter<LocalSearchParams>;
  /** The crawler's per host rate limit, shared with list pages. One of its own when absent. */
  crawl?: { limiter: RateLimiter };
  /** Fetch for list pages. Default: one that connects to public addresses only, on every hop. */
  listFetch?: FetchLike;
  /** Paid Brave requests one search may make; cache hits are free. Default DEFAULT_BRAVE_BUDGET. */
  braveBudget?: number;
  /** Whether fit scoring reads the homepages of candidates that are not plainly out. Default true. */
  readHeads?: boolean;
  /** Our own company index, asked before Brave each round. Default: searchCompanyIndex on `sql`; false turns it off. */
  index?: ((ask: IndexAsk) => Promise<IndexCandidate[]>) | false;
}

type Unit =
  | { type: 'web'; query: PlanQuery; page: number; key: string }
  | { type: 'local'; pair: LocalPair };

interface Pending {
  company: FoundCompany;
  /** The query that found it, for tier 4's choice of queries worth more pages. */
  key?: string;
  /** Its homepage's title and description, when the index kept them: fit scoring reads no page then. */
  head?: FitHead;
}

interface QueryStats {
  query: PlanQuery;
  /** The last page read and whether Brave said more exist after it. */
  page: number;
  more: boolean;
  /** Candidates and fits from the last page read. */
  candidates: number;
  fits: number;
}

/** Round robin over lists: [[a1, a2], [b1]] gives [a1, b1, a2]. */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) if (i < l.length) out.push(l[i]!);
  return out;
}

/** Queries spread over their countries, so every country gets results early. */
export function spreadByCountry(queries: PlanQuery[]): PlanQuery[] {
  const groups = new Map<string, PlanQuery[]>();
  for (const q of queries) {
    const key = q.country ?? '';
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  return interleave([...groups.values()]);
}

const queryKey = (q: PlanQuery) => `${q.q.toLowerCase()}|${q.country ?? ''}`;

const webUnits = (queries: PlanQuery[]): Unit[] =>
  spreadByCountry(queries).map((query) => ({ type: 'web', query, page: 0, key: queryKey(query) }));

/**
 * The brand a site stands for across country domains: "acme" for acme.de,
 * acme.co.uk and acme.com. Null when the label is too short or generic to
 * tell companies apart.
 */
export function brandOf(site: string): string | null {
  const label = site.split('.')[0] ?? '';
  return label.length >= 4 ? label : null;
}

/** "1 country", "6 countries". */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function icpAdapter(opts: IcpAdapterOptions): SourceAdapter<IcpSearchParams> {
  const crawl = listPageDeps(opts.crawl?.limiter ?? new RateLimiter(1_000), opts.listFetch);
  const runBudget = opts.braveBudget ?? DEFAULT_BRAVE_BUDGET;
  const sql = opts.sql;
  const index = opts.index === false ? null : (opts.index ?? (sql ? (ask: IndexAsk) => searchCompanyIndex(sql, ask) : null));

  return {
    kind: 'icp',
    async *find(params, ctx) {
      const ai = opts.ai;
      if (!ai) {
        throw new PermanentError('describe your customer is not configured on this server (OPENROUTER_API_KEY is not set)', 'source_not_configured');
      }
      if (!opts.brave.configured) {
        throw new PermanentError('web search is not configured on this server (BRAVE_SEARCH_API_KEY is not set)', 'source_not_configured');
      }
      const userId = ctx.userId;
      if (!userId) throw new Error('icp searches need the account they belong to');

      // Nothing is written on a search that was canceled.
      const stage = async (name: string, note: string) => {
        if (ctx.signal.aborted) return;
        ctx.log.info({ stage: name, note }, 'icp: stage');
        await ctx.onStage?.(name, note);
      };

      // The plan: the stored one when it was made for these words, else a fresh one.
      let plan: IcpPlan | null = opts.sql && ctx.searchId ? await storedPlan(opts.sql, ctx.searchId, params) : null;
      if (!plan) {
        await stage('plan', 'Working out where your customers are');
        try {
          plan = (await makePlan(ai, userId, params)).plan;
        } catch (err) {
          if (err instanceof AiError && (err.code === 'unavailable' || err.code === 'budget_exceeded')) {
            throw new PermanentError(err.message, err.code === 'unavailable' ? 'source_not_configured' : undefined);
          }
          throw err;
        }
        if (opts.sql && ctx.searchId) await savePlan(opts.sql, ctx.searchId, plan);
      }
      ctx.log.info({ plan }, 'icp: plan');
      if (ctx.signal.aborted) return;

      // Paid Brave requests (cache misses) of this run, against the search's
      // budget, or the smaller one an ongoing round reserved (leads/ongoing.ts).
      const budget = Math.min(runBudget, plan.braveBudget ?? runBudget);
      let paid = 0;
      const braveCtx = {
        ...ctx,
        onUsage: (event: 'request' | 'cache_hit') => {
          if (event === 'request') paid++;
          ctx.onUsage?.(event);
        },
      };
      const budgetSpent = () => paid >= budget;
      let budgetNoted = false;
      // Claude could not be asked (no key, budget spent): candidates go on unscored.
      let unscored = false;
      let unscoredNoted = false;

      const brief = { description: params.description, product: params.product, plan };
      const seen = new Set<string>();
      // The same company under another country's domain ("acme.de" and "acme.com") is one company.
      const brands = new Set<string>();
      // Sites this search already holds, and sites the fit score turned down in an earlier round, are never
      // scored again: a fresh round's results overlap the last one's, and every score is a paid call.
      if (opts.sql && ctx.searchId) {
        const held = await opts.sql<{ domain: string }[]>`select domain from companies where search_id = ${ctx.searchId}`;
        for (const { domain } of held) {
          const site = registrableDomain(domain);
          seen.add(site);
          const brand = brandOf(site);
          if (brand) brands.add(brand);
        }
      }
      for (const site of plan.rejected ?? []) seen.add(site);
      const rejectedNow: string[] = [];
      // Result pages read and candidates kept per query, this round and the ones before it.
      const yields = new Map<string, QueryYield>(Object.entries(plan.yields ?? {}).map(([k, y]) => [k, { ...y }]));
      const yieldOf = (key: string): QueryYield => {
        let y = yields.get(key);
        if (!y) yields.set(key, (y = { pages: 0, kept: 0 }));
        return y;
      };
      const heads = { left: MAX_HEADS };
      const mined = new Set<string>();
      // Job boards already mapped this run ("lever:acme"): one company, however many postings.
      const boards = new Set<string>();
      let postingsRead = 0;
      // Candidates the company index offered this round, and how many of them were handed on.
      let indexOffered = 0;
      let indexKept = 0;
      const stats = new Map<string, QueryStats>();
      let yielded = 0;
      let listPagesRead = 0;
      let listPagesTried = 0;
      let failedInARow = 0;
      const deadHosts = new Set<string>();
      let noted = 0;
      let phrase = '';
      let phraseStage = '';
      const enough = () => yielded >= ctx.limit;

      const note = (text: string) => (yielded > 0 ? `Found ${yielded} so far. ${text}` : text);
      const setPhrase = async (name: string, text: string) => {
        phrase = text;
        phraseStage = name;
        noted = yielded;
        await stage(name, note(text));
      };

      /** A new candidate, or null when its site was seen or is plainly not a company. */
      const admit = (c: FoundCompany): FoundCompany | null => {
        const domain = normalizeDomain(c.website);
        if (!domain) return null;
        const site = registrableDomain(domain);
        if (seen.has(site)) return null;
        seen.add(site);
        if (isObviousNonCompany(c.website)) return null;
        const brand = brandOf(site);
        if (brand) {
          if (brands.has(brand)) return null;
          brands.add(brand);
        }
        // A sign-in or app host stands for the company's own site.
        return APP_HOST.test(domain) ? { ...c, website: `https://${site}` } : c;
      };

      // Fit scoring runs alongside the next queries, a few calls at a time, and yields in order.
      const pending: Pending[] = [];
      const inflight: { done: boolean; result: Promise<Pending[]> }[] = [];
      const startScoring = (batch: Pending[]) => {
        const entry = { done: false, result: Promise.resolve([] as Pending[]) };
        const fitOpts = {
          ai,
          userId,
          brief,
          heads,
          readHead: opts.readHeads === false ? undefined : (website: string) => readHead(website, crawl, ctx.signal),
          onError: (err: unknown) => ctx.log.warn({ err }, 'icp: fit call failed'),
        };
        const candidates = batch.map((p) => (p.head ? { ...p.company, head: p.head } : p.company));
        entry.result = scoreCandidates(fitOpts, candidates).then((verdicts: (FitVerdict | null)[]) => {
          entry.done = true;
          return batch.flatMap((p, i) => {
            const v = verdicts[i];
            const stat = p.key ? stats.get(p.key) : undefined;
            if (v && v.fit < FIT_THRESHOLD) {
              // A score Claude gave, not the 0 of a batch it could not score, holds for the rest of the search.
              const domain = normalizeDomain(p.company.website);
              if (domain && !v.unscored) rejectedNow.push(registrableDomain(domain));
              return [];
            }
            if (v && p.key) yieldOf(p.key).kept++;
            // No verdict means Claude could not be asked: a web result stays unscored, a bare link from a list page is dropped.
            if (!v) {
              unscored = true;
              if (p.company.source === 'list_page') return [];
            }
            if (stat) stat.fits++;
            return [{ ...p, company: v ? { ...p.company, fit: v.fit, fitReason: v.reason } : p.company }];
          });
        });
        // Rejections surface when the entry is awaited.
        entry.result.catch(() => undefined);
        inflight.push(entry);
      };
      const flush = (all: boolean) => {
        while (pending.length >= FIT_BATCH || (all && pending.length > 0)) startScoring(pending.splice(0, FIT_BATCH));
      };
      async function* emit(kept: Pending[]): AsyncGenerator<FoundCompany> {
        for (const p of kept) {
          if (enough() || ctx.signal.aborted) return;
          // Counts what was handed on: the find job may still skip a company the search holds.
          if (yielded + 1 >= ctx.limit) await stage('done', `Found ${ctx.limit} fitting candidates, enough for this search`);
          yielded++;
          if (p.company.source === 'index') indexKept++;
          yield p.company;
        }
      }
      /** Yields what has been scored; waits while too many calls are in flight, or for all of them. */
      async function* drain(all: boolean): AsyncGenerator<FoundCompany> {
        while (inflight.length > 0 && (all || inflight[0]!.done || inflight.length > FIT_IN_FLIGHT)) {
          const kept = await inflight.shift()!.result;
          if (ctx.signal.aborted) return;
          yield* emit(kept);
          if (enough()) return;
        }
      }

      const hostOf = (url: string) => registrableDomain(normalizeDomain(url) ?? url);
      // What all list pages of this run took, against LIST_BYTES_BUDGET and LIST_TIME_BUDGET_MS.
      let listBytes = 0;
      let listMs = 0;
      let listBudgetLogged = false;
      /**
       * Reads list pages through a small pool: up to LIST_CONCURRENCY at once,
       * one per host at a time (a host that refuses us costs one try), the
       * next page starting as soon as any finishes. Plain next pages of lists
       * that named companies join the queue. Stops starting pages once the
       * run's list page bytes or time are spent.
       */
      const readLists = async (urls: string[]): Promise<Pending[]> => {
        const out: Pending[] = [];
        const started = Date.now();
        const spent = () => listBytes >= LIST_BYTES_BUDGET || listMs + (Date.now() - started) >= LIST_TIME_BUDGET_MS;
        // How deep into a paginated list each address is: 0 for the page the search found.
        const depth = new Map(urls.map((u) => [u, 0]));
        let queue = urls.filter((u) => !deadHosts.has(hostOf(u)));
        const busy = new Set<string>();
        const running = new Set<Promise<void>>();
        const handle = (url: string, r: MineResult | null) => {
          if (r) listBytes += r.bytes;
          // A host that refuses us, walls us off or links to nothing but itself is not read again.
          if (!r || r.status !== 'ok' || r.candidates.length === 0) deadHosts.add(hostOf(url));
          if (!r || r.status !== 'ok') {
            ctx.log.info({ url, reason: r?.status === 'skipped' ? r.reason : 'error' }, 'icp: list page skipped');
            return;
          }
          listPagesRead++;
          ctx.log.info({ url, candidates: r.candidates.length, next: r.next }, 'icp: list page read');
          // A plain next page of a list that named companies is read too, a few pages deep.
          const d = depth.get(url) ?? 0;
          if (r.next && r.candidates.length > 0 && d < MAX_LIST_FOLLOW && !mined.has(r.next) && listPagesTried + queue.length < MAX_LIST_PAGES) {
            mined.add(r.next);
            depth.set(r.next, d + 1);
            queue.push(r.next);
          }
          for (const c of r.candidates) {
            const company = admit({
              name: c.name,
              website: c.website,
              source: 'list_page',
              sourceRef: url,
              title: r.title ? `Listed on: ${r.title}` : undefined,
              snippet: c.context || undefined,
            });
            if (company) out.push({ company });
          }
        };
        const start = (url: string) => {
          const host = hostOf(url);
          busy.add(host);
          listPagesTried++;
          const task: Promise<void> = mineListPage(url, crawl, ctx.signal)
            .catch((err: unknown) => {
              if (ctx.signal.aborted) return null;
              ctx.log.warn({ err, url }, 'icp: list page failed');
              return null;
            })
            .then((r) => handle(url, r))
            .finally(() => {
              busy.delete(host);
              running.delete(task);
            });
          running.add(task);
        };
        try {
          while (!ctx.signal.aborted) {
            queue = queue.filter((u) => !deadHosts.has(hostOf(u)));
            if (spent() && queue.length > 0) {
              if (!listBudgetLogged) {
                listBudgetLogged = true;
                ctx.log.info({ listBytes, listMs: listMs + (Date.now() - started), left: queue.length }, 'icp: list page budget spent');
              }
              queue = [];
            }
            while (running.size < LIST_CONCURRENCY) {
              const i = queue.findIndex((u) => !busy.has(hostOf(u)));
              if (i < 0) break;
              start(queue.splice(i, 1)[0]!);
            }
            if (running.size === 0) break;
            await Promise.race(running);
          }
          // A canceled search waits only for the pages already in flight.
          await Promise.allSettled([...running]);
        } finally {
          listMs += Date.now() - started;
        }
        return out;
      };

      /** Maps job posts to the companies behind them, a few boards at a time; a board that does not say is skipped. */
      const readPostings = async (postings: HiringPosting[], key: string): Promise<Pending[]> => {
        const out: Pending[] = [];
        let next = 0;
        const worker = async () => {
          while (next < postings.length && !ctx.signal.aborted) {
            const posting = postings[next++]!;
            postingsRead++;
            const found = await resolvePosting(posting, crawl, ctx.signal).catch((err: unknown) => {
              if (ctx.signal.aborted) throw err;
              ctx.log.warn({ err, url: posting.url }, 'icp: job board failed');
              return null;
            });
            if (!found) continue;
            const company = admit({
              name: found.name,
              website: found.website,
              source: 'hiring',
              sourceRef: posting.url,
              title: `Hiring: ${posting.role}`,
              snippet: hiringSnippet(found),
            });
            if (company) out.push({ company, key });
          }
        };
        await Promise.all(Array.from({ length: Math.min(BOARD_CONCURRENCY, postings.length) }, worker));
        return out;
      };

      /** Runs one unit and returns its new candidates. */
      const collect = async (unit: Unit): Promise<Pending[]> => {
        if (unit.type === 'local') {
          if (!opts.local) return [];
          const out: Pending[] = [];
          let n = 0;
          try {
            for await (const c of opts.local.find(unit.pair, { ...braveCtx, limit: LOCAL_PER_PAIR, onStage: undefined })) {
              const company = admit({ ...c, snippet: c.snippet ?? [c.category, c.location].filter(Boolean).join(', ') });
              if (company) out.push({ company });
              if (++n >= LOCAL_PER_PAIR) break;
            }
          } catch (err) {
            // A place the map cannot find costs that pair, not the search.
            if (!(err instanceof PermanentError) || ctx.signal.aborted) throw err;
            ctx.log.warn({ err, pair: unit.pair }, 'icp: local pair skipped');
            await stage(phraseStage || 'core', note(`Could not find ${unit.pair.location} on the map, skipping it`));
          }
          return out;
        }
        const { q, country } = braveQuery({ keyword: unit.query.q, country: unit.query.country });
        const page = await opts.brave.page({ q, country, page: unit.page }, braveCtx);
        const lists: string[] = [];
        const postings: HiringPosting[] = [];
        const out: Pending[] = [];
        for (const c of page.companies) {
          const url = c.sourceRef ?? c.website;
          const posting = postingFromResult(url, c.title);
          if (posting) {
            const board = `${posting.ats}:${posting.slug.toLowerCase()}`;
            if (!boards.has(board)) {
              boards.add(board);
              postings.push(posting);
            }
            continue;
          }
          if (isListPage(url, c.title)) {
            if (!mined.has(url) && !deadHosts.has(hostOf(url)) && listPagesTried + lists.length < MAX_LIST_PAGES) {
              mined.add(url);
              lists.push(url);
            }
            // A directory page is never a company; a list on a company's own blog may be one.
            const domain = normalizeDomain(c.website);
            if (domain && isDirectoryDomain(domain)) continue;
          }
          const company = admit(c);
          if (company) out.push({ company, key: unit.key });
        }
        if (postings.length > 0) {
          await stage('hiring', note(`Reading ${plural(postings.length, 'job post', 'job posts')} for sales roles`));
          out.push(...(await readPostings(postings, unit.key)));
          if (phrase) await stage(phraseStage, note(phrase));
        }
        stats.set(unit.key, { query: unit.query, page: unit.page, more: page.more, candidates: out.length, fits: 0 });
        yieldOf(unit.key).pages++;
        if (lists.length > 0) {
          const directories = lists.filter((u) => isDirectoryDomain(hostOf(u))).length;
          const reading = [
            lists.length > directories ? plural(lists.length - directories, 'list page', 'list pages') : '',
            directories ? plural(directories, 'agency directory', 'agency directories') : '',
          ].filter(Boolean);
          await stage('lists', note(`Reading ${reading.join(' and ')}`));
          out.push(...(await readLists(lists)));
          if (phrase) await stage(phraseStage, note(phrase));
        }
        return out;
      };

      async function* run(units: Unit[]): AsyncGenerator<FoundCompany> {
        for (const unit of units) {
          if (enough() || ctx.signal.aborted) return;
          if (unit.type === 'web' && budgetSpent()) {
            if (!budgetNoted) {
              budgetNoted = true;
              await stage('budget', note(`Used this search's ${budget} web searches. Finishing the list pages and places already found`));
            }
            continue;
          }
          try {
            pending.push(...(await collect(unit)));
            failedInARow = 0;
          } catch (err) {
            // One bad query is skipped; a run of them means the network or Brave is down, and the job retries.
            if (err instanceof PermanentError || ctx.signal.aborted || ++failedInARow >= MAX_FAILED_IN_A_ROW) throw err;
            ctx.log.warn({ err, unit }, 'icp: unit failed, going on');
          }
          if (ctx.signal.aborted) return;
          flush(false);
          yield* drain(false);
          if (ctx.signal.aborted) return;
          if (unscored && !unscoredNoted) {
            unscoredNoted = true;
            await stage(phraseStage, note('Claude is out of reach for this account, so web results go on unscored and list page links are left out'));
          }
          if (yielded - noted >= 25 && phrase && !enough()) {
            noted = yielded;
            await stage(phraseStage, note(phrase));
          }
        }
        if (ctx.signal.aborted) return;
        flush(true);
        yield* drain(true);
      }
      /** Whether the next tier may run: short of the limit, not canceled, paid searches left. */
      const more = () => !enough() && !ctx.signal.aborted && !budgetSpent();

      /** Writes what this run learned to the plan, for the next round: per query yields and the sites turned down. */
      const persist = async () => {
        if (!opts.sql || !ctx.searchId) return;
        const rejected = [...new Set([...(plan.rejected ?? []), ...rejectedNow])].slice(-MAX_REJECTED);
        const learned = { yields: keptYields(Object.fromEntries(yields), ranKeys(plan)), rejected };
        await opts.sql`
          update searches set plan = plan || ${opts.sql.json(learned as never)} where id = ${ctx.searchId} and plan->>'key' = ${plan.key}
        `;
      };

      /**
       * Tier 0: our own company index. Free, so it goes first, and its
       * candidates are scored before any query runs: Brave pays only for
       * what the index left short.
       */
      async function* fromIndex(): AsyncGenerator<FoundCompany> {
        if (!index || ctx.signal.aborted) return;
        let found: IndexCandidate[];
        try {
          found = await index({ plan: runPlan, exclude: seen, limit: Math.min(INDEX_MAX, ctx.limit * INDEX_PER_WANTED) });
        } catch (err) {
          // The index is a saving, never a reason to fail the search.
          if (ctx.signal.aborted) return;
          ctx.log.warn({ err }, 'icp: company index failed, going on with web search');
          return;
        }
        for (const c of found) {
          const company = admit({ name: c.name, website: c.website, source: 'index', sourceRef: c.domain, snippet: c.snippet || undefined });
          if (company) pending.push({ company, head: c.head });
        }
        indexOffered = pending.length;
        ctx.log.info({ found: found.length, offered: indexOffered }, 'icp: company index');
        if (indexOffered === 0) return;
        await setPhrase('index', `Checking ${plural(indexOffered, 'company', 'companies')} nvoke already knows`);
        flush(true);
        yield* drain(true);
        ctx.log.info({ offered: indexOffered, kept: indexKept }, 'icp: company index scored');
      }

      const runPlan: IcpPlan = plan;
      async function* tiers(): AsyncGenerator<FoundCompany> {
        const plan = runPlan;
        yield* fromIndex();
        if (enough() || ctx.signal.aborted) return;
        // Tier 1: core queries, directories and local pairs, interleaved.
        const tier1 = interleave<Unit>([webUnits(plan.core), webUnits(plan.directories), plan.local.map((pair) => ({ type: 'local', pair }))]);
        const countries = new Set([...plan.core, ...plan.directories].map((q) => q.country).filter(Boolean));
        const webCount = plan.core.length + plan.directories.length;
        const searching = [
          webCount ? `${plural(webCount, 'query', 'queries')} in ${countries.size ? plural(countries.size, 'country', 'countries') : 'every country'}` : '',
          plan.local.length ? `${plural(plan.local.length, 'place', 'places')} on the map` : '',
        ].filter(Boolean);
        await setPhrase('core', `Searching ${searching.join(' and ')}`);
        yield* run(tier1);

        // Tier 2: synonyms and adjacent niches.
        if (more() && plan.adjacent.length) {
          await setPhrase('adjacent', 'Widening to adjacent niches');
          yield* run(webUnits(plan.adjacent));
        }

        // Tier 3: further countries or cities.
        if (more() && plan.wider.length) {
          const fresh = new Set(plan.wider.map((q) => q.country).filter((c): c is string => !!c && !countries.has(c)));
          await setPhrase('widen_geo', fresh.size ? `Looking in ${plural(fresh.size, 'more country', 'more countries')}` : 'Looking in more cities');
          yield* run(webUnits(plan.wider));
        }

        // Tier 3b: job posts for sales roles. Many companies a request, but most are larger or out of reach of a
        // homepage check, so they come after the queries that land on fitting companies' own words.
        if (more() && plan.hiring?.length) {
          await setPhrase('hiring', 'Looking for companies hiring salespeople');
          yield* run(webUnits(plan.hiring));
        }

        // Tier 4: further pages of the queries whose results fit.
        for (let page = 1; page <= MAX_DEEP_PAGE && more(); page++) {
          const worth = [...stats.entries()]
            .filter(([, s]) => s.page === page - 1 && s.more && s.fits >= DEEP_MIN_FITS && s.fits / s.candidates >= DEEP_FIT_RATE)
            .sort(([, a], [, b]) => b.fits - a.fits);
          if (worth.length === 0) break;
          await setPhrase('deeper', `Reading further results of the ${plural(worth.length, 'search', 'searches')} that paid off`);
          yield* run(worth.map(([key, s]) => ({ type: 'web', query: s.query, page, key })));
        }

        if (ctx.signal.aborted) return;
        ctx.log.info(
          { yielded, paid, indexOffered, indexKept, candidates: seen.size, listPagesRead, listPagesTried, listBytes, listMs, postingsRead, boards: boards.size, deadHosts: [...deadHosts] },
          'icp: finished',
        );
        if (!enough()) {
          const why = budgetSpent() ? `This search used its ${budget} web searches` : 'Every planned search is done';
          await stage(
            'exhausted',
            yielded === 0
              ? `${why} and none of the companies fit. Describe your customer in other words or add countries.`
              : `${why}: found ${yielded} fitting candidates, short of ${ctx.limit}. Describe your customer more broadly or add countries to find more.`,
          );
        }
      }

      try {
        yield* tiers();
      } finally {
        // Also when the pipeline stops early (the limit is reached) or the search is canceled.
        await persist().catch((err: unknown) => ctx.log.warn({ err }, 'icp: could not save what the run learned'));
      }
    },
  };
}
