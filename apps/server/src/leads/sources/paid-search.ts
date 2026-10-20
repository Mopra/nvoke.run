// The paid web searches: a primary (WEB_SEARCH_PROVIDER, Brave by default)
// and an optional fallback (WEB_SEARCH_FALLBACK), each with its own key,
// price and monthly budget. Mwmbl (free-search.ts) stays the last, free
// fallback behind both.
//
// Without a fallback and with Brave as the primary, nothing here runs: the
// Brave client answers alone, exactly as before this file existed, and the
// pipeline's Brave budget alert prices its requests.
//
// Otherwise a page goes to the primary unless it is paused (source_pauses,
// by any process), down in this process after a refusal, or past its
// monthly budget, and to the fallback when the primary refuses us, fails or
// is skipped. Each provider's paid requests are counted per UTC month
// (web_search_usage) and priced at its own rate, with alerts at 80% and 100%
// of its budget that name it. searches.source_requests still counts every
// paid request of a search, whoever answered.
//
// Both providers read and write the one result cache under the same keys.
// A page is the same window of 20 results either way (serper.ts), so a page
// one provider fetched is free for the other and switching providers never
// pays twice for a fresh query. The cache's retention is unchanged.

import type { Sql } from 'postgres';
import type { Alerter } from '../../alerts.js';
import type { Env } from '../../env.js';
import type { FetchLike } from '../http.js';
import type { CachedWebPage, WebSearchCache } from '../web-cache.js';
import { serperProvider } from './serper.js';
import { PermanentError, SourceUnavailableError, type SourceContext } from './types.js';
import { braveClient, type BraveClient, type BravePageRequest } from './web.js';

export const WEB_SEARCH_PROVIDERS = ['brave', 'serper'] as const;
export type WebSearchProviderName = (typeof WEB_SEARCH_PROVIDERS)[number];

/** Where the operator raises a provider's limit or tops up its credit. */
export const SEARCH_DASHBOARDS: Record<WebSearchProviderName, string> = {
  brave: 'https://api-dashboard.search.brave.com/app/subscriptions/usage-limits',
  serper: 'https://serper.dev/dashboard',
};

const LABELS: Record<WebSearchProviderName, string> = { brave: 'Brave Search', serper: 'Serper' };

/** How long a budget read is trusted before the table is asked again. */
const BUDGET_READ_MS = 30_000;

export type PaidSearchEnv = Pick<Env, 'BRAVE_SEARCH_API_KEY'> &
  Partial<
    Pick<
      Env,
      | 'BRAVE_COST_PER_1000_USD'
      | 'BRAVE_MONTHLY_BUDGET_USD'
      | 'BRAVE_REQUESTS_PER_SECOND'
      | 'WEB_SEARCH_PROVIDER'
      | 'WEB_SEARCH_FALLBACK'
      | 'SERPER_API_KEY'
      | 'SERPER_COST_PER_1000_USD'
      | 'SERPER_MONTHLY_BUDGET_USD'
    >
  >;

