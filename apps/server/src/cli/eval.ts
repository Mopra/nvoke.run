/**
 *   pnpm --filter @nvoke/server cli eval run --label baseline
 *   pnpm --filter @nvoke/server cli eval report apps/server/.bench/eval/<file>.json
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
import { join, resolve } from 'node:path';
import { renderReport } from '../bench/eval-metrics.js';
import { reportFile, runEval, startEvalPostgres } from '../bench/eval-run.js';
import { asIcp, pickEntries } from '../bench/eval-suite.js';
import { loadEnv } from '../env.js';
import { BENCH_DIR, usage, type Args, type Command } from './shared.js';

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

export const evalCliCommand: Command = {
  name: 'eval',
  usage: [
    '  cli eval run [--label L] [--only ID,ID] [--mode icp] [--minutes N] [--smtp-per-minute N] [--no-judge] [--keep-db]',
    '  cli eval report <file.json>',
  ],
  run: evalCommand,
};
