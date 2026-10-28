/**
 *   pnpm --filter @nvoke/server cli alert test
 *
 * `alert test` emails a test alert through Day3 (needs DAY3_API_KEY,
 * ALERT_EMAIL_TO and ALERT_EMAIL_FROM). It picks the database like stats.
 */
import { pino } from 'pino';
import { createAlerter } from '../alerts.js';
import { loadEnv } from '../env.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

/** `cli alert test`: sends a test alert email, bypassing the once per hour limit. */
async function alertTest(args: Args): Promise<void> {
  if (args.positional[1] !== 'test') usage();
  const env = loadEnv();
  const { sql, close } = await opsDatabase(args);
  try {
    const alerter = createAlerter({
      sql,
      log: pino({ level: 'error' }),
      apiKey: env.DAY3_API_KEY,
      to: env.ALERT_EMAIL_TO,
      from: env.ALERT_EMAIL_FROM,
    });
    const sent = await alerter.send({
      key: `test:${Date.now()}`,
      subject: 'Test alert',
      text: 'Alerts from the nvoke server reach this inbox.',
    });
    console.log(sent ? `sent to ${env.ALERT_EMAIL_TO.join(', ')}` : 'not sent: check DAY3_API_KEY, ALERT_EMAIL_TO and ALERT_EMAIL_FROM');
    if (!sent) process.exitCode = 1;
  } finally {
    await close();
  }
}

export const alertCommand: Command = {
  name: 'alert',
  usage: ['  cli alert test [--prod]'],
  run: alertTest,
};
