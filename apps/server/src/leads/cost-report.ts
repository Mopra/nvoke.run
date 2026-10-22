// What a valid email costs us (docs/research/cost.md). Paid web search is
// counted per search kind from the searches' own counters and priced per
// provider from web_search_usage; Claude comes from ai_usage, which is kept
// per account and task, not per search, so it is summed over the find
// pipeline's tasks only. Companies and valid emails per kind come from the
// searches' companies, with the share the company index served (companies
// whose source is 'index', leads/company-index.ts) next to the paid tiers.
// Reads stored numbers, never calls a paid API.

import type { Sql } from 'postgres';

/** The Claude tasks of the find, crawl and verify pipeline. */
export const PIPELINE_AI_TASKS = ['plan', 'replan', 'fit', 'people'] as const;

/** Sending's writing tasks (write, write_first, write_retry, write_follow) count as one, outside the pipeline. */
const WRITE_GROUP = 'write';
const taskGroup = (task: string) => (task.startsWith(WRITE_GROUP) ? WRITE_GROUP : task);

/** companies.source of a company a paid web search result named. Lists, feeds, OSM and the index are free. */
const PAID_SOURCES = ['brave', 'serper'];

/** Dollars per 1,000 paid requests, per provider (BRAVE_COST_PER_1000_USD, SERPER_COST_PER_1000_USD). */
export type SearchPrices = { brave: number } & Record<string, number>;

export interface KindCost {
  kind: string;
  searches: number;
  /** Paid web search requests, whichever provider answered. */
  paidRequests: number;
  cacheHits: number;
  valid: number;
  /** Companies the kind's searches found, and those with at least one valid email. */
  companies: number;
  companiesValid: number;
  /** Companies the company index served, at no paid search. */
  fromIndex: number;
  /** Of those, the ones a Common Crawl load put in the index (index_imports). */
  fromCommonCrawl: number;
  /** Companies a paid web search result named. The rest came from free sources (lists, feeds, maps). */
  fromPaid: number;
  /** The kind's share of the paid search dollars, by its share of paid requests. */
  searchUsd: number;
}

export interface ProviderCost {
  provider: string;
  requests: number;
  usd: number;
}

export interface AiTaskCost {
  task: string;
  calls: number;
  usd: number;
  inPipeline: boolean;
  /** The tasks grouped under this one (the write tasks), when more than itself. */
  parts?: string[];
}

export interface CostReport {
  days: number;
  kinds: KindCost[];
  /** Paid web search per provider, Brave first. */
  providers: ProviderCost[];
  /** Brave requests priced from searches.source_requests, which web_search_usage did not count. */
  uncountedRequests: number;
  aiTasks: AiTaskCost[];
  searchUsd: number;
  pipelineAiUsd: number;
  valid: number;
  /** Paid search plus pipeline Claude per 1,000 valid emails, null without any. */
  usdPer1000Valid: number | null;
  /** Share of web search pages served from the shared cache, null without any. */
  cacheHitRate: number | null;
  companies: number;
  fromIndex: number;
  /** Of those, the ones a Common Crawl load put in the index. */
  fromCommonCrawl: number;
  /** Share of the companies found that the company index served, null without any. */
  indexShare: number | null;
}

const DAY_MS = 86_400_000;
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const nextMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
const monthKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Paid search per provider over the window. web_search_usage counts each
 * provider's paid requests per UTC month, so a month the window covers only
 * in part counts in proportion: the share of the month's time so far (up to
 * now for the current month) inside the window, as if its requests were
 * spread evenly. Brave alone never writes that table and
 * searches.source_requests counts every paid request, so a month's requests
 * beyond the table's total are Brave's, at Brave's price. A month without
 * rows (before the table existed, or Brave alone all month) is priced that
 * way from the searches inside the window, exactly.
 */
