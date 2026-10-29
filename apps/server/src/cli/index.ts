/**
 * Every top-level CLI command, in usage order. A new command adds its file
 * under src/cli and one line here.
 */
import { alertCommand } from './alert.js';
import { benchCommand } from './bench.js';
import { ccCommand } from './cc.js';
import { dbCommand } from './db.js';
import { evalCliCommand } from './eval.js';
import { feedCommand } from './feed.js';
import { namesCommand } from './names.js';
import { privacyCommand } from './privacy.js';
import { searchCommand } from './search.js';
import { seedCommand } from './seed.js';
import { sendingCommand } from './sending.js';
import { setUsage, type Command } from './shared.js';
import { sourcesCommand } from './sources.js';
import { statsCommand } from './stats.js';

export const commands: readonly Command[] = [
  searchCommand,
  dbCommand,
  privacyCommand,
  statsCommand,
  namesCommand,
  seedCommand,
  ccCommand,
  sourcesCommand,
  alertCommand,
  feedCommand,
  benchCommand,
  evalCliCommand,
  sendingCommand,
];

/** Runs for anything that names no command, and prints usage unless it is a search. */
export const fallbackCommand: Command = searchCommand;

setUsage(
  [
    'usage:',
    ...commands.flatMap((c) => c.usage),
    'options: --csv PATH, --no-smtp, --database-url URL, --verbose',
    'privacy, stats, names, seed, cc, sources, alert, feed and sending act on DATABASE_URL only with --prod (production on the VPS), or on --database-url.',
    'Without either they use CLI_DATABASE_URL or the embedded Postgres.',
  ].join('\n'),
);
