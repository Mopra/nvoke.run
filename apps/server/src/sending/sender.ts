// The send tick (docs/sending/plan.md, "sender.ts"). Every 30 seconds:
// find due leads, a few per mailbox that may send now, put off the ones
// outside their recipient's working hours, let pickDue choose at most one
// per mailbox, then send each in three steps. The claim (a short
// transaction that locks the mailbox and the lead with skip locked, checks
// everything again, writes the outgoing messages row with its Message-ID
// and takes the lead off the queue) commits before SMTP runs. The send runs
// outside any transaction. The confirm (a second transaction) counts it and
// moves the lead on. A claim never confirmed may have gone out, so it is
// never sent again: after 10 minutes the lead turns 'failed' with
// skip_reason 'unconfirmed' for the user to look at. Step 1 starts the
// thread; later steps answer it with In-Reply-To, References and `Re:`.
// Plain text, the footer (footer.ts), and the one click List-Unsubscribe header on
// every email. Mailboxes in one pool (one provider organization) also stay
// under the pool's daily cap. A campaign whose product asks for a recheck
// (exit1: the lead's broken certificate) checks it live before each step
// and stops the lead once it is fixed (recheck.ts).

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Sql, TransactionSql } from 'postgres';
import type { CampaignSchedule, CampaignStep } from '@nvoke/shared';
import type { Secrets } from '../crypto/secrets.js';
import { sendSuppressedSql, suppressedSql } from '../leads/suppression.js';
import { withFooter } from './footer.js';
import { isPolicyBlock } from './classify.js';
import { isBlockedCountry } from './gate.js';
import { authFailed, checkHealth, pauseMailbox } from './health.js';
import { credentialsFor, type MailboxRow } from './mailboxes.js';
import { endLead, finishIfDone, recordIncoming } from './outcomes.js';
import { recheckSsl, type RecheckResult } from './recheck.js';
import { inWindow, mailboxCapacity, MIN_GAP_MS, nextSendAt, pickDue, stepSendAt, type DueLead, type MailboxSlot } from './schedule.js';
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
  /** SENDING_USERS: only their campaigns and mailboxes send. Empty sends nothing. */
  users: readonly string[];
  /** True once the worker shuts down: the tick claims nothing more. */
  stopping?: () => boolean;
  /** The live certificate check for a `recheck: 'ssl'` product. recheckSsl when left out. */
  recheckSsl?: (domain: string, now: Date) => Promise<RecheckResult>;
}

export interface SendTickResult {
  sent: number;
  bounced: number;
  retried: number;
  /** Leads ended at send time: suppressed, blocked country, nothing written, fixed since (recheck). */
  stopped: number;
  /** Picked but taken by another worker, or the mailbox changed in between. */
  skipped: number;
  /** Due outside the recipient's working hours: moved to the next open window. */
  deferred: number;
  /** Claims that may have gone out without a confirm: failed, never sent again. */
  unconfirmed: number;
}

/** A temporary failure tries the same step again after this long, inside the schedule. */
export const RETRY_MS = 15 * 60_000;
/** A claim not confirmed after this long is marked 'unconfirmed'. */
export const CLAIM_TIMEOUT_MS = 10 * 60_000;
/** Due leads looked at per mailbox per tick, so one backlog never crowds out the others. */
export const PER_MAILBOX = 10;
const DAY_MS = 86_400_000;

/**
 * SMTP errors that come before the message is handed over: the mail surely
 * did not go, so a retry is safe. Any other temporary failure without a 4xx
 * reply (a timeout or a dropped connection after DATA) may have gone out.
 */
const BEFORE_DATA = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|getaddrinfo|Greeting never received|Connection timeout/i;

type Db = Sql | TransactionSql;
type Outcome = keyof SendTickResult;