async function searchByProvider(sql: Sql, start: Date, now: Date, prices: SearchPrices) {
  const first = monthStart(start);
  const usageRows = await sql<{ provider: string; month: string; requests: number }[]>`
    select provider, to_char(month, 'YYYY-MM-DD') as month, requests
    from web_search_usage
    where month >= ${monthKey(first)}::date and month <= ${monthKey(monthStart(now))}::date
  `;
  const searchRows = await sql<{ month: string; whole: number; in_window: number }[]>`
    select to_char(date_trunc('month', created_at at time zone 'UTC'), 'YYYY-MM-DD') as month,
           coalesce(sum(source_requests), 0)::int as whole,
           coalesce(sum(source_requests) filter (where created_at > ${start}), 0)::int as in_window
    from searches
    where created_at >= ${first} and created_at <= ${now}
    group by 1
  `;

  const requests = new Map<string, number>([['brave', 0]]);
  const add = (provider: string, n: number) => requests.set(provider, (requests.get(provider) ?? 0) + n);
  let uncounted = 0;
  for (let m = first; m <= now; m = nextMonth(m)) {
    const key = monthKey(m);
    const rows = usageRows.filter((r) => r.month === key);
    const searched = searchRows.find((r) => r.month === key);
    if (rows.length === 0) {
      uncounted += searched?.in_window ?? 0;
      continue;
    }
    const end = Math.min(nextMonth(m).getTime(), now.getTime());
    const span = end - m.getTime();
    const share = span > 0 ? (end - Math.max(m.getTime(), start.getTime())) / span : 1;
    for (const r of rows) add(r.provider, r.requests * share);
    const counted = rows.reduce((sum, r) => sum + r.requests, 0);
    uncounted += Math.max(0, (searched?.whole ?? 0) - counted) * share;
  }
  add('brave', uncounted);

  const providers = [...requests].map(([provider, n]) => ({ provider, requests: n, usd: (n * (prices[provider] ?? prices.brave)) / 1000 }));
  return { providers, uncounted };
}

