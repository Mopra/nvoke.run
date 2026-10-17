/**
 * Runs one search end to end against a local database, for manual testing.
 *
 *   pnpm --filter @nvoke/server cli search local "dentists" "Copenhagen" --limit 5
 *   pnpm --filter @nvoke/server cli search web "design studio" --country dk --limit 10
 *   pnpm --filter @nvoke/server cli search launches "email" --days 3 --limit 10
 *   pnpm --filter @nvoke/server cli search domains acme.com "Novo Nordisk" --country dk
 *   pnpm --filter @nvoke/server cli db
 *   pnpm --filter @nvoke/server cli privacy export someone@example.dk
 *   pnpm --filter @nvoke/server cli privacy erase someone@example.dk
 *   pnpm --filter @nvoke/server cli privacy erase example.dk
 *   pnpm --filter @nvoke/server cli privacy suppress-domain example.dk
 *   pnpm --filter @nvoke/server cli stats --days 30
 *   pnpm --filter @nvoke/server cli sources resume brave
 *   pnpm --filter @nvoke/server cli alert test
 *   pnpm --filter @nvoke/server cli feed collect
 *
 * `db` starts the embedded Postgres, applies the migrations, prints its URL
 * and keeps running until Ctrl+C, so `dev:api` and `dev:worker` can use it as
 * DATABASE_URL for a fully local run.
 *
 * Options:
 *   --limit N            companies to find (default 10)
 *   --country CC         web and domains: ISO country code
 *   --days N             launches: time window (default 7)
 *   --csv PATH           also write the CSV export to PATH
 *   --no-smtp            verify with MX records only (port 25 is often blocked on home networks)
 *   --database-url URL   use this Postgres instead of the embedded one
 *   --verbose            worker logs at debug level
 *
 * Without --database-url (or CLI_DATABASE_URL) the CLI starts an embedded
 * Postgres with its data in apps/server/.pgdata. `search` and `db` never
 * touch DATABASE_URL, which points at the shared Supabase database.
 *
 * `privacy` is the exception. It is the operator's tool for data subject
 * requests (deploy/PRIVACY-RUNBOOK.md). It uses --database-url, then
 * DATABASE_URL only when --prod is given, then CLI_DATABASE_URL or the
 * embedded Postgres. --prod is required because apps/server/.env sets
 * DATABASE_URL on development machines too. It prints the database it uses
 * before doing anything.
 *
 *   privacy export <address>          JSON of everything held about the address
 *   privacy erase <address|domain>    suppress, then delete every stored copy
 *   privacy suppress-domain <domain>  suppress the domain and delete its addresses,
 *                                     keeping the company rows in existing searches
 *   --source S                        erase and suppress-domain: where the request
 *                                     came from (email, opt_out_page, bot_page, admin;
 *                                     default email)
 *
 * `stats` picks its database the same way. It prints, per search kind over
 * the last --days (default 30), paid source requests, pages served from the
 * cache and valid emails, so the cost of a valid email can be read off.
 * `sources resume <source>` ends a source pause early once its cause is
 * fixed. `alert test` emails a test alert through Day3 (needs DAY3_API_KEY,
 * ALERT_EMAIL_TO and ALERT_EMAIL_FROM). Both pick the database like stats.
 * `feed collect` runs every feed collector now, whatever its interval, and
 * prints what each found and how much of it was new; `feed` alone prints
 * the feed per source. Both pick the database like stats.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';
import { pino } from 'pino';
import { CreateSearchRequest, type Search } from '@nvoke/shared';
import { applyMigrations } from './db/migrations.js';
import { createAlerter } from './alerts.js';
import { collectDue } from './feed/collect.js';
import { createCollectors, sourceAvailability } from './feed/collectors.js';
import { feedSourceStatus } from './feed/drops.js';
import { loadEnv } from './env.js';
import { toCsv } from './leads/csv.js';
import { sleep } from './leads/limits.js';
import { ensureAccount } from './leads/quota.js';
import { createSearch, exportRows, getSearch, listCompanies } from './leads/repo.js';
import { resumeSource } from './leads/source-pause.js';
import { suppress, type SuppressionSource } from './leads/suppression.js';
import { erase } from './privacy/erase.js';
import { exportSubject } from './privacy/export.js';
import { parseDomain, parseTarget } from './privacy/target.js';
import { createPipelineDeps } from './worker/deps.js';
import { Runner } from './worker/runner.js';

const CLI_USER = 'cli-local-user';
const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && !['no-smtp', 'verbose', 'prod'].includes(name)) {
        flags.set(name, next);
        i++;
      } else flags.set(name, true);
    } else positional.push(a);
  }
  return { positional, flags };
}

function usage(): never {
  console.error(
    [
      'usage:',
      '  cli search local <niche> <location> [--limit N]',
      '  cli search web <keyword> [--country CC] [--limit N]',
      '  cli search launches [keyword] [--days N] [--limit N]',
      '  cli search domains <domain or name>... [--country CC]',
      '  cli db',
      '  cli privacy export <address> [--prod]',
      '  cli privacy erase <address|domain> [--source S] [--prod]',
      '  cli privacy suppress-domain <domain> [--source S] [--prod]',
      '  cli stats [--days N] [--prod]',
      '  cli sources resume <source> [--prod]',
      '  cli alert test [--prod]',
      '  cli feed [collect] [--prod]',
      'options: --csv PATH, --no-smtp, --database-url URL, --verbose',
      'privacy, stats, sources, alert and feed act on DATABASE_URL only with --prod (production on the VPS), or on --database-url.',
      'Without either they use CLI_DATABASE_URL or the embedded Postgres.',
    ].join('\n'),
  );
  process.exit(2);
}

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

interface LocalDb {
  url: string;
  stop(): Promise<void>;
}

async function startEmbedded(): Promise<LocalDb> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dir = join(SERVER_DIR, '.pgdata');
  const port = Number(process.env.CLI_PG_PORT ?? 54329);
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
    console.log(`initialising local Postgres in ${dir}`);
    await pg.initialise();
  }
  await pg.start();
  const admin = postgres(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`, { max: 1, onnotice: () => {} });
  const [db] = await admin`select pg_encoding_to_char(encoding) as encoding from pg_database where datname = 'nvoke_cli'`;
  if (db && db.encoding !== 'UTF8') {
    // An older dev database made with the Windows codepage cannot hold real text (feed collectors fail).
    console.log(`nvoke_cli was ${db.encoding}, recreating it as UTF8 (local dev data is dropped)`);
    await admin.unsafe('drop database nvoke_cli with (force)');
  }
  if (!db || db.encoding !== 'UTF8') {
    await admin.unsafe("create database nvoke_cli template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'");
  }
  await admin.end();
  return { url: `postgres://postgres:postgres@127.0.0.1:${port}/nvoke_cli`, stop: () => pg.stop() };
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

/** `cli db`: a local Postgres with every migration applied, until Ctrl+C. */
async function serveDb(): Promise<void> {
  const local = await startEmbedded();
  const sql = postgres(local.url, { max: 1, onnotice: () => {} });
  const applied = await applyMigrations(sql);
  await sql.end({ timeout: 5 });
  if (applied.length > 0) console.log(`applied migrations: ${applied.join(', ')}`);
  console.log(`local Postgres ready. Use it as DATABASE_URL:
  ${local.url}
Ctrl+C stops it.`);
  await new Promise<void>((resolveStop) => {
    process.once('SIGINT', resolveStop);
    process.once('SIGTERM', resolveStop);
  });
  await local.stop();
}

