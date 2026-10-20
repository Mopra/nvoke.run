// The lead-quality eval: runs the fixed suite (eval-suite.ts) through the
// real pipeline and measures what a user gets out of it.
//
//   pnpm eval --label baseline
//   pnpm --filter @nvoke/server cli eval run --label smoke --only dentists-aarhus --minutes 4 --no-judge
//   pnpm --filter @nvoke/server cli eval report apps/server/.bench/eval/<file>.json
//
// Every run gets a fresh database on the Postgres it is handed, so the shared
// domain crawl cache, the verify cache and dedupe from earlier runs do not
// leak into it. Brave pages are the exception, to save money: the cache is
// seeded from .bench/eval/brave-cache.json before the run and saved back
// after, and the report prices Brave as if nothing were cached. Each entry
// runs as its own user so its Claude cost is its own. All searches run at
// once in one in-process worker with real SMTP, snapshots are taken at 15,
// 30 and 60 minutes and at the end, then the judges (eval-judge.ts) grade a
// seeded sample.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postgres, { type Sql } from 'postgres';
import { pino } from 'pino';
import { createAiFromEnv } from '../ai/client.js';
import { applyMigrations } from '../db/migrations.js';
import type { Env } from '../env.js';
import { sleep } from '../leads/limits.js';
import { ensureAccount } from '../leads/quota.js';
import { createSearch } from '../leads/repo.js';
import { startOngoingLoop } from '../leads/ongoing.js';
import { createPipelineDeps } from '../worker/deps.js';
import { Runner } from '../worker/runner.js';
import { judgeEntry, JUDGE_USER, personColumns, type PersonColumns } from './eval-judge.js';
import {
  entryMetrics,
  renderReport,
  seededRng,
  seedOf,
  snapshotMarks,
  totalMetrics,
  type CompanyRow,
  type EmailRow,
  type EntryJudgement,
  type EvalRun,
  type SearchUsage,
  type Snapshot,
} from './eval-metrics.js';
import { entryRequests, type EvalEntry } from './eval-suite.js';

export interface EvalOptions {
  label: string;
  entries: EvalEntry[];
  minutes: number;
  smtpPerMinute: number;
  judge: boolean;
  keepDb: boolean;
  verbose: boolean;
  /** Any database URL on the Postgres server to use; the eval makes its own database next to it. */
  serverUrl: string;
  /** apps/server/.bench/eval */
  outDir: string;
  env: Env;
}

const userOf = (entryId: string) => `eval-${entryId}`;

interface BraveCacheRow {
  query: string;
  country: string;
  page: number;
  companies: unknown;
  more: boolean;
  fetchedAt: string;
}

/**
 * Seeds web_search_cache from the file. Rows are stamped now, so the 7 day
 * freshness rule never turns a saved page into a paid one; the file keeps
 * when each page was really fetched.
 */
async function seedBrave(sql: Sql, file: string): Promise<Map<string, BraveCacheRow>> {
  const rows = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as BraveCacheRow[]) : [];
  const key = (r: Pick<BraveCacheRow, 'query' | 'country' | 'page'>) => `${r.query}\u0000${r.country}\u0000${r.page}`;
  for (const r of rows) {
    await sql`
      insert into web_search_cache (query, country, page, companies, more, fetched_at)
      values (${r.query}, ${r.country}, ${r.page}, ${sql.json(r.companies as never)}, ${r.more}, now())
      on conflict do nothing
    `;
  }
  return new Map(rows.map((r) => [key(r), r]));
}

async function dumpBrave(sql: Sql, file: string, seeded: Map<string, BraveCacheRow>, seededAt: Date): Promise<number> {
  const rows = await sql<{ query: string; country: string; page: number; companies: unknown; more: boolean; fetched_at: Date }[]>`
    select query, country, page, companies, more, fetched_at from web_search_cache order by query, country, page
  `;
  const out = new Map(seeded);
  for (const r of rows) {
    const k = `${r.query}\u0000${r.country}\u0000${r.page}`;
    // A seeded row still stamped at seeding time was never fetched again: keep its real date.
    if (seeded.has(k) && r.fetched_at.getTime() <= seededAt.getTime() + 60_000) continue;
    out.set(k, { query: r.query, country: r.country, page: r.page, companies: r.companies, more: r.more, fetchedAt: r.fetched_at.toISOString() });
  }
  writeFileSync(file, JSON.stringify([...out.values()]));
  return out.size;
}