export async function sendTick(deps: SendDeps, now: Date = new Date()): Promise<SendTickResult> {
  const result: SendTickResult = { sent: 0, bounced: 0, retried: 0, stopped: 0, skipped: 0, deferred: 0, unconfirmed: 0 };
  if (!deps.enabled || deps.users.length === 0) return result;
  const { sql } = deps;
  const users = sql(deps.users);
  result.unconfirmed += await expireClaims(deps, now);

  const isDue = sql`
    l.status in ('queued', 'active') and l.claimed_at is null and l.next_send_at <= ${now}
    and c.status in ('scheduled', 'sending') and (c.review_until is null or c.review_until <= ${now})
    and c.clerk_user_id in ${users}`;
  const withDue = await sql<{ id: string }[]>`
    select m.id from mailboxes m
    where m.status = 'active' and m.clerk_user_id in ${users} and exists (
      select 1 from campaign_leads l join campaigns c on c.id = l.campaign_id
      where l.mailbox_id = m.id and ${isDue})`;
  if (withDue.length === 0) return result;

  // Only mailboxes that may send now, and a few of the oldest due leads of each.
  const slots = (await mailboxSlots(sql, withDue.map((m) => m.id), now)).filter(
    (s) => s.capacity > 0 && !(s.lastSendAt && now.getTime() - s.lastSendAt.getTime() < MIN_GAP_MS),
  );
  if (slots.length === 0) return result;
  const due = await sql<{ id: string; mailbox_id: string; domain: string; next_send_at: Date; timezone: string; schedule: CampaignSchedule }[]>`
    select d.* from mailboxes m cross join lateral (
      select l.id, l.mailbox_id, l.domain, l.next_send_at, l.timezone, c.schedule
      from campaign_leads l join campaigns c on c.id = l.campaign_id
      where l.mailbox_id = m.id and ${isDue}
      order by l.next_send_at
      limit ${PER_MAILBOX}
    ) d
    where m.id in ${sql(slots.map((s) => s.id))}`;

  const leads: DueLead[] = [];
  for (const d of due) {
    if (inWindow(now, d.timezone, d.schedule)) {
      leads.push({ id: d.id, mailboxId: d.mailbox_id, domain: d.domain, nextSendAt: d.next_send_at });
      continue;
    }
    const at = nextSendAt({ after: now, timezone: d.timezone, schedule: d.schedule });
    const moved = await sql`
      update campaign_leads set next_send_at = ${at}
      where id = ${d.id} and claimed_at is null and next_send_at <= ${now}`;
    result.deferred += moved.count;
  }

  const picks = pickDue(leads, slots, now);
  const rechecks = picks.length
    ? await sql<RecheckLead[]>`
        select l.id, l.domain, l.timezone, l.written_at, c.schedule from campaign_leads l join campaigns c on c.id = l.campaign_id
        where l.id in ${sql(picks.map((p) => p.id))} and c.product ->> 'recheck' = 'ssl'`
    : [];
  const recheckLead = new Map(rechecks.map((r) => [r.id, r]));
  for (const pick of picks) {
    if (deps.stopping?.()) break;
    try {
      const check = recheckLead.get(pick.id);
      if (check) {
        const seen = await (deps.recheckSsl ?? recheckSsl)(check.domain, now);
        if (seen !== 'problem') {
          result[await afterRecheck(deps.sql, check, seen, now)] += 1;
          continue;
        }
      }
      result[await sendOne(deps, pick.id, pick.mailboxId, now)] += 1;
    } catch (err) {
      deps.log.error({ err, leadId: pick.id }, 'send failed');
    }
  }
  return result;
}

/**
 * Claims older than CLAIM_TIMEOUT_MS: the worker died or lost the database
 * between the send and its confirm. The mail may have gone, so the lead is
 * not sent again; it turns 'failed' with skip_reason 'unconfirmed'.
 */
