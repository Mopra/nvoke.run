/**
 *   pnpm --filter @nvoke/server cli feed collect
 *
 * `feed collect` runs every feed collector now, whatever its interval, and
 * prints what each found and how much of it was new; `feed` alone prints
 * the feed per source. Both pick the database like stats.
 */
import { pino } from 'pino';
import { collectDue } from '../feed/collect.js';
import { createCollectors, sourceAvailability } from '../feed/collectors.js';
import { feedSourceStatus } from '../feed/drops.js';
import { loadEnv } from '../env.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

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

export const feedCommand: Command = {
  name: 'feed',
  usage: ['  cli feed [collect] [--prod]'],
  run: feed,
};