const SOURCES: SuppressionSource[] = ['email', 'opt_out_page', 'bot_page', 'admin'];

/** `cli privacy ...`: data subject requests, against DATABASE_URL with --prod. */
async function privacy(args: Args): Promise<void> {
  const [, action, subject] = args.positional;
  if (!action || !subject || !['export', 'erase', 'suppress-domain'].includes(action)) usage();
  const sourceFlag = args.flags.get('source');
  const source = (typeof sourceFlag === 'string' ? sourceFlag : 'email') as SuppressionSource;
  if (!SOURCES.includes(source)) {
    console.error(`--source must be one of ${SOURCES.join(', ')}`);
    process.exit(2);
  }

  const { sql, close } = await opsDatabase(args);
  try {
    if (action === 'export') {
      console.log(JSON.stringify(await exportSubject(sql, subject), null, 2));
    } else if (action === 'erase') {
      const parsed = parseTarget(subject);
      if (!parsed) throw new Error(`not an email address or domain: ${subject}`);
      console.log(JSON.stringify(await erase(sql, parsed, source), null, 2));
    } else {
      const domain = parseDomain(subject);
      if (!domain) throw new Error(`not a domain: ${subject}`);
      await suppress(sql, { domain }, source);
      console.log(JSON.stringify({ suppressed: { domain }, source }, null, 2));
    }
  } finally {
    await close();
  }
}

