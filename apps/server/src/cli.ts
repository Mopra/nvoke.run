/**
 * The server CLI: one search end to end against a local database, the local
 * dev database and the operator's tools. Each top-level command lives in
 * src/cli/<command>.ts with its usage lines and notes; src/cli/index.ts lists
 * them. This file parses the arguments and dispatches.
 *
 *   pnpm --filter @nvoke/server cli search local "dentists" "Copenhagen" --limit 5
 *   pnpm --filter @nvoke/server cli db
 *   pnpm --filter @nvoke/server cli stats --days 30
 *
 * Without --database-url (or CLI_DATABASE_URL) the CLI starts an embedded
 * Postgres with its data in apps/server/.pgdata. `search` and `db` never
 * touch DATABASE_URL, which points at production. The operator commands
 * (privacy, stats, seed, cc, sources, alert, feed, sending) use
 * --database-url, then DATABASE_URL only when --prod is given, then
 * CLI_DATABASE_URL or the embedded Postgres, and print the database first.
 */
import { commands, fallbackCommand } from './cli/index.js';
import type { Args } from './cli/shared.js';

/** Flags that never take a value. */
const SWITCHES = ['no-smtp', 'verbose', 'prod', 'no-cache', 'no-judge', 'keep-db', 'restart'];

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  const lists = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && !SWITCHES.includes(name)) {
        flags.set(name, next);
        lists.set(name, [...(lists.get(name) ?? []), next]);
        i++;
      } else flags.set(name, true);
    } else positional.push(a);
  }
  return { positional, flags, lists };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = commands.find((c) => c.name === args.positional[0]) ?? fallbackCommand;
  return command.run(args);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