interface EntrySearches {
  entry: EvalEntry;
  searchIds: string[];
}

async function takeSnapshot(
  sql: Sql,
  plan: EntrySearches[],
  columns: PersonColumns,
  opts: EvalOptions,
  startedAt: Date,
  mark: { atMinutes: number; final: boolean },
): Promise<Snapshot> {
  const at = new Date();
  const allIds = plan.flatMap((p) => p.searchIds);
  const companies = await sql<CompanyRow[]>`
    select id, search_id as "searchId", crawl_status as "crawlStatus" from companies where search_id in ${sql(allIds)}
  `;
  const emails = await sql<EmailRow[]>`
    select e.company_id as "companyId", e.search_id as "searchId", e.kind, e.verification,
      ${sql.unsafe(columns.name)} as name, ${sql.unsafe(columns.title)} as title, ${sql.unsafe(columns.seniority)} as seniority,
      ${sql.unsafe(columns.foundVia)} as "foundVia",
      (to_jsonb(e) ->> 'skipped') is not null as skipped
    from emails e where e.search_id in ${sql(allIds)}
  `;
  const searches = await sql<(SearchUsage & { finishedAt: Date | null })[]>`
    select id as "searchId", kind, source_requests as "sourceRequests", source_cache_hits as "sourceCacheHits",
      status, finished_at as "finishedAt"
    from searches where id in ${sql(allIds)}
  `;
  const ai = await sql<{ user: string; cost: string }[]>`
    select clerk_user_id as user, sum(cost_usd)::text as cost from ai_usage
    where clerk_user_id in ${sql(plan.map((p) => userOf(p.entry.id)))} group by clerk_user_id
  `;
  const aiCost = new Map(ai.map((r) => [r.user, Number(r.cost)]));
  const usage: SearchUsage[] = searches.map((s) => ({ ...s, finishedAt: s.finishedAt ? new Date(s.finishedAt).toISOString() : null }));
  const entries = plan.map((p) =>
    entryMetrics({
      entryId: p.entry.id,
      companies,
      emails,
      searches: usage.filter((s) => p.searchIds.includes(s.searchId)),
      aiCostUsd: aiCost.get(userOf(p.entry.id)) ?? 0,
      braveCostPer1000Usd: opts.env.BRAVE_COST_PER_1000_USD,
      startedAt,
      at,
    }),
  );
  return { ...mark, entries, totals: totalMetrics(entries) };
}

function progressLine(s: Snapshot): string {
  const t = s.totals;
  return `${s.atMinutes.toFixed(1).padStart(5)} min  searches ${t.searchesEnded}/${t.searches}  companies ${t.companiesCrawled}/${t.companies}  emails ${t.emails} (valid ${t.valid}, pending ${t.pending})`;
}