/** `cli stats`: paid source usage against valid emails, per search kind. */
async function stats(args: Args): Promise<void> {
  const daysFlag = args.flags.get('days');
  const days = Number(typeof daysFlag === 'string' ? daysFlag : 30);
  if (!Number.isInteger(days) || days < 1) usage();
  const { sql, close } = await opsDatabase(args);
  try {
    const rows = await sql<{ kind: string; searches: number; requests: number; cache_hits: number; valid: number }[]>`
      select kind, count(*)::int as searches, sum(source_requests)::int as requests,
             sum(source_cache_hits)::int as cache_hits, sum(emails_valid)::int as valid
      from searches
      where created_at > now() - make_interval(days => ${days})
      group by kind order by kind
    `;
    console.log(`last ${days} days`);
    for (const r of rows) {
      const perRequest = r.requests > 0 ? (r.valid / r.requests).toFixed(2) : 'n/a';
      console.log(
        `${r.kind.padEnd(9)} searches ${r.searches}  paid requests ${r.requests}  cache hits ${r.cache_hits}  valid emails ${r.valid}  valid per request ${perRequest}`,
      );
    }
  } finally {
    await close();
  }
}

/** `cli sources resume <source>`: ends a pause after the cause is fixed. */
async function sources(args: Args): Promise<void> {
  const [, action, source] = args.positional;
  if (action !== 'resume' || !source) usage();
  const { sql, close } = await opsDatabase(args);
  try {
    console.log((await resumeSource(sql, source)) ? `${source} resumed` : `${source} was not paused`);
  } finally {
    await close();
  }
}

/** `cli alert test`: sends a test alert email, bypassing the once per hour limit. */
async function alertTest(args: Args): Promise<void> {
  if (args.positional[1] !== 'test') usage();
  const env = loadEnv();
  const { sql, close } = await opsDatabase(args);
  try {
    const alerter = createAlerter({
      sql,
      log: pino({ level: 'error' }),
      apiKey: env.DAY3_API_KEY,
      to: env.ALERT_EMAIL_TO,
      from: env.ALERT_EMAIL_FROM,
    });
    const sent = await alerter.send({
      key: `test:${Date.now()}`,
      subject: 'Test alert',
      text: 'Alerts from the nvoke server reach this inbox.',
    });
    console.log(sent ? `sent to ${env.ALERT_EMAIL_TO.join(', ')}` : 'not sent: check DAY3_API_KEY, ALERT_EMAIL_TO and ALERT_EMAIL_FROM');
    if (!sent) process.exitCode = 1;
  } finally {
    await close();
  }
}