export async function costReport(sql: Sql, days: number, prices: SearchPrices, now: Date = new Date()): Promise<CostReport> {
  const start = new Date(now.getTime() - days * DAY_MS);
  const kindRows = await sql<{ kind: string; searches: number; requests: number; cache_hits: number; valid: number }[]>`
    select kind, count(*)::int as searches, coalesce(sum(source_requests), 0)::int as requests,
           coalesce(sum(source_cache_hits), 0)::int as cache_hits, coalesce(sum(emails_valid), 0)::int as valid
    from searches
    where created_at > ${start}
    group by kind order by kind
  `;
  const companyRows = await sql<{ kind: string; companies: number; companies_valid: number; from_index: number; from_cc: number; from_paid: number }[]>`
    select s.kind, count(*)::int as companies,
           count(*) filter (where exists (
             select 1 from emails e where e.company_id = c.id and e.verification = 'valid'
           ))::int as companies_valid,
           count(*) filter (where c.source = 'index')::int as from_index,
           count(*) filter (where c.source = 'index' and exists (
             select 1 from index_imports i where i.domain = c.domain and i.source = 'common_crawl' and i.loaded_at < c.created_at
           ))::int as from_cc,
           count(*) filter (where c.source = any(${PAID_SOURCES}::text[]))::int as from_paid
    from companies c join searches s on s.id = c.search_id
    where s.created_at > ${start}
    group by s.kind
  `;
  const aiRows = await sql<{ task: string; calls: number; usd: string }[]>`
    select task, count(*)::int as calls, sum(cost_usd) as usd
    from ai_usage
    where created_at > ${start}
    group by task order by task
  `;
  const { providers, uncounted } = await searchByProvider(sql, start, now, prices);

  const searchUsd = providers.reduce((sum, p) => sum + p.usd, 0);
  const requests = kindRows.reduce((sum, k) => sum + k.requests, 0);
  const kinds = kindRows.map((r) => {
    const c = companyRows.find((row) => row.kind === r.kind);
    return {
      kind: r.kind,
      searches: r.searches,
      paidRequests: r.requests,
      cacheHits: r.cache_hits,
      valid: r.valid,
      companies: c?.companies ?? 0,
      companiesValid: c?.companies_valid ?? 0,
      fromIndex: c?.from_index ?? 0,
      fromCommonCrawl: c?.from_cc ?? 0,
      fromPaid: c?.from_paid ?? 0,
      searchUsd: requests > 0 ? (searchUsd * r.requests) / requests : 0,
    };
  });
  const pipeline: readonly string[] = PIPELINE_AI_TASKS;
  const groups = new Map<string, AiTaskCost>();
  for (const r of aiRows) {
    const task = taskGroup(r.task);
    const g = groups.get(task) ?? { task, calls: 0, usd: 0, inPipeline: pipeline.includes(task), parts: [] };
    g.calls += r.calls;
    g.usd += Number(r.usd);
    g.parts!.push(r.task);
    groups.set(task, g);
  }
  const aiTasks = [...groups.values()]
    .sort((a, b) => a.task.localeCompare(b.task))
    .map(({ parts, ...t }) => (parts && (parts.length > 1 || parts[0] !== t.task) ? { ...t, parts } : t));

  const pipelineAiUsd = aiTasks.filter((t) => t.inPipeline).reduce((sum, t) => sum + t.usd, 0);
  const valid = kinds.reduce((sum, k) => sum + k.valid, 0);
  const hits = kinds.reduce((sum, k) => sum + k.cacheHits, 0);
  const companies = kinds.reduce((sum, k) => sum + k.companies, 0);
  const fromIndex = kinds.reduce((sum, k) => sum + k.fromIndex, 0);
  const fromCommonCrawl = kinds.reduce((sum, k) => sum + k.fromCommonCrawl, 0);

  return {
    days,
    kinds,
    providers,
    uncountedRequests: uncounted,
    aiTasks,
    searchUsd,
    pipelineAiUsd,
    valid,
    usdPer1000Valid: valid > 0 ? ((searchUsd + pipelineAiUsd) * 1000) / valid : null,
    cacheHitRate: requests + hits > 0 ? hits / (requests + hits) : null,
    companies,
    fromIndex,
    fromCommonCrawl,
    indexShare: companies > 0 ? fromIndex / companies : null,
  };
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`);

export function formatCostReport(r: CostReport): string {
  const lines = [`last ${r.days} days`, '', 'paid web search, per search kind'];
  for (const k of r.kinds) {
    const per1000 = k.valid > 0 ? usd((k.searchUsd * 1000) / k.valid) : 'n/a';
    const perRequest = k.paidRequests > 0 ? (k.valid / k.paidRequests).toFixed(2) : 'n/a';
    lines.push(
      `  ${k.kind.padEnd(9)} searches ${k.searches}  paid requests ${k.paidRequests}  cache hits ${k.cacheHits}  valid ${k.valid}  valid per request ${perRequest}  search ${usd(k.searchUsd)}  per 1,000 valid ${per1000}`,
    );
  }
  lines.push('', 'companies, per search kind');
  for (const k of r.kinds) {
    const share = k.companies > 0 ? k.fromIndex / k.companies : null;
    lines.push(
      `  ${k.kind.padEnd(9)} companies ${k.companies}  with a valid email ${k.companiesValid}  valid emails ${k.valid}  from the index ${k.fromIndex} (${pct(share)})  from paid search ${k.fromPaid}  from free sources ${k.companies - k.fromIndex - k.fromPaid}`,
    );
  }
  lines.push('', 'paid web search, per provider');
  for (const p of r.providers) {
    const uncounted = Math.round(r.uncountedRequests);
    const note = p.provider === 'brave' && uncounted > 0 ? `  (${uncounted} of them from the search counters, at Brave's price)` : '';
    lines.push(`  ${p.provider.padEnd(9)} requests ${Math.round(p.requests)}  ${usd(p.usd)}${note}`);
  }
  lines.push('', 'claude, per task');
  for (const t of r.aiTasks) {
    const per1000 = r.valid > 0 && t.inPipeline ? `  per 1,000 valid ${usd((t.usd * 1000) / r.valid)}` : '';
    const parts = t.parts ? ` ${t.parts.join(', ')}` : '';
    lines.push(`  ${t.task.padEnd(13)} calls ${t.calls}  ${usd(t.usd)}${per1000}${t.inPipeline ? '' : `  (not in the pipeline${parts ? `:${parts}` : ''})`}`);
  }
  lines.push(
    '',
    `web search ${usd(r.searchUsd)} + pipeline claude ${usd(r.pipelineAiUsd)} for ${r.valid} valid emails`,
    `cost per 1,000 valid ${r.usdPer1000Valid === null ? 'n/a' : usd(r.usdPer1000Valid)}`,
    `web search cache hit rate ${pct(r.cacheHitRate)}`,
    `companies from the company index ${r.fromIndex} of ${r.companies} (${pct(r.indexShare)}), ${r.fromCommonCrawl} of them loaded from Common Crawl`,
  );
  return lines.join('\n');
}
