/**
 *   pnpm --filter @nvoke/server cli privacy export someone@example.dk
 *   pnpm --filter @nvoke/server cli privacy erase someone@example.dk
 *   pnpm --filter @nvoke/server cli privacy erase example.dk
 *   pnpm --filter @nvoke/server cli privacy suppress-domain example.dk
 *
 * `privacy` is the operator's tool for data subject requests
 * (deploy/PRIVACY-RUNBOOK.md). It uses --database-url, then DATABASE_URL only
 * when --prod is given, then CLI_DATABASE_URL or the embedded Postgres. --prod
 * is required because apps/server/.env sets DATABASE_URL on development
 * machines too. It prints the database it uses before doing anything.
 *
 *   privacy export <address>          JSON of everything held about the address
 *   privacy erase <address|domain>    suppress, then delete every stored copy
 *   privacy suppress-domain <domain>  suppress the domain and delete its addresses,
 *                                     keeping the company rows in existing searches
 *   --source S                        erase and suppress-domain: where the request
 *                                     came from (email, opt_out_page, bot_page, admin;
 *                                     default email)
 */
import { suppress, type SuppressionSource } from '../leads/suppression.js';
import { erase } from '../privacy/erase.js';
import { exportSubject } from '../privacy/export.js';
import { parseDomain, parseTarget } from '../privacy/target.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

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

export const privacyCommand: Command = {
  name: 'privacy',
  usage: [
    '  cli privacy export <address> [--prod]',
    '  cli privacy erase <address|domain> [--source S] [--prod]',
    '  cli privacy suppress-domain <domain> [--source S] [--prod]',
  ],
  run: privacy,
};