/** `cli feed [collect]`: the drops feed per source, optionally collecting first. */
async function feed(args: Args): Promise<void> {
  const action = args.positional[1];
  if (action !== undefined && action !== 'collect') usage();
  const env = loadEnv();
  const { sql, close } = await opsDatabase(args);
  try {
    const collectors = createCollectors({ productHuntToken: env.PRODUCT_HUNT_TOKEN });
    if (action === 'collect') {
      const log = pino({ level: args.flags.has('verbose') ? 'debug' : 'error' });
      for (const r of await collectDue(sql, collectors, log, { force: true })) {
        console.log(`${r.source.padEnd(13)} found ${String(r.found).padStart(4)}  new ${String(r.added).padStart(4)}${r.error ? `  error: ${r.error}` : ''}`);
      }
    }
    for (const s of await feedSourceStatus(sql, sourceAvailability(collectors))) {
      const last = s.lastCollectedAt ? s.lastCollectedAt.slice(0, 16).replace('T', ' ') : 'never';
      console.log(`${s.source.padEnd(13)} ${s.available ? 'on ' : 'off'}  last 7 days ${String(s.lastWeek).padStart(5)}  last collected ${last}`);
    }
  } finally {
    await close();
  }
}

/**
 * The database for operator commands: --database-url, then DATABASE_URL with
 * --prod, then CLI_DATABASE_URL or the embedded Postgres. Prints which.
 */
async function opsDatabase(args: Args): Promise<{ sql: Sql; close: () => Promise<void> }> {
  const explicitUrl = args.flags.get('database-url');
  const url =
    (typeof explicitUrl === 'string' ? explicitUrl : undefined) ??
    (args.flags.has('prod') ? process.env.DATABASE_URL : undefined) ??
    process.env.CLI_DATABASE_URL;
  const local = url ? null : await startEmbedded();
  const target = new URL(url ?? local!.url);
  console.error(`database: ${target.hostname}:${target.port || 5432}${target.pathname}`);
  const sql = postgres(url ?? local!.url, { max: 4, onnotice: () => {} });
  if (local) await applyMigrations(sql);
  return {
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
      await local?.stop();
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.positional[0] === 'db') return serveDb();
  if (args.positional[0] === 'privacy') return privacy(args);
  if (args.positional[0] === 'stats') return stats(args);
  if (args.positional[0] === 'sources') return sources(args);
  if (args.positional[0] === 'alert') return alertTest(args);
  if (args.positional[0] === 'feed') return feed(args);
  const { request, limit } = buildRequest(args);
  const env = loadEnv();
  if (args.flags.has('no-smtp')) env.SMTP_PROBE_ENABLED = false;

  const explicitUrl = args.flags.get('database-url');
  const url = typeof explicitUrl === 'string' ? explicitUrl : process.env.CLI_DATABASE_URL;
  const local = url ? null : await startEmbedded();
  const sql = postgres(url ?? local!.url, { max: 10, onnotice: () => {} });
  const log = pino({ level: args.flags.has('verbose') ? 'debug' : 'warn' });

  const runner = new Runner(createPipelineDeps(sql, env, log), { concurrency: env.WORKER_CONCURRENCY, pollMs: 250 });
  let interrupted = false;
  const cleanup = async () => {
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
    await sql`update accounts set plan = 'emails_100000' where clerk_user_id = ${CLI_USER}`;

    const created = await createSearch(sql, CLI_USER, request, limit);
    console.log(`search ${created.id}: ${request.kind} ${JSON.stringify(request.params)} limit ${limit}`);
    console.log(`smtp probe: ${env.SMTP_PROBE_ENABLED ? 'on' : 'off (MX only)'}`);
    runner.start();

    let last = '';
    let search: Search | null = created;
    while (!interrupted) {
      search = await getSearch(sql, CLI_USER, created.id);
      if (!search) break;
      const line = progress(search);
      if (line !== last) console.log(line);
      last = line;
      if (['done', 'failed', 'canceled'].includes(search.status)) break;
      await sleep(1_000);
    }
    if (search?.error) console.log(`error: ${search.error}`);

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

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
