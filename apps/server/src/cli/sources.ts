/**
 *   pnpm --filter @nvoke/server cli sources resume brave
 *
 * `sources resume <source>` ends a source pause early once its cause is
 * fixed. It picks the database like stats.
 */
import { resumeSource } from '../leads/source-pause.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

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

export const sourcesCommand: Command = {
  name: 'sources',
  usage: ['  cli sources resume <source> [--prod]'],
  run: sources,
};
