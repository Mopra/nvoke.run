// The send tick (docs/sending/plan.md, "sender.ts"). Every 30 seconds:
// find due leads, let pickDue choose at most one per mailbox, then for each
// lock the mailbox and the lead (skip locked, so several workers share the
// work and never send twice), check everything again, send the step and
// record it. Step 1 starts the thread; later steps answer it with
// In-Reply-To, References and `Re:`. Plain text, a fixed footer, and the
// one click List-Unsubscribe header on every email.

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Sql, TransactionSql } from 'postgres';
import type { CampaignSchedule, CampaignStep } from '@nvoke/shared';
import type { Secrets } from '../crypto/secrets.js';
import { sendSuppressedSql, suppressedSql } from '../leads/suppression.js';
import { withFooter } from './footer.js';
import { isBlockedCountry } from './gate.js';
import { authFailed, checkHealth, pauseMailbox } from './health.js';
import { credentialsFor, type MailboxRow } from './mailboxes.js';
import { endLead, finishIfDone, recordIncoming } from './outcomes.js';
import { mailboxCapacity, MIN_GAP_MS, pickDue, stepSendAt, type DueLead, type MailboxSlot } from './schedule.js';
import type { MailboxCredentials, OutgoingMail, SendResult, TransportFactory } from './types.js';
import { signUnsubscribe } from './unsubscribe.js';

export interface SendDeps {
  sql: Sql;
  secrets: Secrets;
  transport: TransportFactory;
  log: Logger;
  /** Where /u/:token is served, for the List-Unsubscribe header. */
  publicApiUrl: string;
  /** SENDING_ENABLED: false sends nothing. */
  enabled: boolean;
}

export interface SendTickResult {
  sent: number;
  bounced: number;
  retried: number;
  /** Leads ended at send time: suppressed, blocked country, nothing written. */
  stopped: number;
  /** Picked but taken by another worker, or the mailbox changed in between. */
  skipped: number;
}

/** A temporary failure tries the same step again after this long. */
export const RETRY_MS = 15 * 60_000;
const DAY_MS = 86_400_000;
const CANDIDATES = 500;

type Db = Sql | TransactionSql;
type Outcome = keyof SendTickResult;

export async function sendTick(deps: SendDeps, now: Date = new Date()): Promise<SendTickResult> {
  const result: SendTickResult = { sent: 0, bounced: 0, retried: 0, stopped: 0, skipped: 0 };
  if (!deps.enabled) return result;
  const { sql } = deps;

  const due = await sql<{ id: string; mailbox_id: string; domain: string; next_send_at: Date }[]>`
    select l.id, l.mailbox_id, l.domain, l.next_send_at
    from campaign_leads l
    join campaigns c on c.id = l.campaign_id
    join mailboxes m on m.id = l.mailbox_id
    where l.status in ('queued', 'active') and l.next_send_at <= ${now}
      and c.status in ('scheduled', 'sending') and (c.review_until is null or c.review_until <= ${now})
      and m.status = 'active'
    order by l.next_send_at
    limit ${CANDIDATES}`;
  if (due.length === 0) return result;

  const slots = await mailboxSlots(sql, [...new Set(due.map((d) => d.mailbox_id))], now);
  const leads: DueLead[] = due.map((d) => ({ id: d.id, mailboxId: d.mailbox_id, domain: d.domain, nextSendAt: d.next_send_at }));
  for (const pick of pickDue(leads, slots, now)) {
    try {
      result[await sendOne(deps, pick.id, pick.mailboxId, now)] += 1;
    } catch (err) {
      deps.log.error({ err, leadId: pick.id }, 'send failed');
    }
  }
  return result;
}

async function mailboxSlots(sql: Sql, ids: string[], now: Date): Promise<MailboxSlot[]> {
  const since = new Date(now.getTime() - DAY_MS);
  const rows = await sql<{ id: string; daily_cap: number; warm: boolean; ramp_started_at: Date; last_send_at: Date | null; sent: number }[]>`
    select m.id, m.daily_cap, m.warm, m.ramp_started_at, m.last_send_at,
      (select count(*)::int from messages g
        where g.mailbox_id = m.id and g.direction = 'out' and g.at > ${since}) as sent
    from mailboxes m where m.id in ${sql(ids)}`;
  const domains = await sql<{ mailbox_id: string; domain: string; n: number }[]>`
    select g.mailbox_id, l.domain, count(*)::int as n
    from messages g join campaign_leads l on l.id = g.campaign_lead_id
    where g.mailbox_id in ${sql(ids)} and g.direction = 'out' and g.at > ${since}
    group by g.mailbox_id, l.domain`;
  return rows.map((r) => ({
    id: r.id,
    capacity: mailboxCapacity({ dailyCap: r.daily_cap, warm: r.warm, rampStartedAt: r.ramp_started_at }, r.sent, now),
    lastSendAt: r.last_send_at,
    sentToDomainToday: Object.fromEntries(domains.filter((d) => d.mailbox_id === r.id).map((d) => [d.domain, d.n])),
  }));
}

