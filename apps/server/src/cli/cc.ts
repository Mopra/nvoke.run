/**
 *   pnpm --filter @nvoke/server cli cc list --blocks 4000 --out cc-list.jsonl.gz
 *   pnpm --filter @nvoke/server cli cc load cc-list.jsonl.gz --limit 100000
 *
 * `cc` loads Common Crawl homepages into the company index
 * (src/leads/seed/cc-load.ts, docs/research/common-crawl-index.md). `cc list`
 * needs no database: it reads the CDX index of --crawl (default
 * CC_CRAWL), whole --shards (0-299 is the whole crawl) or --blocks N random
 * blocks (--seed S) for a trial, and writes the domains worth loading to
 * --out (gzipped when it ends in .gz). `cc load <list>` fetches their
 * homepages until about --limit N are added (default 100000), at --rate R requests
 * a second (default 20), and writes them into the index. It keeps its place
 * in <list>.progress and goes on from there; --restart reads the list from
 * the top. `cc` alone prints the rows each crawl added. Both pick the
 * database like stats.
 */
import { createReadStream, createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip, createGzip } from 'node:zlib';
import { CcFetcher, ccList, ccLoad, ccLoaded, type CcLoadStats } from '../leads/seed/cc-load.js';
import type { ListedDomain } from '../leads/seed/common-crawl.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

/** The Common Crawl crawl `cli cc` reads unless --crawl names another. */
const CC_CRAWL = 'CC-MAIN-2026-43';

/** `cli cc`: Common Crawl homepages into the company index (src/leads/seed/cc-load.ts). */
async function commonCrawl(args: Args): Promise<void> {
  const [, action, path] = args.positional;
  const str = (n: string) => {
    const v = args.flags.get(n);
    return typeof v === 'string' ? v : undefined;
  };
  const num = (n: string, fallback: number) => {
    const v = Number(str(n) ?? fallback);
    if (!Number.isFinite(v) || v <= 0) usage();
    return v;
  };
  const crawl = str('crawl') ?? CC_CRAWL;
  const log = (line: string) => console.error(line);
  const fetcher = new CcFetcher({ rate: num('rate', 20), log });
  const report = () => console.error(`requests ${fetcher.stats.requests}  retries ${fetcher.stats.retries}  403s ${fetcher.stats.blocked}  ${Math.round(fetcher.stats.bytes / 1e6)} MB`);

  if (action === 'list') {
    const out = str('out');
    const shardsFlag = str('shards');
    const blocks = str('blocks');
    if (!out || (!shardsFlag && !blocks)) usage();
    let shards: string[] | undefined;
    if (shardsFlag) {
      const [from, to = from] = shardsFlag.split('-').map(Number);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from! < 0 || to! > 299 || from! > to!) usage();
      shards = Array.from({ length: to! - from! + 1 }, (_, i) => `cdx-${String(from! + i).padStart(5, '0')}.gz`);
    }
    const file = createWriteStream(resolve(out));
    const sink = out.endsWith('.gz') ? createGzip() : null;
    sink?.pipe(file);
    const target = sink ?? file;
    const write = (d: ListedDomain) => {
      if (!target.write(`${JSON.stringify(d)}
`)) return once(target, 'drain').then(() => undefined);
    };
    const started = Date.now();
    const stats = await ccList({ crawl, fetcher, shards, blocks: blocks ? num('blocks', 1) : undefined, seed: num('seed', 1), write, log });
    target.end();
    await once(file, 'close');
    console.log(`domains ${stats.domains}  filtered ${stats.filtered}  no homepage ${stats.noHomepage}  listed ${stats.listed}  in ${Math.round((Date.now() - started) / 1000)} s`);
    report();
    return;
  }

  const { sql, close } = await opsDatabase(args);
  try {
    if (action === 'load') {
      if (!path) usage();
      const progressFile = `${resolve(path)}.progress`;
      let skip = 0;
      if (!args.flags.has('restart') && existsSync(progressFile)) skip = Number(readFileSync(progressFile, 'utf8').trim()) || 0;
      if (skip > 0) console.error(`going on after line ${skip} (${progressFile}; --restart reads from the top)`);
      const input = createReadStream(resolve(path));
      const lines = createInterface({ input: path.endsWith('.gz') ? input.pipe(createGunzip()) : input, crlfDelay: Infinity });
      const list = (async function* () {
        for await (const line of lines) if (line.trim()) yield JSON.parse(line) as ListedDomain;
      })();
      const started = Date.now();
      let shown = 0;
      const line = (s: CcLoadStats) =>
        `read ${s.read}  known ${s.known}  failed ${s.failed}  parked ${s.dropped.parked}  walled ${s.dropped.wall}  empty ${s.dropped.empty}  not html ${s.dropped.not_html}  added ${s.added}`;
      const stats = await ccLoad(sql, list, {
        crawl,
        fetcher,
        limit: num('limit', 100_000),
        skip,
        onProgress: (s) => {
          writeFileSync(progressFile, String(s.read));
          if (Date.now() - shown > 60_000) {
            shown = Date.now();
            const perSecond = fetcher.stats.requests / ((Date.now() - started) / 1000);
            console.error(`${line(s)}  (${perSecond.toFixed(1)} requests a second)`);
          }
        },
      });
      lines.close();
      console.log(line(stats));
      report();
    }
    for (const r of await ccLoaded(sql)) console.log(`${r.crawl}: ${r.domains} domains in the index, last loaded ${r.last.toISOString()}`);
  } finally {
    await close();
  }
}

export const ccCommand: Command = {
  name: 'cc',
  usage: [
    '  cli cc list (--shards A-B | --blocks N [--seed S]) --out <file> [--crawl C]',
    '  cli cc load <file> [--limit N] [--rate R] [--crawl C] [--restart] [--prod]',
    '  cli cc [--prod]',
  ],
  run: commonCrawl,
};
