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
 *   pnpm --filter @nvoke/server cli bench sample
 *   pnpm --filter @nvoke/server cli bench crawl --label baseline
 *   pnpm --filter @nvoke/server cli eval run --label baseline
 *   pnpm --filter @nvoke/server cli eval report apps/server/.bench/eval/<file>.json
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
 * `stats` picks its database the same way. It prints, over the last --days
 * (default 30), Brave requests, cache hits, valid emails and Brave dollars per
 * search kind, Claude dollars per task, and the cost per 1,000 valid emails.
 * It only reads the database.
 * `sources resume <source>` ends a source pause early once its cause is
 * fixed. `alert test` emails a test alert through Day3 (needs DAY3_API_KEY,
 * ALERT_EMAIL_TO and ALERT_EMAIL_FROM). Both pick the database like stats.
 * `feed collect` runs every feed collector now, whatever its interval, and
 * prints what each found and how much of it was new; `feed` alone prints
 * the feed per source. Both pick the database like stats.
 *
 * `bench` needs no database. `bench fill` counts, per local sample query,
 * the OSM places with a website and those with only an email. `bench sample` rebuilds the crawl benchmark's
 * fixed sample (apps/server/bench/crawl-sample.json); `bench crawl` crawls
 * it and prints a markdown table for docs/research/crawl-benchmark.md, with
 * the sites that gained or lost every email against --compare LABEL.
 * `bench place-sample` rebuilds the places sample (OSM places without a
 * website, apps/server/bench/place-sample.json); `bench places` looks each
 * one up on Brave (needs BRAVE_SEARCH_API_KEY, pages cached on disk), picks
 * its own site and crawls it.
 *   --label L           name of the run, saved in apps/server/.bench/results
 *   --concurrency N     sites at once (default 24)
 *   --only SOURCE       local, web or launches
 *   --no-cache          fetch everything live (responses are cached by default)
 * `bench render --from L` lays the desktop's render pass over run L
 * (`pnpm --filter @nvoke/desktop bench:render --from L` writes it first).
 *
 * `eval run` is the lead-quality eval (src/bench/eval-run.ts, `pnpm eval`):
 * the fixed suite through the real pipeline in a fresh database on the
 * eval's own embedded Postgres (apps/server/.bench/eval/pgdata, port
 * EVAL_PG_PORT or 54339) or on CLI_DATABASE_URL or --database-url, then Claude
 * judges a sample. It writes apps/server/.bench/eval/<label>-<time>.json and
 * prints a markdown report; `eval report <file>` prints it again.
 *   --label L              name of the run (default: the time)
 *   --only ID,ID           entries of the suite to run (default all)
 *   --minutes N            time budget (default 60)
 *   --smtp-per-minute N    SMTP probes a minute (default SMTP_PROBES_PER_MINUTE)
 *   --no-judge             skip the judges
 *   --keep-db              keep the eval database afterwards
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';
import { pino } from 'pino';
import { CreateSearchRequest, handsToLocalCrawl, type Search } from '@nvoke/shared';
import { applyMigrations } from './db/migrations.js';
import {
  diffRuns,
  markdownTable,
  mergeRender,
  mxChecker,
  renderTable,
  runCrawlBench,
  cachingFetch,
  type RenderResult,
  type SampleSite,
  type SiteResult,
} from './bench/crawl-bench.js';
import { buildPlaceSample, buildSample, localFillRate, type PlaceSample } from './bench/crawl-sample.js';
import { placeTable, runPlaceBench } from './bench/place-bench.js';
import { renderReport } from './bench/eval-metrics.js';
import { reportFile, runEval, startEvalPostgres } from './bench/eval-run.js';
import { asIcp, pickEntries } from './bench/eval-suite.js';
import { createAlerter } from './alerts.js';
import { collectDue } from './feed/collect.js';
import { createCollectors, sourceAvailability } from './feed/collectors.js';
import { feedSourceStatus } from './feed/drops.js';
import { loadEnv } from './env.js';
import { webSearchCostPer1000 } from './leads/sources/paid-search.js';
import { costReport, formatCostReport } from './leads/cost-report.js';
import { toCsv } from './leads/csv.js';
import { sleep } from './leads/limits.js';
import { startOngoingLoop } from './leads/ongoing.js';
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
      if (next !== undefined && !next.startsWith('--') && !['no-smtp', 'verbose', 'prod', 'no-cache', 'no-judge', 'keep-db'].includes(name)) {
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
      '  cli bench sample | fill | place-sample',
      '  cli bench places [--label L]',
      '  cli bench crawl [--label L] [--compare L] [--concurrency N] [--only SOURCE] [--no-cache]',
      '  cli bench render --from L',
      '  cli eval run [--label L] [--only ID,ID] [--mode icp] [--minutes N] [--smtp-per-minute N] [--no-judge] [--keep-db]',
      '  cli eval report <file.json>',
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

/** `cli stats`: what a valid email cost, per search kind and Claude task (src/leads/cost-report.ts). */
async function stats(args: Args): Promise<void> {
  const daysFlag = args.flags.get('days');
  const days = Number(typeof daysFlag === 'string' ? daysFlag : 30);
  if (!Number.isInteger(days) || days < 1) usage();
  const env = loadEnv();
  const { sql, close } = await opsDatabase(args);
  try {
    console.log(formatCostReport(await costReport(sql, days, webSearchCostPer1000(env))));
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

const BENCH_DIR = join(SERVER_DIR, '.bench');
const SAMPLE_PATH = join(SERVER_DIR, 'bench', 'crawl-sample.json');
const PLACE_SAMPLE_PATH = join(SERVER_DIR, 'bench', 'place-sample.json');

/** `cli bench sample | crawl`: the crawl benchmark (docs/research/crawl-benchmark.md). */
async function bench(args: Args): Promise<void> {
  const action = args.positional[1];
  const flag = (n: string) => {
    const v = args.flags.get(n);
    return typeof v === 'string' ? v : undefined;
  };
  if (action === 'sample') {
    const sample = await buildSample(loadEnv(), join(BENCH_DIR, 'sample-queries'));
    writeFileSync(SAMPLE_PATH, `${JSON.stringify(sample, null, 1)}\n`);
    console.log(`wrote ${sample.length} sites to ${SAMPLE_PATH}`);
    return;
  }
  if (action === 'fill') {
    const rows = await localFillRate(loadEnv());
    console.log('| query | places | website | own email only | webmail only |');
    console.log('|---|--:|--:|--:|--:|');
    for (const r of rows) console.log(`| ${r.query} | ${r.places} | ${r.website} | ${r.ownEmailOnly} | ${r.webmailOnly} |`);
    const sum = (k: 'places' | 'website' | 'ownEmailOnly' | 'webmailOnly') => rows.reduce((n, r) => n + r[k], 0);
    console.log(`| all | ${sum('places')} | ${sum('website')} | ${sum('ownEmailOnly')} | ${sum('webmailOnly')} |`);
    return;
  }
  if (action === 'render') return benchRender(flag('from'));
  if (action === 'place-sample') {
    const sample = await buildPlaceSample(loadEnv(), join(BENCH_DIR, 'place-queries'));
    writeFileSync(PLACE_SAMPLE_PATH, `${JSON.stringify(sample, null, 1)}
`);
    console.log(`wrote ${sample.length} places to ${PLACE_SAMPLE_PATH}`);
    return;
  }
  if (action === 'places') {
    const sample = JSON.parse(readFileSync(PLACE_SAMPLE_PATH, 'utf8')) as PlaceSample[];
    const label = flag('label') ?? 'places';
    const cache = cachingFetch(join(BENCH_DIR, 'http'));
    const run = await runPlaceBench(sample, { apiKey: process.env.BRAVE_SEARCH_API_KEY, braveDir: join(BENCH_DIR, 'brave'), fetch: cache.fetch });
    mkdirSync(join(BENCH_DIR, 'results'), { recursive: true });
    writeFileSync(join(BENCH_DIR, 'results', `${label}.json`), JSON.stringify(run.places, null, 1));
    console.log(`
${placeTable(label, run.places)}
`);
    console.log(`${run.requests} Brave requests, ${run.cacheHits} from the cache`);
    return;
  }
  if (action !== 'crawl') usage();
  let sample = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8')) as SampleSite[];
  const only = flag('only');
  if (only) sample = sample.filter((s) => s.source === only);
  const label = flag('label') ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const cache = args.flags.has('no-cache') ? null : cachingFetch(join(BENCH_DIR, 'http'));
  const started = Date.now();
  const results = await runCrawlBench(sample, {
    fetch: cache?.fetch,
    concurrency: Number(flag('concurrency') ?? 24),
    onResult: (r, done) => {
      console.error(`${String(done).padStart(4)}/${sample.length} ${r.status.padEnd(8)} ${String(r.emails.length).padStart(2)} ${r.domain}${r.error ? `  ${r.error}` : ''}`);
    },
  });
  mkdirSync(join(BENCH_DIR, 'results'), { recursive: true });
  writeFileSync(join(BENCH_DIR, 'results', `${label}.json`), JSON.stringify(results, null, 1));
  console.log(`\n${markdownTable(label, results)}\n`);
  console.log(`${((Date.now() - started) / 1000).toFixed(0)} s${cache ? `, ${cache.stats.hits} cached responses, ${cache.stats.live} live` : ''}`);
  const compare = flag('compare');
  if (compare) {
    const before = JSON.parse(readFileSync(join(BENCH_DIR, 'results', `${compare}.json`), 'utf8')) as SiteResult[];
    const { gained, lost } = diffRuns(before, results);
    console.log(`\nagainst ${compare}: ${gained.length} gained, ${lost.length} lost`);
    for (const r of gained) console.log(`  + ${r.domain}  ${r.emails.join(', ')}  (${r.via.join(', ')})`);
    for (const r of lost) console.log(`  - ${r.domain}  ${r.status}${r.error ? ` ${r.error}` : ''}`);
  }
}

/**
 * `cli bench render --from L`: run L of the server crawl with the desktop
 * pass (`pnpm --filter @nvoke/desktop bench:render --from L`) laid over it.
 * Prints what the desktop read per server outcome, then the combined table
 * for what the local crawl is handed today and for every miss.
 */
async function benchRender(label: string | undefined): Promise<void> {
  if (!label) usage();
  const results = join(BENCH_DIR, 'results');
  const server = JSON.parse(readFileSync(join(results, `${label}.json`), 'utf8')) as SiteResult[];
  const render = JSON.parse(readFileSync(join(results, `${label}.render.json`), 'utf8')) as RenderResult[];
  const handed = (r: SiteResult) => handsToLocalCrawl(r.status, r.emails.length);
  const hasMx = mxChecker();
  console.log(`${renderTable(server, render, handed)}
`);
  console.log(`${markdownTable(label, server)}
`);
  const merged = await mergeRender(server, render, handed, hasMx);
  console.log(`${markdownTable(`${label} + desktop`, merged)}
`);
  console.log(`${markdownTable(`${label} + desktop, every miss`, await mergeRender(server, render, () => true, hasMx))}
`);
  const { gained } = diffRuns(server, merged);
  console.log(`the desktop gained ${gained.length}:`);
  for (const r of gained) console.log(`  + ${r.domain}  ${r.status}  ${r.emails.join(', ')}`);
}

/** `cli eval run | report`: the lead-quality eval (src/bench/eval-run.ts). */
async function evalCommand(args: Args): Promise<void> {
  const action = args.positional[1];
  const flag = (n: string) => {
    const v = args.flags.get(n);
    return typeof v === 'string' ? v : undefined;
  };
  if (action === 'report') {
    const file = args.positional[2];
    if (!file) usage();
    console.log(reportFile(resolve(file)));
    return;
  }
  if (action !== 'run') usage();
  const env = loadEnv();
  const minutes = Number(flag('minutes') ?? 60);
  const smtpPerMinute = Number(flag('smtp-per-minute') ?? env.SMTP_PROBES_PER_MINUTE);
  if (!(minutes > 0) || !Number.isInteger(smtpPerMinute) || smtpPerMinute < 0) usage();
  const picked = pickEntries(flag('only')?.split(',').map((s) => s.trim()).filter(Boolean));
  // --mode icp: one plain-words search per entry from its intent, instead of the baseline's searches.
  const entries = flag('mode') === 'icp' ? picked.map(asIcp) : picked;
  const label = flag('label') ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  const url = flag('database-url') ?? process.env.CLI_DATABASE_URL;
  // Its own embedded server, so a `cli db` or `cli search` running meanwhile never collides with it.
  const local = url ? null : await startEvalPostgres(join(BENCH_DIR, 'eval', 'pgdata'));
  try {
    const { run, file } = await runEval({
      label,
      entries,
      minutes,
      smtpPerMinute,
      judge: !args.flags.has('no-judge'),
      keepDb: args.flags.has('keep-db'),
      verbose: args.flags.has('verbose'),
      serverUrl: url ?? local!.url,
      outDir: join(BENCH_DIR, 'eval'),
      env,
    });
    console.log(`\n${renderReport(run)}\n`);
    console.log(`wrote ${file}`);
  } finally {
    await local?.stop();
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
  if (args.positional[0] === 'bench') return bench(args);
  if (args.positional[0] === 'eval') return evalCommand(args);
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
    await sql`update accounts set plan = 'emails_100000' where clerk_user_id = ${CLI_USER}`;

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
