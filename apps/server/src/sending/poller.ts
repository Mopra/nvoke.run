// The IMAP tick (docs/sending/plan.md, "poller.ts"). Every minute it claims
// active mailboxes not read in the last 3 minutes, reads INBOX and the spam
// folder after the last UIDs, classifies each mail and applies what it
// means to its lead (outcomes.ts). Mail that matches no lead is the user's
// own and is neither stored nor touched.

import type { Logger } from 'pino';
import type { Sql, TransactionSql } from 'postgres';
import type { Secrets } from '../crypto/secrets.js';
import { classifyMail, type Classified } from './classify.js';
import { checkHealth } from './health.js';
import { credentialsFor, type MailboxRow } from './mailboxes.js';
import { delayForAutoReply, endLead, recordIncoming } from './outcomes.js';
import type { IncomingMail, TransportFactory } from './types.js';

export interface PollDeps {
  sql: Sql;
  secrets: Secrets;
  transport: TransportFactory;
  log: Logger;
  /** SENDING_ENABLED: false reads nothing. */
  enabled: boolean;
}

export interface PollTickResult {
  mailboxes: number;
  replies: number;
  optOuts: number;
  bounces: number;
  autoReplies: number;
  /** Mail that matched no lead, left alone. */
  ignored: number;
}

/** A mailbox is read again this long after its last poll. */
export const POLL_INTERVAL_MS = 3 * 60_000;
/** Mailboxes read per tick, so one slow server does not hold up the rest for long. */
const POLL_BATCH = 10;

type Db = Sql | TransactionSql;

export async function pollTick(deps: PollDeps, now: Date = new Date()): Promise<PollTickResult> {
  const result: PollTickResult = { mailboxes: 0, replies: 0, optOuts: 0, bounces: 0, autoReplies: 0, ignored: 0 };
  if (!deps.enabled) return result;
  const { sql } = deps;

  // Claimed by moving last_poll_at, so another worker's tick skips them.
  const due = await sql<MailboxRow[]>`
    update mailboxes set last_poll_at = ${now}
    where id in (
      select id from mailboxes
      where status = 'active' and (last_poll_at is null or last_poll_at <= ${new Date(now.getTime() - POLL_INTERVAL_MS)})
      order by last_poll_at nulls first
      limit ${POLL_BATCH}
      for update skip locked
    )
    returning *`;

  for (const mailbox of due) {
    result.mailboxes += 1;
    try {
      await pollMailbox(deps, mailbox, now, result);
    } catch (err) {
      deps.log.warn({ err, mailboxId: mailbox.id }, 'mailbox poll failed');
    }
  }
  return result;
}

async function pollMailbox(deps: PollDeps, mailbox: MailboxRow, now: Date, result: PollTickResult): Promise<void> {
  const { sql } = deps;
  const transport = deps.transport(credentialsFor(deps.secrets, mailbox));
  let bounced = false;
  try {
    const polled = await transport.poll(mailbox.poll_state ?? {});
    for (const mail of polled.messages) {
      const done = await sql.begin((tx) => handleMail(tx, mailbox, mail, now));
      result[done] += 1;
      if (done === 'bounces') bounced = true;
    }
    await sql`update mailboxes set poll_state = ${sql.json(polled.state)} where id = ${mailbox.id}`;
  } finally {
    await transport.close().catch(() => {});
  }
  if (bounced) await checkHealth(sql, mailbox.id, now);
}

type Handled = Exclude<keyof PollTickResult, 'mailboxes'>;

/** Classifies one mail, finds its lead and applies the outcome. */
export async function handleMail(tx: Db, mailbox: MailboxRow, mail: IncomingMail, now: Date): Promise<Handled> {
  // A crash before poll_state was saved reads the same mail again.
  if (mail.messageId) {
    const seen = await tx`
      select 1 from messages where mailbox_id = ${mailbox.id} and direction = 'in' and message_id = ${mail.messageId} limit 1`;
    if (seen.length > 0) return 'ignored';
  }

  const kind = classifyMail(mail);
  const lead = await matchLead(tx, mailbox.id, mail, kind);
  if (!lead) return 'ignored';

  const record = (k: 'reply' | 'auto_reply' | 'bounce', smtpResponse: string | null = null) =>
    recordIncoming(tx, {
      userId: mailbox.clerk_user_id,
      mailboxId: mailbox.id,
      campaignId: lead.campaign_id,
      leadId: lead.id,
      kind: k,
      messageId: mail.messageId,
      inReplyTo: mail.inReplyTo,
      subject: mail.subject,
      from: bareAddress(mail.from),
      to: mailbox.address,
      body: mail.text,
      smtpResponse,
      at: mail.date,
    });

  if (kind.kind === 'bounce') {
    await record('bounce', `${kind.hard ? 'hard' : 'soft'} ${kind.status ?? ''}`.trim());
    if (!kind.hard) return 'ignored';
    await endLead(tx, lead.id, 'bounced', now);
    return 'bounces';
  }
  if (kind.kind === 'auto_reply') {
    await record('auto_reply');
    await delayForAutoReply(tx, lead.id, now);
    return 'autoReplies';
  }
  await record('reply');
  if (kind.optOut) {
    await endLead(tx, lead.id, 'opted_out', now);
    return 'optOuts';
  }
  await endLead(tx, lead.id, 'replied', now);
  return 'replies';
}

interface MatchedLead {
  id: string;
  campaign_id: string;
}

/**
 * The lead a mail is about. A reply or an auto reply names our Message-ID in
 * In-Reply-To or References; a bounce names the failed recipient. Failing
 * that, a mail from an address this mailbox has written to.
 */
async function matchLead(tx: Db, mailboxId: string, mail: IncomingMail, kind: Classified): Promise<MatchedLead | null> {
  if (kind.kind === 'bounce' && kind.recipient) {
    const [byRecipient] = await tx<MatchedLead[]>`
      select id, campaign_id from campaign_leads
      where mailbox_id = ${mailboxId} and address = ${kind.recipient.toLowerCase()}
      order by created_at desc limit 1`;
    if (byRecipient) return byRecipient;
  }
  const ids = [mail.inReplyTo, ...mail.references].filter((v): v is string => Boolean(v));
  if (ids.length > 0) {
    const [byThread] = await tx<MatchedLead[]>`
      select l.id, l.campaign_id from messages m join campaign_leads l on l.id = m.campaign_lead_id
      where m.mailbox_id = ${mailboxId} and m.direction = 'out' and m.message_id in ${tx(ids)}
      order by m.at desc limit 1`;
    if (byThread) return byThread;
  }
  if (kind.kind === 'bounce') return null;
  const from = bareAddress(mail.from);
  if (!from) return null;
  const [bySender] = await tx<MatchedLead[]>`
    select id, campaign_id from campaign_leads
    where mailbox_id = ${mailboxId} and address = ${from} and status in ('active', 'done')
    order by created_at desc limit 1`;
  return bySender ?? null;
}

/** `Jane <Jane@Acme.com>` or `jane@acme.com` to `jane@acme.com`. */
export function bareAddress(from: string): string {
  const angle = /<([^>]+)>/.exec(from);
  return (angle ? angle[1]! : from).trim().toLowerCase();
}
