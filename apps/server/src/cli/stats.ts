/**
 *   pnpm --filter @nvoke/server cli stats --days 30
 *
 * `stats` picks its database like `privacy`. It prints, over the last --days
 * (default 30), Brave requests, cache hits, valid emails and Brave dollars per
 * search kind, companies found, companies with a valid email and the share
 * the company index served per kind, Claude dollars per task (sending's
 * write tasks as one, outside the pipeline), and the cost per 1,000 valid
 * emails. It only reads the database.
 */
import { loadEnv } from '../env.js';
import { costPer1000 } from '../leads/sources/paid-search.js';
import { costReport, formatCostReport } from '../leads/cost-report.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

/** `cli stats`: what a valid email cost, per search kind and Claude task (src/leads/cost-report.ts). */
async function stats(args: Args): Promise<void> {
  const daysFlag = args.flags.get('days');
  const days = Number(typeof daysFlag === 'string' ? daysFlag : 30);
  if (!Number.isInteger(days) || days < 1) usage();
  const env = loadEnv();
  const { sql, close } = await opsDatabase(args);
  try {
    // Each provider at its own price, from web_search_usage (cost-report.ts).
    const prices = { brave: costPer1000(env, 'brave'), serper: costPer1000(env, 'serper') };
    console.log(formatCostReport(await costReport(sql, days, prices)));
  } finally {
    await close();
  }
}

export const statsCommand: Command = {
  name: 'stats',
  usage: ['  cli stats [--days N] [--prod]'],
  run: stats,
};