/** Runs the eval, writes the JSON and returns it with its path. */
export async function runEval(opts: EvalOptions): Promise<{ run: EvalRun; file: string }> {
  const plan = opts.entries.map((entry) => ({ entry, requests: entryRequests(entry) }));
  mkdirSync(opts.outDir, { recursive: true });
  const braveFile = join(opts.outDir, 'brave-cache.json');

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '_').toLowerCase();
  const dbName = `nvoke_eval_${stamp}`;
  const server = new URL(opts.serverUrl);
  server.pathname = '/postgres';
  const admin = postgres(server.toString(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
  await admin.end();
  const dbUrl = new URL(server.toString());
  dbUrl.pathname = `/${dbName}`;
  console.error(`database: ${dbUrl.hostname}:${dbUrl.port}/${dbName}`);

  const sql = postgres(dbUrl.toString(), { max: 16, onnotice: () => {} });
  const log = pino({ level: opts.verbose ? 'debug' : 'warn' });
  // No operator alerts or Brave budget emails from an eval; SMTP pacing from the flag, with no share for the free tools.
  const env: Env = {
    ...opts.env,
    DAY3_API_KEY: undefined,
    BRAVE_MONTHLY_BUDGET_USD: undefined,
    SMTP_PROBES_PER_MINUTE: opts.smtpPerMinute,
    TOOLS_SMTP_PROBES_PER_MINUTE: 0,
  };
  const deps = createPipelineDeps(sql, env, log);
  const runner = new Runner(deps, { concurrency: env.WORKER_CONCURRENCY, pollMs: 250 });
  // The worker's never short and ongoing tick, so held searches get their next round as in production.
  let stopOngoing: (() => void) | null = null;

  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
    console.error('\ninterrupted, taking the last snapshot');
  };
  process.once('SIGINT', onSigint);

  let seeded = new Map<string, BraveCacheRow>();
  let seededAt = new Date();
  let dumped = 0;
  let braveSaved = false;
  const saveBrave = async () => {
    if (braveSaved) return;
    braveSaved = true;
    dumped = await dumpBrave(sql, braveFile, seeded, seededAt);
  };

  try {
    await applyMigrations(sql);
    const columns = await personColumns(sql);
    seededAt = new Date();
    seeded = await seedBrave(sql, braveFile);
    console.error(`brave cache: ${seeded.size} pages seeded`);

    for (const user of [...plan.map((p) => userOf(p.entry.id)), JUDGE_USER]) {
      await ensureAccount(sql, user);
      await sql`update accounts set plan = 'emails_60000' where clerk_user_id = ${user}`;
    }

    const startedAt = new Date();
    const entrySearches: EntrySearches[] = [];
    const searchRecords: EvalRun['entries'] = [];
    for (const { entry, requests } of plan) {
      const ids: string[] = [];
      for (const request of requests) {
        const limit = request.limit ?? 100;
        const created = await createSearch(sql, userOf(entry.id), request, limit);
        ids.push(created.id);
        console.error(`${entry.id}: ${request.kind} ${JSON.stringify(request.params)} limit ${limit}`);
      }
      entrySearches.push({ entry, searchIds: ids });
    }
    console.error(`smtp: ${env.SMTP_PROBE_ENABLED ? `on, ${opts.smtpPerMinute}/min` : 'off (MX only)'}`);
    runner.start();
    stopOngoing = startOngoingLoop({
      sql,
      ai: deps.ai,
      log,
      runBraveBudget: env.ICP_BRAVE_BUDGET,
      dailyBraveBudget: env.ICP_DAILY_BRAVE_BUDGET,
      globalDailyBraveBudget: env.ONGOING_DAILY_BRAVE_BUDGET,
    });

    const deadline = startedAt.getTime() + opts.minutes * 60_000;
    const marks = snapshotMarks(opts.minutes);
    const snapshots: Snapshot[] = [];
    let lastPrint = 0;
    for (;;) {
      const now = Date.now();
      const elapsed = (now - startedAt.getTime()) / 60_000;
      const due = marks.find((m) => m <= elapsed && !snapshots.some((s) => !s.final && s.atMinutes === m));
      if (due !== undefined) {
        const snap = await takeSnapshot(sql, entrySearches, columns, opts, startedAt, { atMinutes: due, final: false });
        snapshots.push(snap);
        console.error(`snapshot ${progressLine(snap)}`);
      }
      const [open] = await sql<{ n: number }[]>`
        select count(*)::int as n from searches where id in ${sql(entrySearches.flatMap((e) => e.searchIds))}
          and status in ('queued', 'running')
      `;
      const allEnded = (open?.n ?? 0) === 0;
      if (allEnded || interrupted || now >= deadline) break;
      if (now - lastPrint >= 30_000) {
        lastPrint = now;
        const snap = await takeSnapshot(sql, entrySearches, columns, opts, startedAt, { atMinutes: elapsed, final: false });
        console.error(progressLine(snap));
      }
      await sleep(2_000);
    }
    const endMinutes = (Date.now() - startedAt.getTime()) / 60_000;
    snapshots.push(await takeSnapshot(sql, entrySearches, columns, opts, startedAt, { atMinutes: endMinutes, final: true }));
    console.error(`end      ${progressLine(snapshots.at(-1)!)}`);
    stopOngoing?.();
    await runner.stop(5_000);
    await saveBrave();

    for (const { entry, searchIds } of entrySearches) {
      // Stage and runs through jsonb, so a run against an older schema still works.
      const rows = await sql<
        {
          id: string;
          kind: string;
          params: unknown;
          limit: number;
          status: string;
          error: string | null;
          stage: string | null;
          stageNote: string | null;
          runs: number;
        }[]
      >`
        select id, kind, params, "limit", status, error,
          to_jsonb(s) ->> 'stage' as stage, to_jsonb(s) ->> 'stage_note' as "stageNote",
          jsonb_array_length(coalesce(to_jsonb(s) -> 'runs', '[]'::jsonb))::int as runs
        from searches s where id in ${sql(searchIds)} order by created_at
      `;
      searchRecords.push({ id: entry.id, intent: entry.intent, searches: rows });
    }

    let judges: EvalRun['judges'] = null;
    if (opts.judge && !interrupted) {
      console.error('judging');
      const ai = createAiFromEnv(sql, log);
      const rng = seededRng(seedOf(opts.label));
      const verdicts: EntryJudgement[] = [];
      // One entry at a time, so the samples come out the same for the same label and rows.
      for (const { entry, searchIds } of entrySearches) {
        verdicts.push(await judgeEntry(ai, sql, { id: entry.id, intent: entry.intent, searchIds }, columns, rng));
        console.error(`  ${entry.id} judged`);
      }
      const [cost] = await sql<{ cost: string | null }[]>`select sum(cost_usd)::text as cost from ai_usage where clerk_user_id = ${JUDGE_USER}`;
      judges = { entries: verdicts, costUsd: Number(cost?.cost ?? 0) };
    }

    const run: EvalRun = {
      label: opts.label,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      minutes: opts.minutes,
      smtpPerMinute: env.SMTP_PROBE_ENABLED ? opts.smtpPerMinute : 0,
      braveCostPer1000Usd: env.BRAVE_COST_PER_1000_USD,
      database: dbName,
      personColumns: columns.present,
      entries: searchRecords,
      snapshots,
      brave: { seeded: seeded.size, dumped },
      judges,
    };
    const file = join(opts.outDir, `${opts.label}-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, `${JSON.stringify(run, null, 1)}\n`);
    return { run, file };
  } finally {
    process.off('SIGINT', onSigint);
    stopOngoing?.();
    await runner.stop(5_000);
    await saveBrave().catch((err: unknown) => console.error('could not save the Brave cache:', err));
    await sql.end({ timeout: 5 });
    if (!opts.keepDb) {
      const drop = postgres(server.toString(), { max: 1, onnotice: () => {} });
      await drop.unsafe(`drop database if exists ${dbName} with (force)`).catch((err: unknown) => console.error(`could not drop ${dbName}:`, err));
      await drop.end();
    }
  }
}

/**
 * The eval's own embedded Postgres in `dir` on EVAL_PG_PORT (default 54339),
 * apart from the CLI's, so a `cli db` running meanwhile never collides with
 * it. When another eval already runs it, that one is used and left running.
 */
export async function startEvalPostgres(dir: string): Promise<{ url: string; stop(): Promise<void> }> {
  const port = Number(process.env.EVAL_PG_PORT ?? 54339);
  const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  const probe = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 3 });
  const running = await probe`select 1`.then(
    () => true,
    () => false,
  );
  await probe.end();
  if (running) {
    console.error(`eval Postgres already running on port ${port}, using it`);
    return { url, stop: async () => {} };
  }
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(join(dir, 'PG_VERSION'))) {
    console.error(`initialising the eval Postgres in ${dir}`);
    mkdirSync(dirname(dir), { recursive: true });
    await pg.initialise();
  }
  await pg.start();
  return { url, stop: () => pg.stop() };
}

/** The markdown report of a saved run. */
export function reportFile(file: string): string {
  return renderReport(JSON.parse(readFileSync(file, 'utf8')) as EvalRun);
}