interface LockedLead {
  id: string;
  campaign_id: string;
  clerk_user_id: string;
  address: string;
  domain: string;
  country: string | null;
  timezone: string;
  next_step: number;
  steps: CampaignStep[];
  schedule: CampaignSchedule;
  global_suppressed: boolean;
  own_suppressed: boolean;
}

async function sendOne(deps: SendDeps, leadId: string, mailboxId: string, now: Date): Promise<Outcome> {
  return deps.sql.begin(async (tx): Promise<Outcome> => {
    // The mailbox first: one send per mailbox at a time, across workers.
    const [mailbox] = await tx<MailboxRow[]>`
      select * from mailboxes where id = ${mailboxId} and status = 'active' for update skip locked`;
    if (!mailbox) return 'skipped';
    if (mailbox.last_send_at && now.getTime() - mailbox.last_send_at.getTime() < MIN_GAP_MS) return 'skipped';
    const [count] = await tx<{ sent: number }[]>`
      select count(*)::int as sent from messages
      where mailbox_id = ${mailboxId} and direction = 'out' and at > ${new Date(now.getTime() - DAY_MS)}`;
    const ramp = { dailyCap: mailbox.daily_cap, warm: mailbox.warm, rampStartedAt: mailbox.ramp_started_at };
    if (mailboxCapacity(ramp, count?.sent ?? 0, now) <= 0) return 'skipped';

    const [lead] = await tx<LockedLead[]>`
      select l.id, l.campaign_id, l.clerk_user_id, l.address, l.domain, l.country, l.timezone,
        l.next_step, c.steps, c.schedule,
        ${suppressedSql(tx, 'l.address')} as global_suppressed,
        ${sendSuppressedSql(tx, 'l.clerk_user_id', 'l.address')} as own_suppressed
      from campaign_leads l join campaigns c on c.id = l.campaign_id
      where l.id = ${leadId} and l.mailbox_id = ${mailboxId}
        and l.status in ('queued', 'active') and l.next_send_at <= ${now}
        and c.status in ('scheduled', 'sending') and (c.review_until is null or c.review_until <= ${now})
      for update of l skip locked`;
    if (!lead) return 'skipped';

    if (lead.global_suppressed || lead.own_suppressed) return stop(tx, lead, 'suppressed', now);
    if (isBlockedCountry(lead.country)) return stop(tx, lead, 'country', now);
    const [written] = await tx<{ subject: string; body: string }[]>`
      select subject, body from campaign_steps_written where campaign_lead_id = ${lead.id} and step = ${lead.next_step}`;
    if (!written) return stop(tx, lead, 'not_written', now, 'failed');

    let creds: MailboxCredentials;
    try {
      creds = credentialsFor(deps.secrets, mailbox);
    } catch {
      await pauseMailbox(tx, mailboxId, 'Paused: the saved password no longer opens. Enter the app password again to resume.');
      return 'skipped';
    }

    const earlier = await tx<{ message_id: string; subject: string }[]>`
      select message_id, subject from messages
      where campaign_lead_id = ${lead.id} and direction = 'out' and kind = 'step' and message_id is not null
      order by step, at`;
    const rowId = randomUUID();
    const url = `${deps.publicApiUrl.replace(/\/+$/, '')}/u/${signUnsubscribe(deps.secrets, rowId)}`;
    const senderDomain = mailbox.address.slice(mailbox.address.lastIndexOf('@') + 1);
    const mail: OutgoingMail = {
      to: lead.address,
      subject: earlier[0] ? replySubject(earlier[0].subject) : written.subject,
      text: withFooter(written.body, { signature: mailbox.signature, displayName: mailbox.display_name, domain: lead.domain, unsubscribeUrl: url }),
      messageId: `<${randomUUID()}@${senderDomain}>`,
      headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    };
    if (earlier.length > 0) {
      mail.inReplyTo = earlier[earlier.length - 1]!.message_id;
      mail.references = earlier.map((m) => m.message_id);
    }

    const transport = deps.transport(creds);
    let sent: SendResult;
    try {
      sent = await transport.send(mail);
    } catch (err) {
      sent = { ok: false, kind: 'temporary', response: err instanceof Error ? err.message : String(err) };
    } finally {
      await transport.close().catch(() => {});
    }

    if (!sent.ok) {
      deps.log.warn({ leadId: lead.id, mailboxId, kind: sent.kind, response: sent.response }, 'send refused');
      if (sent.kind === 'auth') {
        // The lead keeps its place and goes out once the mailbox is fixed.
        await authFailed(tx, mailboxId, sent.response);
        return 'skipped';
      }
      if (sent.kind === 'temporary') {
        await tx`update campaign_leads set next_send_at = ${new Date(now.getTime() + RETRY_MS)} where id = ${lead.id}`;
        return 'retried';
      }
      // A 5xx for this recipient is a hard bounce, as if the report had come back.
      await recordIncoming(tx, {
        userId: lead.clerk_user_id,
        mailboxId,
        campaignId: lead.campaign_id,
        leadId: lead.id,
        kind: 'bounce',
        messageId: null,
        inReplyTo: mail.messageId,
        subject: mail.subject,
        from: mailbox.address,
        to: lead.address,
        body: null,
        smtpResponse: `hard ${sent.response}`.slice(0, 500),
        at: now,
      });
      await endLead(tx, lead.id, 'bounced', now);
      await checkHealth(tx, mailboxId, now);
      return 'bounced';
    }

    await tx`
      insert into messages (id, clerk_user_id, mailbox_id, campaign_id, campaign_lead_id, direction, kind,
        message_id, in_reply_to, subject, from_address, to_address, step, smtp_response, at)
      values (${rowId}, ${lead.clerk_user_id}, ${mailboxId}, ${lead.campaign_id}, ${lead.id}, 'out', 'step',
        ${mail.messageId}, ${mail.inReplyTo ?? null}, ${mail.subject}, ${mailbox.address}, ${lead.address},
        ${lead.next_step}, ${sent.response.slice(0, 500)}, ${now})`;
    await tx`
      insert into send_usage (clerk_user_id, period, sent) values (${lead.clerk_user_id}, ${now.toISOString().slice(0, 7)}, 1)
      on conflict (clerk_user_id, period) do update set sent = send_usage.sent + 1`;
    await tx`update mailboxes set last_send_at = ${now} where id = ${mailboxId}`;
    await tx`
      update campaigns set sent = sent + 1,
        status = case when status = 'scheduled' then 'sending' else status end,
        started_at = coalesce(started_at, ${now})
      where id = ${lead.campaign_id}`;

    // steps is 0-based, next_step 1-based: this is the step after the one just sent.
    const following = lead.steps[lead.next_step];
    if (following) {
      const at = stepSendAt({ prevSentAt: now, waitDays: following.waitDays, timezone: lead.timezone, schedule: lead.schedule });
      await tx`
        update campaign_leads set status = 'active', next_step = ${lead.next_step + 1}, next_send_at = ${at},
          thread_message_id = coalesce(thread_message_id, ${mail.messageId})
        where id = ${lead.id}`;
    } else {
      await tx`
        update campaign_leads set status = 'done', next_send_at = null,
          thread_message_id = coalesce(thread_message_id, ${mail.messageId})
        where id = ${lead.id}`;
      await finishIfDone(tx, lead.campaign_id, now);
    }
    return 'sent';
  });
}

/** Ends a lead that may not get its next step, with the reason shown in the campaign. */
async function stop(tx: Db, lead: LockedLead, reason: string, now: Date, status: 'stopped' | 'failed' = 'stopped'): Promise<Outcome> {
  await tx`update campaign_leads set status = ${status}, skip_reason = ${reason}, next_send_at = null where id = ${lead.id}`;
  await finishIfDone(tx, lead.campaign_id, now);
  return 'stopped';
}

/** The thread's subject for a follow up: `Re: ` once. */
export function replySubject(subject: string): string {
  return `Re: ${subject.replace(/^\s*(re:\s*)+/i, '').trim()}`;
}