/** The primary, then the fallback when one is set and differs from it. */
export function paidSearchChain(env: Partial<Pick<Env, 'WEB_SEARCH_PROVIDER' | 'WEB_SEARCH_FALLBACK'>>): WebSearchProviderName[] {
  const primary = env.WEB_SEARCH_PROVIDER ?? 'brave';
  const fallback = env.WEB_SEARCH_FALLBACK;
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

/** True for the default set up (Brave alone): the Brave client answers alone, as it always has. */
export function braveAlone(env: Partial<Pick<Env, 'WEB_SEARCH_PROVIDER' | 'WEB_SEARCH_FALLBACK'>>): boolean {
  const chain = paidSearchChain(env);
  return chain.length === 1 && chain[0] === 'brave';
}

function keyOf(env: PaidSearchEnv, name: WebSearchProviderName): string | undefined {
  return name === 'serper' ? env.SERPER_API_KEY : env.BRAVE_SEARCH_API_KEY;
}

/** Dollars per 1,000 paid requests of a provider. */
export function costPer1000(env: PaidSearchEnv, name: WebSearchProviderName): number {
  // The defaults match env.ts.
  return name === 'serper' ? (env.SERPER_COST_PER_1000_USD ?? 1) : (env.BRAVE_COST_PER_1000_USD ?? 5);
}

function budgetOf(env: PaidSearchEnv, name: WebSearchProviderName): number | undefined {
  return name === 'serper' ? env.SERPER_MONTHLY_BUDGET_USD : env.BRAVE_MONTHLY_BUDGET_USD;
}

/** Whether any paid web search has its key. */
export function webSearchConfigured(env: PaidSearchEnv): boolean {
  return paidSearchChain(env).some((name) => Boolean(keyOf(env, name)));
}

/** The primary's price, for the cost report. */
export function webSearchCostPer1000(env: PaidSearchEnv): number {
  return costPer1000(env, paidSearchChain(env)[0]!);
}

/** Paid requests per provider and UTC month (web_search_usage). */
export interface WebSearchUsage {
  add(provider: string, requests: number, now: Date): Promise<void>;
  month(provider: string, now: Date): Promise<number>;
}

const monthOf = (now: Date) => `${now.toISOString().slice(0, 7)}-01`;

export function dbWebSearchUsage(sql: Sql): WebSearchUsage {
  return {
    async add(provider, requests, now) {
      await sql`
        insert into web_search_usage (provider, month, requests) values (${provider}, ${monthOf(now)}::date, ${requests})
        on conflict (provider, month) do update set requests = web_search_usage.requests + excluded.requests
      `;
    },
    async month(provider, now) {
      const [row] = await sql<{ requests: number }[]>`
        select requests from web_search_usage where provider = ${provider} and month = ${monthOf(now)}::date
      `;
      return row?.requests ?? 0;
    },
  };
}

export interface PaidSearchEntry {
  name: WebSearchProviderName;
  client: BraveClient;
  costPer1000Usd: number;
  monthlyBudgetUsd?: number;
}

export interface PaidSearchOptions {
  /** The primary first, then the fallback. */
  entries: PaidSearchEntry[];
  usage?: WebSearchUsage;
  /** Whether a provider is paused in source_pauses (by any process). */
  paused?: (name: WebSearchProviderName) => Promise<boolean>;
  /**
   * A provider refused us: pause it and tell the operator. Called once per
   * refusing provider when the call is over, with the provider that answered
   * the page instead, or null when none did (the free search takes over).
   */
  onUnavailable?: (err: SourceUnavailableError, answeredBy: WebSearchProviderName | null) => Promise<void>;
  alert?: Alerter;
  now?: () => Date;
  /** How long a refusal sends this process past a provider. Default 10 minutes. */
  downMs?: number;
}

/** A provider paused, down or over budget, and why. */
type Skip = { why: 'down' | 'budget'; reason: string };

/**
 * The paid web searches as one client. When every provider is out, it
 * throws the last refusal, so the free search takes over as it does for
 * Brave alone.
 */
export function paidSearchClient(opts: PaidSearchOptions): BraveClient {
  const now = opts.now ?? (() => new Date());
  const downMs = opts.downMs ?? 10 * 60_000;
  const down = new Map<string, { until: number; reason: string }>();
  const pausedRead = new Map<string, { at: number; paused: boolean }>();
  const spentRead = new Map<string, { at: number; month: string; requests: number }>();
  const configured = opts.entries.filter((e) => e.client.configured);

  const isPaused = async (e: PaidSearchEntry): Promise<boolean> => {
    if (!opts.paused) return false;
    const t = now().getTime();
    const read = pausedRead.get(e.name);
    if (read && t - read.at < BUDGET_READ_MS) return read.paused;
    const paused = await opts.paused(e.name).catch(() => false);
    pausedRead.set(e.name, { at: t, paused });
    return paused;
  };

  /** Paid requests this month, from the table at most every BUDGET_READ_MS. */
  const requestsThisMonth = async (e: PaidSearchEntry): Promise<number> => {
    if (!opts.usage) return 0;
    const at = now();
    const month = monthOf(at);
    const read = spentRead.get(e.name);
    if (read && read.month === month && at.getTime() - read.at < BUDGET_READ_MS) return read.requests;
    const requests = await opts.usage.month(e.name, at).catch(() => read?.requests ?? 0);
    spentRead.set(e.name, { at: at.getTime(), month, requests });
    return requests;
  };

  const spentUsd = async (e: PaidSearchEntry) => ((await requestsThisMonth(e)) / 1_000) * e.costPer1000Usd;

  const skip = async (e: PaidSearchEntry): Promise<Skip | null> => {
    const d = down.get(e.name);
    if (d && now().getTime() < d.until) return { why: 'down', reason: d.reason };
    if (await isPaused(e)) return { why: 'down', reason: 'paused' };
    if (e.monthlyBudgetUsd && (await spentUsd(e)) >= e.monthlyBudgetUsd) {
      return { why: 'budget', reason: `past its $${e.monthlyBudgetUsd} monthly budget` };
    }
    return null;
  };

  const budgetAlert = async (e: PaidSearchEntry, ctx: SourceContext): Promise<void> => {
    if (!e.monthlyBudgetUsd || !opts.alert) return;
    const at = now();
    const requests = await requestsThisMonth(e);
    const spent = (requests / 1_000) * e.costPer1000Usd;
    const share = spent / e.monthlyBudgetUsd;
    const level = share >= 1 ? 100 : share >= 0.8 ? 80 : null;
    if (level === null) return;
    const month = at.toISOString().slice(0, 7);
    const others = configured.filter((o) => o !== e).map((o) => LABELS[o.name]);
    await opts.alert
      .send({
        key: `web-search-budget:${e.name}:${month}:${level}`,
        everyMs: 40 * 86_400_000,
        subject: `${LABELS[e.name]} spend at ${level}% of the $${e.monthlyBudgetUsd} budget`,
        text: [
          `About $${spent.toFixed(2)} of ${LABELS[e.name]} used in ${month} (${requests} paid requests), against a budget of $${e.monthlyBudgetUsd}.`,
          '',
          others.length
            ? `Past 100% web searches go to ${others.join(' and ')} instead, until the month ends or the budget is raised.`
            : 'Past 100% it keeps answering: the limit in its dashboard is the hard stop, and then web searches fall back to the free search.',
          `Raise the limit here: ${SEARCH_DASHBOARDS[e.name]}`,
          `Then raise ${e.name.toUpperCase()}_MONTHLY_BUDGET_USD in /opt/nvoke/.env to match and restart the worker.`,
        ].join('\n'),
      })
      .catch((err: unknown) => ctx.log.warn({ err }, 'web search: budget alert failed'));
  };

  /** One provider's page, its paid requests counted for it and for the search. */
  const ask = async (e: PaidSearchEntry, req: BravePageRequest, ctx: SourceContext): Promise<CachedWebPage> => {
    let paid = 0;
    const counted: SourceContext = {
      ...ctx,
      onUsage: (event) => {
        if (event === 'request') paid++;
        ctx.onUsage?.(event);
      },
    };
    try {
      return await e.client.page(req, counted);
    } finally {
      if (paid > 0) {
        const at = now();
        await opts.usage?.add(e.name, paid, at).catch((err: unknown) => ctx.log.warn({ err }, 'web search: could not count usage'));
        const read = spentRead.get(e.name);
        if (read && read.month === monthOf(at)) read.requests += paid;
        await budgetAlert(e, ctx);
      }
    }
  };

  return {
    configured: configured.length > 0,
    cached: configured[0]?.client.cached ?? opts.entries[0]?.client.cached,
    async page(req, ctx) {
      if (configured.length === 0) {
        // Says which key is missing, as the primary alone would.
        return opts.entries[0]!.client.page(req, ctx);
      }
      const cached = await configured[0]!.client.cached?.(req, ctx);
      if (cached) return cached;

      // Usable providers in order; over budget ones go last, so they answer only when nothing else can.
      const usable: PaidSearchEntry[] = [];
      const overBudget: PaidSearchEntry[] = [];
      let lastRefusal: SourceUnavailableError | undefined;
      for (const e of configured) {
        const s = await skip(e);
        if (!s) usable.push(e);
        else if (s.why === 'budget') overBudget.push(e);
        else lastRefusal = new SourceUnavailableError(e.name, s.reason === 'paused' ? 'paused after refusing us' : s.reason);
      }
      const order = [...usable, ...overBudget];
      let lastError: unknown = lastRefusal;
      // Refusals are reported once the call is over, so each alert names what really answered.
      const refused: SourceUnavailableError[] = [];
      let answeredBy: WebSearchProviderName | null = null;
      try {
        for (const [i, e] of order.entries()) {
          try {
            const page = await ask(e, req, ctx);
            if (e !== configured[0]) ctx.log.info({ provider: e.name, q: req.q }, 'web search: answered by the fallback');
            answeredBy = e.name;
            return page;
          } catch (err) {
            if (ctx.signal.aborted) throw err;
            if (err instanceof SourceUnavailableError) {
              down.set(e.name, { until: now().getTime() + downMs, reason: err.reason });
              refused.push(err);
            } else if (err instanceof PermanentError || i === order.length - 1) {
              throw err;
            } else {
              ctx.log.warn({ provider: e.name, err: err instanceof Error ? err.message : String(err) }, 'web search: provider failed, asking the next');
            }
            lastError = err;
          }
        }
        throw lastError ?? new SourceUnavailableError(configured[0]!.name, 'every paid web search is out');
      } finally {
        for (const err of refused) {
          await opts.onUnavailable?.(err, answeredBy).catch((x: unknown) => ctx.log.warn({ err: x }, 'web search: could not pause the provider'));
        }
      }
    },
  };
}

/**
 * The paid web search the environment asks for: the Brave client alone by
 * default (unchanged), else the primary and fallback as one client.
 */
export function paidSearchFromEnv(
  env: PaidSearchEnv,
  opts: {
    fetch?: FetchLike;
    cache?: WebSearchCache;
    sql?: Sql;
    /** Paid requests per provider; defaults to web_search_usage when `sql` is given. */
    usage?: WebSearchUsage;
    alert?: Alerter;
    onUnavailable?: PaidSearchOptions['onUnavailable'];
    paused?: (name: WebSearchProviderName) => Promise<boolean>;
    downMs?: number;
  } = {},
): BraveClient {
  const brave = () =>
    braveClient({ apiKey: env.BRAVE_SEARCH_API_KEY, requestsPerSecond: env.BRAVE_REQUESTS_PER_SECOND, cache: opts.cache, fetch: opts.fetch });
  if (braveAlone(env)) return brave();
  const entries = paidSearchChain(env).map(
    (name): PaidSearchEntry => ({
      name,
      client:
        name === 'brave'
          ? brave()
          : braveClient({ apiKey: undefined, cache: opts.cache, provider: serperProvider({ apiKey: env.SERPER_API_KEY, fetch: opts.fetch }) }),
      costPer1000Usd: costPer1000(env, name),
      monthlyBudgetUsd: budgetOf(env, name),
    }),
  );
  return paidSearchClient({
    entries,
    usage: opts.usage ?? (opts.sql ? dbWebSearchUsage(opts.sql) : undefined),
    paused: opts.paused,
    onUnavailable: opts.onUnavailable,
    alert: opts.alert,
    downMs: opts.downMs,
  });
}
