/**
 * `cli search`: one search end to end against a local database, for manual testing.
 *
 *   pnpm --filter @nvoke/server cli search local "dentists" "Copenhagen" --limit 5
 *   pnpm --filter @nvoke/server cli search web "design studio" --country dk --limit 10
 *   pnpm --filter @nvoke/server cli search launches "email" --days 3 --limit 10
 *   pnpm --filter @nvoke/server cli search domains acme.com "Novo Nordisk" --country dk
 *
 * Options:
 *   --limit N            companies to find (default 10)
 *   --country CC         web and domains: ISO country code
 *   --days N             launches: time window (default 7)
 *   --csv PATH           also write the CSV export to PATH
 *   --no-smtp            verify with MX records only (port 25 is often blocked on home networks)
 *   --database-url URL   use this Postgres instead of the embedded one
 *   --verbose            worker logs at debug level
 */
import { writeFileSync } from 'node:fs';
import postgres, { type Sql } from 'postgres';
import { pino } from 'pino';
import { CreateSearchRequest, type Search } from '@nvoke/shared';
import { applyMigrations } from '../db/migrations.js';
import { loadEnv } from '../env.js';
import { toCsv } from '../leads/csv.js';
import { sleep } from '../leads/limits.js';
import { startOngoingLoop } from '../leads/ongoing.js';
import { ensureAccount } from '../leads/quota.js';
import { createSearch, exportRows, getSearch, listCompanies } from '../leads/repo.js';
import { createPipelineDeps } from '../worker/deps.js';
import { Runner } from '../worker/runner.js';
import { CLI_USER, startEmbedded, usage, type Args, type Command } from './shared.js';

function buildRequest(args: Args): { request: CreateSearchRequest; limit: number } {
  const [command, kind, ...rest] = args.positional;
  if (command !== 'search' || !kind) usage();
  const flag = (n: string) => {
    const v = args.flags.get(n);
    return typeof v === 'string' ? v : undefined;
  };
  const limit = Number(flag('limit') ?? 10);
  let raw: unknown;
  if (kind === 'local') raw = { kind, params: { niche: rest[0], location: rest[1] } };
  else if (kind === 'web') raw = { kind, params: { keyword: rest[0], country: flag('country') } };
  else if (kind === 'launches') raw = { kind, params: { keyword: rest[0], days: Number(flag('days') ?? 7) } };
  else if (kind === 'domains') raw = { kind, params: { items: rest, country: flag('country') } };
  else usage();
  const parsed = CreateSearchRequest.safeParse({ ...(raw as object), limit: kind === 'domains' ? undefined : limit });
  if (!parsed.success) {
    console.error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    usage();
  }
  return { request: parsed.data, limit: parsed.data.kind === 'domains' ? parsed.data.params.items.length : limit };
}

function progress(s: Search): string {
  return `${s.status.padEnd(8)} companies ${s.companiesCrawled}/${s.companiesFound}  emails ${s.emailsFound} (valid ${s.emailsValid})`;
}

async function printResults(sql: Sql, searchId: string): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const page = await listCompanies(sql, CLI_USER, searchId, { limit: 200, cursor });
    if (!page) return;
    for (const c of page.companies) {
      console.log(`\n${c.name}  ${c.website}  [${c.crawlStatus}]${c.location ? `  ${c.location}` : ''}${c.phone ? `  ${c.phone}` : ''}`);
      for (const e of c.emails) console.log(`    ${e.address.padEnd(40)} ${e.kind.padEnd(9)} ${e.verification ?? 'pending'}`);
    }
    if (!page.nextCursor) return;
    cursor = page.nextCursor;
  }
}

async function search(args: Args): Promise<void> {
  const { request, limit } = buildRequest(args);
  const env = loadEnv();
  if (args.flags.has('no-smtp')) env.SMTP_PROBE_ENABLED = false;

  const explicitUrl = args.flags.get('database-url');
  const url = typeof explicitUrl === 'string' ? explicitUrl : process.env.CLI_DATABASE_URL;
  const local = url ? null : await startEmbedded();
  const sql = postgres(url ?? local!.url, { max: 10, onnotice: () => {} });
  const log = pino({ level: args.flags.has('verbose') ? 'debug' : 'warn' });

  const deps = createPipelineDeps(sql, env, log);
  const runner = new Runner(deps, { concurrency: env.WORKER_CONCURRENCY, pollMs: 250 });
  let stopOngoing = () => {};
  let interrupted = false;
  const cleanup = async () => {
    stopOngoing();
    await runner.stop(5_000);
    await sql.end({ timeout: 5 });
    await local?.stop();
  };
  process.once('SIGINT', () => {
    interrupted = true;
    console.log('\ninterrupted, stopping');
  });

  try {
    const applied = await applyMigrations(sql);
    if (applied.length > 0) console.log(`applied migrations: ${applied.join(', ')}`);
    await ensureAccount(sql, CLI_USER);
    await sql`update accounts set plan = 'emails_60000' where clerk_user_id = ${CLI_USER}`;

    const created = await createSearch(sql, CLI_USER, request, limit);
    console.log(`search ${created.id}: ${request.kind} ${JSON.stringify(request.params)} limit ${limit}`);
    console.log(`smtp probe: ${env.SMTP_PROBE_ENABLED ? 'on' : 'off (MX only)'}`);
    runner.start();
    // A plain words search that comes up short is held for a fresh round, which this loop starts.
    stopOngoing = startOngoingLoop({
      sql,
      ai: deps.ai,
      log,
      runBraveBudget: env.ICP_BRAVE_BUDGET,
      dailyBraveBudget: env.ICP_DAILY_BRAVE_BUDGET,
      globalDailyBraveBudget: env.ONGOING_DAILY_BRAVE_BUDGET,
    });

    let last = '';
    let current: Search | null = created;
    while (!interrupted) {
      current = await getSearch(sql, CLI_USER, created.id);
      if (!current) break;
      const line = progress(current);
      if (line !== last) console.log(line);
      last = line;
      if (['done', 'failed', 'canceled'].includes(current.status)) break;
      await sleep(1_000);
    }
    if (current?.error) console.log(`error: ${current.error}`);

    await printResults(sql, created.id);
    const csvPath = args.flags.get('csv');
    if (typeof csvPath === 'string') {
      writeFileSync(csvPath, toCsv(await exportRows(sql, CLI_USER, created.id, {})));
      console.log(`\nwrote ${csvPath}`);
    }
  } finally {
    await cleanup();
  }
}

export const searchCommand: Command = {
  name: 'search',
  usage: [
    '  cli search local <niche> <location> [--limit N]',
    '  cli search web <keyword> [--country CC] [--limit N]',
    '  cli search launches [keyword] [--days N] [--limit N]',
    '  cli search domains <domain or name>... [--country CC]',
  ],
  run: search,
};