async function expireClaims(deps: SendDeps, now: Date): Promise<number> {
  const rows = await deps.sql<{ id: string; campaign_id: string; mailbox_id: string | null }[]>`
    update campaign_leads set claimed_at = null, next_send_at = null,
      skip_reason = case when status in ('queued', 'active') then 'unconfirmed' else skip_reason end,
      status = case when status in ('queued', 'active') then 'failed' else status end
    where claimed_at < ${new Date(now.getTime() - CLAIM_TIMEOUT_MS)} and clerk_user_id in ${deps.sql(deps.users)}
    returning id, campaign_id, mailbox_id`;
  for (const r of rows) {
    deps.log.error({ leadId: r.id, campaignId: r.campaign_id, mailboxId: r.mailbox_id }, 'send unconfirmed: it may have gone out, so it is not sent again');
  }
  for (const campaignId of new Set(rows.map((r) => r.campaign_id))) await finishIfDone(deps.sql, campaignId, now);
  return rows.length;
}

async function mailboxSlots(sql: Sql, ids: string[], now: Date): Promise<MailboxSlot[]> {
  const since = new Date(now.getTime() - DAY_MS);
  const rows = await sql<
    { id: string; daily_cap: number; warm: boolean; ramp_started_at: Date; last_send_at: Date | null; sent: number; pool_left: number | null }[]
  >`
    select m.id, m.daily_cap, m.warm, m.ramp_started_at, m.last_send_at,
      (select count(*)::int from messages g
        where g.mailbox_id = m.id and g.direction = 'out' and g.at > ${since}) as sent,
      ${poolLeftSql(sql, since)} as pool_left
    from mailboxes m where m.id in ${sql(ids)}`;
  const domains = await sql<{ mailbox_id: string; domain: string; n: number }[]>`
    select g.mailbox_id, l.domain, count(*)::int as n
    from messages g join campaign_leads l on l.id = g.campaign_lead_id
    where g.mailbox_id in ${sql(ids)} and g.direction = 'out' and g.at > ${since}
    group by g.mailbox_id, l.domain`;
  return rows.map((r) => ({
    id: r.id,
    capacity: Math.min(mailboxCapacity({ dailyCap: r.daily_cap, warm: r.warm, rampStartedAt: r.ramp_started_at }, r.sent, now), r.pool_left ?? Infinity),
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
  next_send_at: Date;
  steps: CampaignStep[];
  schedule: CampaignSchedule;
  global_suppressed: boolean;
  own_suppressed: boolean;
  /** The campaign product's domain, else the site profile's, for a signature the mailbox does not set. */
  site_domain: string | null;
}

/** A lead taken off the queue with its messages row written, ready for SMTP. */
interface Claim {
  lead: LockedLead;
  mailbox: MailboxRow;
  creds: MailboxCredentials;
  mail: OutgoingMail;
  /** The messages row, also the unsubscribe token's id. */
  rowId: string;
}

async function sendOne(deps: SendDeps, leadId: string, mailboxId: string, now: Date): Promise<Outcome> {
  const claim = await deps.sql.begin((tx) => claimLead(deps, tx, leadId, mailboxId, now));
  if (typeof claim === 'string') return claim;

  const transport = deps.transport(claim.creds);
  let sent: SendResult;
  try {
    sent = await transport.send(claim.mail);
  } catch (err) {
    sent = { ok: false, kind: 'temporary', response: err instanceof Error ? err.message : String(err) };
  } finally {
    await transport.close().catch(() => {});
  }

  // A failure here leaves the claim open, and expireClaims marks it.
  return deps.sql.begin((tx) => confirm(deps, tx, claim, sent, now));
}

async function claimLead(deps: SendDeps, tx: TransactionSql, leadId: string, mailboxId: string, now: Date): Promise<Claim | Outcome> {
  // The mailbox first: one claim per mailbox at a time, across workers.
  const [mailbox] = await tx<MailboxRow[]>`
    select * from mailboxes where id = ${mailboxId} and status = 'active' and clerk_user_id in ${tx(deps.users)} for update skip locked`;
  if (!mailbox) return 'skipped';
  if (mailbox.last_send_at && now.getTime() - mailbox.last_send_at.getTime() < MIN_GAP_MS) return 'skipped';
  const [count] = await tx<{ sent: number }[]>`
    select count(*)::int as sent from messages
    where mailbox_id = ${mailboxId} and direction = 'out' and at > ${new Date(now.getTime() - DAY_MS)}`;
  const ramp = { dailyCap: mailbox.daily_cap, warm: mailbox.warm, rampStartedAt: mailbox.ramp_started_at };
  if (mailboxCapacity(ramp, count?.sent ?? 0, now) <= 0) return 'skipped';
  if (mailbox.pool) {
    // The pool row is the lock that keeps two mailboxes of one organization from both taking its last send.
    const [pool] = await tx<{ daily_cap: number }[]>`
      select daily_cap from send_pools where clerk_user_id = ${mailbox.clerk_user_id} and name = ${mailbox.pool} for update`;
    if (pool) {
      const [used] = await tx<{ n: number }[]>`
        select count(*)::int as n from messages g join mailboxes o on o.id = g.mailbox_id
        where o.clerk_user_id = ${mailbox.clerk_user_id} and o.pool = ${mailbox.pool} and g.direction = 'out'
          and g.at > ${new Date(now.getTime() - DAY_MS)}`;
      if ((used?.n ?? 0) >= pool.daily_cap) return 'skipped';
    }
  }

  const [lead] = await tx<LockedLead[]>`
    select l.id, l.campaign_id, l.clerk_user_id, l.address, l.domain, l.country, l.timezone,
      l.next_step, l.next_send_at, c.steps, c.schedule,
      ${suppressedSql(tx, 'l.address')} as global_suppressed,
      ${sendSuppressedSql(tx, 'l.clerk_user_id', 'l.address', 'l.domain', tx`coalesce(c.product ->> 'domain', '')`)} as own_suppressed,
      coalesce(c.product ->> 'domain', (select sp.domain from site_profiles sp where sp.clerk_user_id = l.clerk_user_id)) as site_domain
    from campaign_leads l join campaigns c on c.id = l.campaign_id
    where l.id = ${leadId} and l.mailbox_id = ${mailboxId}
      and l.status in ('queued', 'active') and l.claimed_at is null and l.next_send_at <= ${now}
      and c.status in ('scheduled', 'sending') and (c.review_until is null or c.review_until <= ${now})
      and c.clerk_user_id in ${tx(deps.users)}
    for update of l skip locked`;
  if (!lead) return 'skipped';

  if (lead.global_suppressed || lead.own_suppressed) return stop(tx, lead, 'suppressed', now);
  if (isBlockedCountry(lead.country)) return stop(tx, lead, 'country', now);
  if (!inWindow(now, lead.timezone, lead.schedule)) {
    await tx`update campaign_leads set next_send_at = ${nextSendAt({ after: now, timezone: lead.timezone, schedule: lead.schedule })} where id = ${lead.id}`;
    return 'deferred';
  }
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
    text: withFooter(written.body, {
      signature: mailbox.signature,
      displayName: mailbox.display_name,
      siteDomain: lead.site_domain,
      domain: lead.domain,
      leadKey: lead.id,
      unsubscribeUrl: url,
    }),
    messageId: `<${randomUUID()}@${senderDomain}>`,
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
  if (earlier.length > 0) {
    mail.inReplyTo = earlier[earlier.length - 1]!.message_id;
    mail.references = earlier.map((m) => m.message_id);
  }

  // Written before the send: the row counts against the mailbox's capacity,
  // and a reply to the Message-ID finds its lead even if the confirm never comes.
  await tx`
    insert into messages (id, clerk_user_id, mailbox_id, campaign_id, campaign_lead_id, direction, kind,
      message_id, in_reply_to, subject, from_address, to_address, step, at)
    values (${rowId}, ${lead.clerk_user_id}, ${mailboxId}, ${lead.campaign_id}, ${lead.id}, 'out', 'step',
      ${mail.messageId}, ${mail.inReplyTo ?? null}, ${mail.subject}, ${mailbox.address}, ${lead.address},
      ${lead.next_step}, ${now})`;
  await tx`update campaign_leads set claimed_at = ${now}, next_send_at = null where id = ${lead.id}`;
  await tx`update mailboxes set last_send_at = ${now} where id = ${mailboxId}`;
  return { lead, mailbox, creds, mail, rowId };
}

/** Whether a failed send may still have reached the server: no 4xx reply, and not refused before DATA. */
export function mayHaveSent(result: SendResult): boolean {
  if (result.ok || result.kind !== 'temporary') return false;
  return !/^\s*4\d\d\b/.test(result.response) && !BEFORE_DATA.test(result.response);
}

async function confirm(deps: SendDeps, tx: TransactionSql, claim: Claim, sent: SendResult, now: Date): Promise<Outcome> {
  const { lead, mailbox, mail, rowId } = claim;
  const mailboxId = mailbox.id;

  if (!sent.ok && mayHaveSent(sent)) {
    deps.log.error({ leadId: lead.id, mailboxId, response: sent.response }, 'send unconfirmed: it may have gone out, so it is not sent again');
    await tx`update messages set smtp_response = ${`unconfirmed ${sent.response}`.slice(0, 500)} where id = ${rowId}`;
    await tx`
      update campaign_leads set claimed_at = null, next_send_at = null,
        skip_reason = case when status in ('queued', 'active') then 'unconfirmed' else skip_reason end,
        status = case when status in ('queued', 'active') then 'failed' else status end
      where id = ${lead.id}`;
    await finishIfDone(tx, lead.campaign_id, now);
    return 'unconfirmed';
  }

  if (!sent.ok) {
    deps.log.warn({ leadId: lead.id, mailboxId, kind: sent.kind, response: sent.response }, 'send refused');
    // Refused, so nothing went: the claimed row goes and the lead is released.
    await tx`delete from messages where id = ${rowId}`;
    if (sent.kind === 'auth') {
      // The lead keeps its place and goes out once the mailbox is fixed.
      await release(tx, lead.id, lead.next_send_at);
      await authFailed(tx, mailboxId, sent.response);
      return 'skipped';
    }
    if (sent.kind === 'temporary') {
      await release(tx, lead.id, retryAt(now, lead.timezone, lead.schedule));
      return 'retried';
    }
    // A 5xx for this recipient is a hard bounce, as if the report had come
    // back. A 5.7.x is the server blocking us: the lead stops, the address stays.
    await release(tx, lead.id, null);
    const blocked = isPolicyBlock(sent.response);
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
      smtpResponse: `${blocked ? 'soft' : 'hard'} ${sent.response}`.slice(0, 500),
      at: now,
    });
    if (blocked) {
      await tx`update campaign_leads set status = 'failed', skip_reason = 'blocked', next_send_at = null where id = ${lead.id}`;
      await finishIfDone(tx, lead.campaign_id, now);
    } else {
      await endLead(tx, lead.id, 'bounced', now);
    }
    await checkHealth(tx, mailboxId, now);
    return 'bounced';
  }

  await tx`update messages set smtp_response = ${sent.response.slice(0, 500)} where id = ${rowId}`;
  await tx`
    insert into send_usage (clerk_user_id, period, sent) values (${lead.clerk_user_id}, ${now.toISOString().slice(0, 7)}, 1)
    on conflict (clerk_user_id, period) do update set sent = send_usage.sent + 1`;
  await tx`
    update campaigns set sent = sent + 1,
      status = case when status = 'scheduled' then 'sending' else status end,
      started_at = coalesce(started_at, ${now})
    where id = ${lead.campaign_id}`;
  await tx`
    update campaign_leads set claimed_at = null, thread_message_id = coalesce(thread_message_id, ${mail.messageId})
    where id = ${lead.id}`;

  // The lead moves on unless a reply or a stop came in meanwhile. A claim
  // marked unconfirmed by a slow send that did go through is taken back.
  const open = tx`(status in ('queued', 'active') or (status = 'failed' and skip_reason = 'unconfirmed'))`;
  // steps is 0-based, next_step 1-based: this is the step after the one just sent.
  const following = lead.steps[lead.next_step];
  if (following) {
    const at = stepSendAt({ prevSentAt: now, waitDays: following.waitDays, timezone: lead.timezone, schedule: lead.schedule });
    await tx`
      update campaign_leads set status = 'active', skip_reason = null, next_step = ${lead.next_step + 1}, next_send_at = ${at}
      where id = ${lead.id} and ${open}`;
  } else {
    await tx`
      update campaign_leads set status = 'done', skip_reason = null, next_send_at = null
      where id = ${lead.id} and ${open}`;
    await finishIfDone(tx, lead.campaign_id, now);
  }
  return 'sent';
}

/** Ends the claim; a lead still on the queue gets `nextAt`. */
async function release(tx: Db, leadId: string, nextAt: Date | null): Promise<void> {
  await tx`
    update campaign_leads set claimed_at = null,
      next_send_at = case when status in ('queued', 'active') then ${nextAt}::timestamptz else next_send_at end
    where id = ${leadId}`;
}

/** RETRY_MS from now, or the next open window when that falls outside working hours. */
export function retryAt(now: Date, timezone: string, schedule: CampaignSchedule): Date {
  const at = new Date(now.getTime() + RETRY_MS);
  return inWindow(at, timezone, schedule) ? at : nextSendAt({ after: at, timezone, schedule });
}

/** Sends a pool still has in the 24 hours since `since`, per mailbox row `m`. Null when `m` is in no pool. */
function poolLeftSql(sql: Sql, since: Date) {
  return sql`(
    select p.daily_cap - (
      select count(*)::int from messages g join mailboxes o on o.id = g.mailbox_id
      where o.clerk_user_id = p.clerk_user_id and o.pool = p.name and g.direction = 'out' and g.at > ${since}
    )
    from send_pools p where p.clerk_user_id = m.clerk_user_id and p.name = m.pool
  )`;
}

interface RecheckLead {
  id: string;
  domain: string;
  timezone: string;
  written_at: Date | null;
  schedule: CampaignSchedule;
}

/** A site that did not answer is asked again this much later, inside working hours. */
export const UNREACHABLE_RETRY_MS = 6 * 3_600_000;
/** A site still silent this long after the lead was written stops it. */
export const UNREACHABLE_GIVE_UP_MS = 3 * DAY_MS;

/**
 * What a recheck that found no problem does to a lead not claimed yet. Fixed
 * ('resolved'): it stops. No answer: tried again later, and stopped as
 * 'unreachable' only once the site has been silent for a while after the
 * lead was written, since one network blip should not end it. A lead
 * claimed or ended meanwhile stays as it is.
 */
async function afterRecheck(sql: Sql, lead: RecheckLead, seen: Exclude<RecheckResult, 'problem'>, now: Date): Promise<Outcome> {
  const writtenAt = lead.written_at?.getTime() ?? now.getTime();
  if (seen === 'unreachable' && now.getTime() - writtenAt < UNREACHABLE_GIVE_UP_MS) {
    const at = nextSendAt({ after: new Date(now.getTime() + UNREACHABLE_RETRY_MS), timezone: lead.timezone, schedule: lead.schedule });
    const moved = await sql`
      update campaign_leads set next_send_at = ${at}
      where id = ${lead.id} and status in ('queued', 'active') and claimed_at is null`;
    return moved.count > 0 ? 'deferred' : 'skipped';
  }
  const [row] = await sql<{ campaign_id: string }[]>`
    update campaign_leads set status = 'stopped', skip_reason = ${seen}, next_send_at = null
    where id = ${lead.id} and status in ('queued', 'active') and claimed_at is null
    returning campaign_id`;
  if (!row) return 'skipped';
  await finishIfDone(sql, row.campaign_id, now);
  return 'stopped';
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
