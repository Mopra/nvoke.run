/**
 *   pnpm --filter @nvoke/server cli seed majestic --limit 5000
 *
 * `seed <source>` imports a batch of a free domain list into the company
 * seed (src/leads/seed, docs/research/company-seed.md) for the worker to
 * crawl at SEED_DAILY_DOMAINS a day. `majestic` downloads the Majestic
 * Million; `file <path>` reads a list on disk (a Common Crawl ranks file, a
 * CSV with a Domain column, or one domain per line). --limit N domains to
 * add (default 5000), --skip N ranks to pass over (majestic: 10000). It
 * picks its database like stats.
 */
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { importSeed, seedQueue } from '../leads/seed/import.js';
import { SEED_SOURCES, seedEntries } from '../leads/seed/sources.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

/** `cli seed <source>`: imports a batch of a free domain list for the seed tick (src/leads/seed). */
async function seed(args: Args): Promise<void> {
  const [, name, path] = args.positional;
  const flag = (n: string) => {
    const v = args.flags.get(n);
    return typeof v === 'string' ? Number(v) : undefined;
  };
  const known = name ? SEED_SOURCES[name] : undefined;
  if (!name || (!known && !(name === 'file' && path))) usage();
  const limit = flag('limit') ?? 5_000;
  const skipTop = flag('skip') ?? known?.skipTop ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(skipTop) || skipTop < 0) usage();

  let lines: AsyncIterable<string>;
  if (known) {
    console.error(`downloading ${known.url} (${known.licence})`);
    const res = await fetch(known.url);
    if (!res.ok || !res.body) throw new Error(`${known.url} answered ${res.status}`);
    lines = createInterface({ input: Readable.fromWeb(res.body as WebReadableStream), crlfDelay: Infinity });
  } else {
    lines = createInterface({ input: createReadStream(resolve(path!)), crlfDelay: Infinity });
  }
  const { sql, close } = await opsDatabase(args);
  try {
    const source = known ? name : `file:${path}`;
    const r = await importSeed(sql, seedEntries(lines), { source, limit, skipTop });
    console.log(`read ${r.read}  filtered ${r.filtered}  known ${r.known}  added ${r.added}  (ranks 1 to ${skipTop} passed over)`);
    const q = await seedQueue(sql);
    console.log(`seed queue: queued ${q.queued}  running ${q.running}  done ${q.done}  skipped ${q.skipped}  crawled in the last 24 hours ${q.lastDay}`);
  } finally {
    (lines as { close?: () => void }).close?.();
    await close();
  }
}

export const seedCommand: Command = {
  name: 'seed',
  usage: ['  cli seed majestic | file <path> [--limit N] [--skip N] [--prod]'],
  run: seed,
};
