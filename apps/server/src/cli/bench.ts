/**
 *   pnpm --filter @nvoke/server cli bench sample
 *   pnpm --filter @nvoke/server cli bench crawl --label baseline
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
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { handsToLocalCrawl } from '@nvoke/shared';
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
} from '../bench/crawl-bench.js';
import { buildPlaceSample, buildSample, localFillRate, type PlaceSample } from '../bench/crawl-sample.js';
import { placeTable, runPlaceBench } from '../bench/place-bench.js';
import { loadEnv } from '../env.js';
import { BENCH_DIR, SERVER_DIR, usage, type Args, type Command } from './shared.js';

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

export const benchCommand: Command = {
  name: 'bench',
  usage: [
    '  cli bench sample | fill | place-sample',
    '  cli bench places [--label L]',
    '  cli bench crawl [--label L] [--compare L] [--concurrency N] [--only SOURCE] [--no-cache]',
    '  cli bench render --from L',
  ],
  run: bench,
};
