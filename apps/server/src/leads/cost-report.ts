// What a valid email costs us (docs/research/cost.md). Brave is counted per
// search kind from the searches' own counters; Claude comes from ai_usage,
// which is kept per account and task, not per search, so it is summed over
// the find pipeline's tasks only. Reads stored numbers, never calls a paid API.

import type { Sql } from 'postgres';

/** The Claude tasks of the find, crawl and verify pipeline. */
export const PIPELINE_AI_TASKS = ['plan', 'replan', 'fit', 'people'] as const;

export interface KindCost {
  kind: string;
  searches: number;
  braveRequests: number;
  braveCacheHits: number;
  valid: number;
  braveUsd: number;
}

export interface AiTaskCost {
  task: string;
  calls: number;
  usd: number;
  inPipeline: boolean;
}

export interface CostReport {
  days: number;
  kinds: KindCost[];
  aiTasks: AiTaskCost[];
  braveUsd: number;
  pipelineAiUsd: number;
  valid: number;
  /** Brave plus pipeline Claude per 1,000 valid emails, null without any. */
  usdPer1000Valid: number | null;
  /** Share of Brave pages served from the shared cache, null without any. */
  braveCacheHitRate: number | null;
}

export async function costReport(sql: Sql, days: number, braveCostPer1000Usd: number): Promise<CostReport> {
  const kindRows = await sql<{ kind: string; searches: number; requests: number; cache_hits: number; valid: number }[]>`
    select kind, count(*)::int as searches, coalesce(sum(source_requests), 0)::int as requests,
           coalesce(sum(source_cache_hits), 0)::int as cache_hits, coalesce(sum(emails_valid), 0)::int as valid
    from searches
    where created_at > now() - make_interval(days => ${days})
    group by kind order by kind
  `;
  const aiRows = await sql<{ task: string; calls: number; usd: string }[]>`
    select task, count(*)::int as calls, sum(cost_usd) as usd
    from ai_usage
    where created_at > now() - make_interval(days => ${days})
    group by task order by task
  `;

  const kinds = kindRows.map((r) => ({
    kind: r.kind,
    searches: r.searches,
    braveRequests: r.requests,
    braveCacheHits: r.cache_hits,
    valid: r.valid,
    braveUsd: (r.requests * braveCostPer1000Usd) / 1000,
  }));
  const pipeline: readonly string[] = PIPELINE_AI_TASKS;
  const aiTasks = aiRows.map((r) => ({ task: r.task, calls: r.calls, usd: Number(r.usd), inPipeline: pipeline.includes(r.task) }));

  const braveUsd = kinds.reduce((sum, k) => sum + k.braveUsd, 0);
  const pipelineAiUsd = aiTasks.filter((t) => t.inPipeline).reduce((sum, t) => sum + t.usd, 0);
  const valid = kinds.reduce((sum, k) => sum + k.valid, 0);
  const requests = kinds.reduce((sum, k) => sum + k.braveRequests, 0);
  const hits = kinds.reduce((sum, k) => sum + k.braveCacheHits, 0);

  return {
    days,
    kinds,
    aiTasks,
    braveUsd,
    pipelineAiUsd,
    valid,
    usdPer1000Valid: valid > 0 ? ((braveUsd + pipelineAiUsd) * 1000) / valid : null,
    braveCacheHitRate: requests + hits > 0 ? hits / (requests + hits) : null,
  };
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`);

export function formatCostReport(r: CostReport): string {
  const lines = [`last ${r.days} days`, '', 'brave, per search kind'];
  for (const k of r.kinds) {
    const per1000 = k.valid > 0 ? usd((k.braveUsd * 1000) / k.valid) : 'n/a';
    const perRequest = k.braveRequests > 0 ? (k.valid / k.braveRequests).toFixed(2) : 'n/a';
    lines.push(
      `  ${k.kind.padEnd(9)} searches ${k.searches}  paid requests ${k.braveRequests}  cache hits ${k.braveCacheHits}  valid ${k.valid}  valid per request ${perRequest}  brave ${usd(k.braveUsd)}  per 1,000 valid ${per1000}`,
    );
  }
  lines.push('', 'claude, per task');
  for (const t of r.aiTasks) {
    lines.push(`  ${t.task.padEnd(13)} calls ${t.calls}  ${usd(t.usd)}${t.inPipeline ? '' : '  (not in the pipeline)'}`);
  }
  lines.push(
    '',
    `brave ${usd(r.braveUsd)} + pipeline claude ${usd(r.pipelineAiUsd)} for ${r.valid} valid emails`,
    `cost per 1,000 valid ${r.usdPer1000Valid === null ? 'n/a' : usd(r.usdPer1000Valid)}`,
    `brave cache hit rate ${pct(r.braveCacheHitRate)}`,
  );
  return lines.join('\n');
}
