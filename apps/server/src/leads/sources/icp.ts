// "Describe your customer" (docs/SPEC.md): the user says who they sell to in
// plain words and nvoke plans the searches (planner.ts), runs them tier by
// tier until the search holds enough companies, and keeps the ones that fit
// (fit.ts).
//
// Tier 1 runs the core queries, the directory and list page queries and the
// local pairs, interleaved so the first companies arrive within seconds.
// Tier 2 widens to synonyms and adjacent niches, tier 3 to more countries or
// cities, tier 4 reads further result pages of the queries that paid off.
// A result that is a list page ("Top 25 ... agencies", a directory category)
// is read for the companies it links to (listicle.ts): one free page instead
// of many paid requests. Every step says what it does through ctx.onStage.

import type { Sql } from 'postgres';
import type { IcpSearchParams, LocalSearchParams } from '@nvoke/shared';
import { AiError, type Ai } from '../../ai/client.js';
import { normalizeDomain, registrableDomain } from '../domain.js';
import { FIT_BATCH, FIT_THRESHOLD, isObviousNonCompany, scoreCandidates, type FitVerdict } from '../fit.js';
import type { FetchLike } from '../http.js';
import { RateLimiter } from '../limits.js';
import { isDirectoryDomain, isListPage, listPageDeps, mineListPage } from '../listicle.js';
import { makePlan, savePlan, storedPlan, type IcpPlan, type LocalPair, type PlanQuery } from '../planner.js';
import { PermanentError, type FoundCompany, type SourceAdapter } from './types.js';
import { braveQuery, type BraveClient } from './web.js';

/** List pages tried per run. Each is free but takes a few seconds. */
export const MAX_LIST_PAGES = 40;
/** List pages read at once, on different hosts. */
const LIST_CONCURRENCY = 4;
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
/** Paid Brave requests per search when the server sets none (ICP_BRAVE_BUDGET). */
export const DEFAULT_BRAVE_BUDGET = 120;

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
}

type Unit =
  | { type: 'web'; query: PlanQuery; page: number; key: string }
  | { type: 'local'; pair: LocalPair };

interface Pending {
  company: FoundCompany;
  /** The query that found it, for tier 4's choice of queries worth more pages. */
  key?: string;
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

/** "1 country", "6 countries". */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function icpAdapter(opts: IcpAdapterOptions): SourceAdapter<IcpSearchParams> {
  const crawl = listPageDeps(opts.crawl?.limiter ?? new RateLimiter(1_000), opts.listFetch);
  const budget = opts.braveBudget ?? DEFAULT_BRAVE_BUDGET;

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

      // Paid Brave requests (cache misses) of this run, against the search's budget.
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
      const mined = new Set<string>();
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
        // A sign-in or app host stands for the company's own site.
        return APP_HOST.test(domain) ? { ...c, website: `https://${site}` } : c;
      };

      // Fit scoring runs alongside the next queries, a few calls at a time, and yields in order.
      const pending: Pending[] = [];
      const inflight: { done: boolean; result: Promise<Pending[]> }[] = [];
      const startScoring = (batch: Pending[]) => {
        const entry = { done: false, result: Promise.resolve([] as Pending[]) };
        entry.result = scoreCandidates({ ai, userId, brief, onError: (err) => ctx.log.warn({ err }, 'icp: fit call failed') }, batch.map((p) => p.company)).then((verdicts: (FitVerdict | null)[]) => {
          entry.done = true;
          return batch.flatMap((p, i) => {
            const v = verdicts[i];
            const stat = p.key ? stats.get(p.key) : undefined;
            if (v && v.fit < FIT_THRESHOLD) return [];
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
      const readLists = async (urls: string[]): Promise<Pending[]> => {
        const out: Pending[] = [];
        let left = urls.filter((u) => !deadHosts.has(hostOf(u)));
        while (left.length > 0) {
          // One page per host at a time, so a host that refuses us costs one try, not four.
          const batch: string[] = [];
          for (const url of left) {
            if (batch.length < LIST_CONCURRENCY && !batch.some((b) => hostOf(b) === hostOf(url))) batch.push(url);
          }
          left = left.filter((u) => !batch.includes(u));
          listPagesTried += batch.length;
          const results = await Promise.all(
            batch.map((url) =>
              mineListPage(url, crawl, ctx.signal).catch((err: unknown) => {
                if (ctx.signal.aborted) throw err;
                ctx.log.warn({ err, url }, 'icp: list page failed');
                return null;
              }),
            ),
          );
          results.forEach((r, j) => {
            const url = batch[j]!;
            // A host that refuses us, walls us off or links to nothing but itself is not read again.
            if (!r || r.status !== 'ok' || r.candidates.length === 0) deadHosts.add(hostOf(url));
            if (!r || r.status !== 'ok') {
              ctx.log.info({ url, reason: r?.status === 'skipped' ? r.reason : 'error' }, 'icp: list page skipped');
              return;
            }
            listPagesRead++;
            ctx.log.info({ url, candidates: r.candidates.length }, 'icp: list page read');
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
          });
          left = left.filter((u) => !deadHosts.has(hostOf(u)));
        }
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
        const out: Pending[] = [];
        for (const c of page.companies) {
          const url = c.sourceRef ?? c.website;
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
        stats.set(unit.key, { query: unit.query, page: unit.page, more: page.more, candidates: out.length, fits: 0 });
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

      // Tier 4: further pages of the queries whose results fit.
      for (let page = 1; page <= MAX_DEEP_PAGE && more(); page++) {
        const worth = [...stats.entries()]
          .filter(([, s]) => s.page === page - 1 && s.more && s.candidates > 0 && s.fits / s.candidates >= DEEP_FIT_RATE)
          .sort(([, a], [, b]) => b.fits - a.fits);
        if (worth.length === 0) break;
        await setPhrase('deeper', `Reading further results of the ${plural(worth.length, 'search', 'searches')} that paid off`);
        yield* run(worth.map(([key, s]) => ({ type: 'web', query: s.query, page, key })));
      }

      if (ctx.signal.aborted) return;
      ctx.log.info({ yielded, paid, candidates: seen.size, listPagesRead, listPagesTried, deadHosts: [...deadHosts] }, 'icp: finished');
      if (!enough()) {
        const why = budgetSpent() ? `This search used its ${budget} web searches` : 'Every planned search is done';
        await stage(
          'exhausted',
          yielded === 0
            ? `${why} and none of the companies fit. Describe your customer in other words or add countries.`
            : `${why}: found ${yielded} fitting candidates, short of ${ctx.limit}. Describe your customer more broadly or add countries to find more.`,
        );
      }
    },
  };
}
