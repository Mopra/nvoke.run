// What a reply, an opt-out, a bounce or an auto reply does to a lead
// (docs/sending/plan.md, "outcomes.ts"). Shared by the poller, the sender
// (a 5xx at send time is a bounce) and the unsubscribe link. Every function
// takes the caller's transaction and is safe to run twice.

import type { Sql, TransactionSql } from 'postgres';
import type { CampaignSchedule } from '@nvoke/shared';
import { suppressForSender } from '../leads/suppression.js';
import { nextSendAt } from './schedule.js';

type Db = Sql | TransactionSql;

/** The end states an outcome moves a lead to, with the campaign counter each one bumps. */
export type LeadEnd = 'replied' | 'opted_out' | 'bounced';

const COUNTER: Record<LeadEnd, 'replied' | 'opted_out' | 'bounced'> = {
  replied: 'replied',
  opted_out: 'opted_out',
  bounced: 'bounced',
};

/** An auto reply ("out of office") holds the next step this long. */
export const AUTO_REPLY_DELAY_MS = 3 * 86_400_000;

/**
 * Ends a lead's sequence. A lead still in the sequence, or done with it,
 * moves to `end` and its campaign counter goes up once. An opt-out and a
 * hard bounce also stop the sender writing to the address again, even when
 * the lead had already ended (say it replied, then clicked unsubscribe).
 * A hard bounce marks the address invalid in the user's emails and in the
 * verification cache. Returns whether the lead moved.
 */
export async function endLead(tx: Db, leadId: string, end: LeadEnd, now: Date = new Date()): Promise<boolean> {
  const [lead] = await tx<{ campaign_id: string; clerk_user_id: string; address: string; status: string }[]>`
    select campaign_id, clerk_user_id, address, status from campaign_leads where id = ${leadId}`;
  if (!lead) return false;

  if (end === 'opted_out') await suppressForSender(tx, lead.clerk_user_id, lead.address, 'unsubscribe');
  if (end === 'bounced') {
    await suppressForSender(tx, lead.clerk_user_id, lead.address, 'bounce');
    await tx`
      update emails set verification = 'invalid', checked_at = ${now}
      where clerk_user_id = ${lead.clerk_user_id} and address = ${lead.address}`;
    await tx`
      insert into email_checks (address, verification, reason, checked_at)
      values (${lead.address}, 'invalid', 'bounce', ${now})
      on conflict (address) do update set verification = 'invalid', reason = 'bounce', checked_at = excluded.checked_at`;
  }

  const moved = await tx`
    update campaign_leads set status = ${end}, next_send_at = null
    where id = ${leadId} and status in ('writing', 'queued', 'active', 'done')
    returning id`;
  if (moved.length === 0) return false;
  const counter = tx(COUNTER[end]);
  await tx`update campaigns set ${counter} = ${counter} + 1 where id = ${lead.campaign_id}`;
  await finishIfDone(tx, lead.campaign_id, now);
  return true;
}

/**
 * A list campaign is done when no lead is left to write or send. Autopilot
 * campaigns never finish on their own: their source keeps adding leads.
 */
export async function finishIfDone(tx: Db, campaignId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await tx`
    update campaigns c set status = 'done', finished_at = ${now}
    where c.id = ${campaignId} and not c.autopilot and c.status in ('scheduled', 'sending')
      and not exists (
        select 1 from campaign_leads l
        where l.campaign_id = c.id and l.status in ('writing', 'queued', 'active')
      )
    returning id`;
  return rows.length > 0;
}

/**
 * Holds the lead's next step for three days after an auto reply, then puts
 * it back inside the campaign's sending hours. Nothing stops.
 */
export async function delayForAutoReply(tx: Db, leadId: string, now: Date = new Date(), random?: () => number): Promise<boolean> {
  const [row] = await tx<{ next_send_at: Date | null; timezone: string; schedule: CampaignSchedule }[]>`
    select l.next_send_at, l.timezone, c.schedule from campaign_leads l
    join campaigns c on c.id = l.campaign_id
    where l.id = ${leadId} and l.status in ('queued', 'active') and l.next_send_at is not null`;
  if (!row) return false;
  const base = Math.max(row.next_send_at!.getTime(), now.getTime());
  const at = nextSendAt({ after: new Date(base + AUTO_REPLY_DELAY_MS), timezone: row.timezone, schedule: row.schedule, random });
  await tx`update campaign_leads set next_send_at = ${at} where id = ${leadId}`;
  return true;
}

export interface IncomingRow {
  userId: string;
  mailboxId: string;
  campaignId: string | null;
  leadId: string | null;
  kind: 'reply' | 'auto_reply' | 'bounce' | 'other';
  messageId: string | null;
  inReplyTo: string | null;
  subject: string;
  from: string;
  to: string;
  /** Kept for replies only, so the user can read them in Replies. */
  body: string | null;
  /** Bounces: `hard 5.1.1` or `soft 4.2.2`, what health.ts counts. */
  smtpResponse: string | null;
  at: Date;
}

/** Stores a received mail (or a bounce at send time) in messages. */
export async function recordIncoming(tx: Db, r: IncomingRow): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into messages (clerk_user_id, mailbox_id, campaign_id, campaign_lead_id, direction, kind,
      message_id, in_reply_to, subject, from_address, to_address, body_text, smtp_response, at)
    values (${r.userId}, ${r.mailboxId}, ${r.campaignId}, ${r.leadId}, 'in', ${r.kind},
      ${r.messageId}, ${r.inReplyTo}, ${r.subject.slice(0, 998)}, ${r.from}, ${r.to},
      ${r.kind === 'reply' ? r.body : null}, ${r.smtpResponse}, ${r.at})
    returning id`;
  return row!.id;
}
