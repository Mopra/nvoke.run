// Campaigns (docs/sending/plan.md): a source of leads, a short sequence that
// Claude writes per lead, the mailboxes it leaves from and the recipients'
// working hours. A campaign is created as a draft, enrolls its first leads,
// is written ('writing'), waits for a person ('review'), and is started once
// from the web app ('scheduled', then 'sending'). An autopilot campaign
// keeps enrolling from its search or drop after that start (enroll.ts).

import type { Sql, TransactionSql } from 'postgres';
import {
  DEFAULT_SCHEDULE,
  MAX_CAMPAIGNS,
  REVIEW_MINUTES,
  stepProblems,
  type Campaign,
  type CampaignLead,
  type CampaignLeadDetail,
  type CampaignLeadListResponse,
  type CampaignLeadStatus,
  type CampaignProduct,
  type CampaignSchedule,
  type CampaignStep,
  type CreateCampaignRequest,
  type Message,
  type RetryLeadsResponse,
  type UpdateCampaignRequest,
  type UpdateWrittenStepRequest,
  type WrittenStep,
} from '@nvoke/shared';
import { decodeCursor, encodeCursor } from '../leads/repo.js';
import { enrollCampaign, queueWrites } from './enroll.js';
import { nextSendAt } from './schedule.js';
import { rerenderTemplates } from './template.js';

type Db = Sql | TransactionSql;

export type CampaignErrorCode = 'too_many_campaigns' | 'not_found' | 'bad_mailbox' | 'no_leads' | 'bad_state' | 'bad_steps';

export class CampaignError extends Error {
  constructor(
    readonly code: CampaignErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CampaignError';
  }
}

export interface CampaignRow {
  id: string;
  clerk_user_id: string;
  name: string;
  status: Campaign['status'];
  source: Campaign['source'];
  search_id: string | null;
  drop_id: string | null;
  autopilot: boolean;
  people_only: boolean;
  allow_catch_all: boolean;
  per_company: number;
  daily_new: number;
  hold_hours: number;
  steps: CampaignStep[];
  schedule: CampaignSchedule;
  product: CampaignProduct | null;
  footer: string | null;
  writer: Campaign['writer'];
  signed: boolean;
  review_until: Date | null;
  leads: number;
  sent: number;
  replied: number;
  bounced: number;
  opted_out: number;
  enrolled_at: Date | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

/** The campaigns columns, for a query on `campaigns c`. */
export const CAMPAIGN_COLUMNS = `c.id, c.clerk_user_id, c.name, c.status, c.source, c.search_id, c.drop_id, c.autopilot,
  c.people_only, c.allow_catch_all, c.per_company, c.daily_new, c.hold_hours, c.steps, c.schedule, c.product, c.footer, c.writer, c.signed, c.review_until,
  c.leads, c.sent, c.replied, c.bounced, c.opted_out, c.enrolled_at, c.created_at, c.started_at, c.finished_at`;

interface CampaignView extends CampaignRow {
  mailbox_ids: string[];
  writing: number;
  skipped: Record<string, number>;
  failed: Record<string, number>;
  write_error: string | null;
}

const VIEW_COLUMNS = `${CAMPAIGN_COLUMNS},
  coalesce((select array_agg(cm.mailbox_id::text order by cm.mailbox_id) from campaign_mailboxes cm where cm.campaign_id = c.id), '{}') as mailbox_ids,
  (select count(*)::int from campaign_leads l where l.campaign_id = c.id and l.status = 'writing') as writing,
  coalesce((
    select jsonb_object_agg(reason, n) from (
      select coalesce(l.skip_reason, 'other') as reason, count(*)::int as n
      from campaign_leads l where l.campaign_id = c.id and l.status = 'skipped' group by 1
    ) s
  ), '{}'::jsonb) as skipped,
  coalesce((
    select jsonb_object_agg(reason, n) from (
      select coalesce(l.skip_reason, 'other') as reason, count(*)::int as n
      from campaign_leads l where l.campaign_id = c.id and l.status = 'failed' group by 1
    ) f
  ), '{}'::jsonb) as failed,
  (select l.write_error from campaign_leads l
    where l.campaign_id = c.id and l.status = 'failed' and l.write_error is not null
    order by l.created_at desc, l.id desc limit 1) as write_error`;

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

function toCampaign(r: CampaignView): Campaign {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    source: r.source,
    searchId: r.search_id,
    dropId: r.drop_id,
    autopilot: r.autopilot,
    peopleOnly: r.people_only,
    allowCatchAll: r.allow_catch_all,
    perCompany: r.per_company,
    dailyNew: r.daily_new,
    holdHours: r.hold_hours,
    steps: r.steps,
    schedule: r.schedule,
    product: r.product,
    footer: r.footer,
    writer: r.writer,
    signed: r.signed,
    mailboxIds: r.mailbox_ids,
    reviewUntil: iso(r.review_until),
    leads: r.leads,
    sent: r.sent,
    replied: r.replied,
    bounced: r.bounced,
    optedOut: r.opted_out,
    writing: r.writing,
    skipped: r.skipped,
    failed: r.failed,
    writeError: r.write_error,
    createdAt: r.created_at.toISOString(),
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
  };
}

export async function getCampaign(sql: Db, userId: string, id: string): Promise<Campaign | null> {
  const [row] = await sql<CampaignView[]>`
    select ${sql.unsafe(VIEW_COLUMNS)} from campaigns c where c.id = ${id} and c.clerk_user_id = ${userId}
  `;
  return row ? toCampaign(row) : null;
}

export async function listCampaigns(sql: Db, userId: string): Promise<Campaign[]> {
  const rows = await sql<CampaignView[]>`
    select ${sql.unsafe(VIEW_COLUMNS)} from campaigns c where c.clerk_user_id = ${userId} order by c.created_at desc
  `;
  return rows.map(toCampaign);
}

/** The campaign row, locked for the rest of the transaction. */
async function lockCampaign(tx: Db, userId: string, id: string): Promise<CampaignRow | null> {
  const [row] = await tx<CampaignRow[]>`
    select ${tx.unsafe(CAMPAIGN_COLUMNS)} from campaigns c where c.id = ${id} and c.clerk_user_id = ${userId} for update
  `;
  return row ?? null;
}

async function checkMailboxes(tx: Db, userId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  const owned = await tx`select id from mailboxes where clerk_user_id = ${userId} and id in ${tx(unique)}`;
  if (owned.length !== unique.length) throw new CampaignError('bad_mailbox', 'A mailbox is not yours or no longer exists.');
  return unique;
}

/**
 * Creates a campaign and enrolls its first leads, which queues their write
 * jobs. A list campaign with nobody to write to is refused; an autopilot
 * campaign may start empty and fill from its source after the start.
 */
export async function createCampaign(sql: Sql, userId: string, req: CreateCampaignRequest, now: Date = new Date()): Promise<Campaign> {
  const id = await sql.begin(async (tx) => {
    const [count] = await tx<{ n: number }[]>`
      select count(*)::int as n from campaigns where clerk_user_id = ${userId} and status <> 'canceled'
    `;
    if ((count?.n ?? 0) >= MAX_CAMPAIGNS) throw new CampaignError('too_many_campaigns', `You can keep up to ${MAX_CAMPAIGNS} campaigns.`);
    const mailboxIds = await checkMailboxes(tx, userId, req.mailboxIds);
    const source = req.source;
    const searchId = source === 'drop' ? null : (req.searchId ?? null);
    const dropId = source === 'drop' ? (req.dropId ?? null) : null;
    if (searchId) {
      const [s] = await tx`select 1 from searches where id = ${searchId} and clerk_user_id = ${userId}`;
      if (!s) throw new CampaignError('not_found', 'Search not found.');
    }
    if (dropId) {
      const [d] = await tx`select 1 from drops where id = ${dropId} and clerk_user_id = ${userId}`;
      if (!d) throw new CampaignError('not_found', 'Drop not found.');
    }

    const [row] = await tx<CampaignRow[]>`
      insert into campaigns ${tx({
        clerk_user_id: userId,
        name: req.name,
        status: 'draft',
        source,
        search_id: searchId,
        drop_id: dropId,
        autopilot: source !== 'list',
        people_only: req.peopleOnly ?? true,
        allow_catch_all: req.allowCatchAll ?? false,
        per_company: req.perCompany ?? 1,
        daily_new: req.dailyNew ?? 30,
        hold_hours: req.holdHours ?? 2,
        steps: tx.json(req.steps),
        schedule: tx.json(req.schedule ?? DEFAULT_SCHEDULE),
        product: req.product ? tx.json(req.product) : null,
        footer: req.footer ?? null,
        writer: req.writer ?? 'claude',
        signed: req.signed ?? true,
        created_at: now,
      })}
      returning ${tx.unsafe(CAMPAIGN_COLUMNS.replace(/\bc\./g, ''))}
    `;
    const c = row!;
    await tx`insert into campaign_mailboxes ${tx(mailboxIds.map((m) => ({ campaign_id: c.id, mailbox_id: m })))}`;

    // The owner waits for this first batch, so it is written now, however small.
    const res = await enrollCampaign(tx, c, now, { emailIds: source === 'list' ? req.emailIds : undefined, force: true });
    if (source === 'list' && res.enrolled === 0) {
      throw new CampaignError('no_leads', 'None of these leads can be written to: they are not valid yet, suppressed, contacted before or in a blocked country.');
    }
    await tx`update campaigns set status = ${res.enrolled > 0 ? 'writing' : 'review'} where id = ${c.id}`;
    return c.id;
  });
  return (await getCampaign(sql, userId, id))!;
}

/** Changes apply to leads written from now on. A done or canceled campaign stays as it is. */
export async function updateCampaign(sql: Sql, userId: string, id: string, req: UpdateCampaignRequest): Promise<Campaign | null> {
  const found = await sql.begin(async (tx) => {
    const c = await lockCampaign(tx, userId, id);
    if (!c) return false;
    if (c.status === 'done' || c.status === 'canceled') throw new CampaignError('bad_state', 'This campaign has ended.');
    const patch: Record<string, unknown> = {};
    if (req.name !== undefined) patch.name = req.name;
    if (req.steps !== undefined) {
      const problem = stepProblems(c.writer, req.steps)[0];
      if (problem) throw new CampaignError('bad_steps', `Step ${Number(problem.path[1]) + 1}: ${problem.message}.`);
      patch.steps = tx.json(req.steps);
    }
    if (req.schedule !== undefined) patch.schedule = tx.json(req.schedule);
    if (req.peopleOnly !== undefined) patch.people_only = req.peopleOnly;
    if (req.allowCatchAll !== undefined) patch.allow_catch_all = req.allowCatchAll;
    if (req.perCompany !== undefined) patch.per_company = req.perCompany;
    if (req.dailyNew !== undefined) patch.daily_new = req.dailyNew;
    if (req.holdHours !== undefined) patch.hold_hours = req.holdHours;
    if (req.product !== undefined) patch.product = req.product ? tx.json(req.product) : null;
    if (req.footer !== undefined) patch.footer = req.footer;
    if (req.signed !== undefined) patch.signed = req.signed;
    if (Object.keys(patch).length) await tx`update campaigns set ${tx(patch)} where id = ${id}`;
    if (req.mailboxIds) {
      const ids = await checkMailboxes(tx, userId, req.mailboxIds);
      await tx`delete from campaign_mailboxes where campaign_id = ${id} and mailbox_id not in ${tx(ids)}`;
      await tx`insert into campaign_mailboxes ${tx(ids.map((m) => ({ campaign_id: id, mailbox_id: m })))} on conflict do nothing`;
      // Leads that have not sent yet move off a removed mailbox; a running thread stays where it is.
      const orphans = await tx<{ id: string }[]>`
        select id from campaign_leads
        where campaign_id = ${id} and status in ('writing', 'queued') and next_step = 1
          and (mailbox_id is null or mailbox_id not in ${tx(ids)})
        order by id
      `;
      for (let i = 0; i < orphans.length; i++) {
        await tx`update campaign_leads set mailbox_id = ${ids[i % ids.length]!} where id = ${orphans[i]!.id}`;
      }
    }
    // A template campaign's unsent emails follow its new text and senders.
    if (req.steps || req.mailboxIds) await rerenderTemplates(tx, { id, steps: req.steps ?? c.steps, writer: c.writer });
    return true;
  });
  return found ? getCampaign(sql, userId, id) : null;
}

export async function deleteCampaign(sql: Db, userId: string, id: string): Promise<boolean> {
  const rows = await sql`delete from campaigns where id = ${id} and clerk_user_id = ${userId} returning id`;
  return rows.length > 0;
}

/** When a written lead may go out first: after the review window and after its hold. */
export function firstSendAfter(c: Pick<CampaignRow, 'review_until' | 'hold_hours'>, writtenAt: Date): Date {
  const hold = writtenAt.getTime() + c.hold_hours * 3_600_000;
  return new Date(Math.max(hold, c.review_until?.getTime() ?? 0));
}

/**
 * Sets send times. 'start': every written lead that has not sent, after the
 * review window and its hold. 'resume': every send that fell due while the
 * campaign was paused, from now on, so it still lands in working hours.
 */
async function reschedule(tx: Db, c: CampaignRow, mode: 'start' | 'resume', now: Date): Promise<void> {
  const leads = await tx<{ id: string; timezone: string; written_at: Date | null }[]>`
    select id, timezone, written_at from campaign_leads
    where campaign_id = ${c.id}
      and ${mode === 'start' ? tx`status = 'queued' and next_step = 1` : tx`status in ('queued', 'active') and next_send_at < ${now}`}
  `;
  if (leads.length === 0) return;
  const ats = leads.map((l) => {
    const after = mode === 'start' ? firstSendAfter(c, l.written_at ?? now) : now;
    return nextSendAt({ after, timezone: l.timezone, schedule: c.schedule }).toISOString();
  });
  await tx`
    update campaign_leads l set next_send_at = v.at
    from (select unnest(${leads.map((l) => l.id)}::uuid[]) as id, unnest(${ats}::timestamptz[]) as at) v
    where l.id = v.id
  `;
}

/**
 * The one start by a person. Opens the review window (REVIEW_MINUTES) and
 * gives every written lead its first send time after it and after its hold.
 */
export async function startCampaign(sql: Sql, userId: string, id: string, now: Date = new Date()): Promise<Campaign | null> {
  const found = await sql.begin(async (tx) => {
    const c = await lockCampaign(tx, userId, id);
    if (!c) return false;
    if (c.status !== 'review') {
      throw new CampaignError('bad_state', c.status === 'writing' ? 'Claude is still writing. Start once every email is written.' : `A ${c.status} campaign cannot be started.`);
    }
    const reviewUntil = new Date(now.getTime() + REVIEW_MINUTES * 60_000);
    await tx`
      update campaigns set status = 'scheduled', review_until = ${reviewUntil}, started_at = ${now}, enrolled_at = ${now}
      where id = ${id}
    `;
    await reschedule(tx, { ...c, review_until: reviewUntil }, 'start', now);
    return true;
  });
  return found ? getCampaign(sql, userId, id) : null;
}

/** Stops sending and enrolling until resumed. */
export async function pauseCampaign(sql: Sql, userId: string, id: string): Promise<Campaign | null> {
  const found = await sql.begin(async (tx) => {
    const c = await lockCampaign(tx, userId, id);
    if (!c) return false;
    if (c.status === 'paused') return true;
    if (c.status !== 'scheduled' && c.status !== 'sending') throw new CampaignError('bad_state', `A ${c.status} campaign cannot be paused.`);
    await tx`update campaigns set status = 'paused' where id = ${id}`;
    return true;
  });
  return found ? getCampaign(sql, userId, id) : null;
}

/** Picks up where the pause left off. Sends that fell due during the pause move into the next working hours. */
export async function resumeCampaign(sql: Sql, userId: string, id: string, now: Date = new Date()): Promise<Campaign | null> {
  const found = await sql.begin(async (tx) => {
    const c = await lockCampaign(tx, userId, id);
    if (!c) return false;
    if (c.status !== 'paused' || !c.started_at) throw new CampaignError('bad_state', `A ${c.status} campaign cannot be resumed.`);
    await tx`update campaigns set status = ${c.sent > 0 ? 'sending' : 'scheduled'} where id = ${id}`;
    await reschedule(tx, c, 'resume', now);
    return true;
  });
  return found ? getCampaign(sql, userId, id) : null;
}

// Leads

interface LeadRow {
  id: string;
  address: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string;
  domain: string;
  country: string | null;
  timezone: string;
  mailbox_id: string | null;
  status: CampaignLeadStatus;
  skip_reason: string | null;
  write_error: string | null;
  next_step: number;
  next_send_at: Date | null;
  created_at: Date;
  created_at_text: string;
}

const LEAD_COLUMNS = `l.id, l.address, l.first_name, l.last_name, l.title, l.company_name, l.domain, l.country, l.timezone,
  l.mailbox_id, l.status, l.skip_reason, l.write_error, l.next_step, l.next_send_at, l.created_at, l.created_at::text as created_at_text`;

function toLead(r: LeadRow): CampaignLead {
  return {
    id: r.id,
    address: r.address,
    firstName: r.first_name,
    lastName: r.last_name,
    title: r.title,
    companyName: r.company_name,
    domain: r.domain,
    country: r.country,
    timezone: r.timezone,
    mailboxId: r.mailbox_id,
    status: r.status,
    skipReason: r.skip_reason,
    writeError: r.write_error,
    nextStep: r.next_step,
    nextSendAt: iso(r.next_send_at),
    createdAt: r.created_at.toISOString(),
  };
}

export interface LeadListQuery {
  status?: CampaignLeadStatus;
  cursor?: string;
  limit?: number;
}

/**
 * A campaign's leads, oldest first, a page at a time. Skipped leads show
 * only when asked for with status 'skipped'. Null when the campaign is not
 * the user's or the cursor is not one of ours.
 */
export async function listCampaignLeads(sql: Db, userId: string, id: string, q: LeadListQuery = {}): Promise<CampaignLeadListResponse | null> {
  const [c] = await sql`select 1 from campaigns where id = ${id} and clerk_user_id = ${userId}`;
  if (!c) return null;
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.cursor && !cursor) return null;
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const rows = await sql<LeadRow[]>`
    select ${sql.unsafe(LEAD_COLUMNS)} from campaign_leads l
    where l.campaign_id = ${id}
      and ${q.status ? sql`l.status = ${q.status}` : sql`l.status <> 'skipped'`}
      ${cursor ? sql`and (l.created_at, l.id) > (${cursor.createdAt}::text::timestamptz, ${cursor.id}::uuid)` : sql``}
    order by l.created_at, l.id
    limit ${limit + 1}
  `;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    leads: page.map(toLead),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at_text, last.id) : null,
  };
}

async function findLead(sql: Db, userId: string, id: string, leadId: string): Promise<LeadRow | null> {
  const [row] = await sql<LeadRow[]>`
    select ${sql.unsafe(LEAD_COLUMNS)} from campaign_leads l
    where l.id = ${leadId} and l.campaign_id = ${id} and l.clerk_user_id = ${userId}
  `;
  return row ?? null;
}

interface MessageRow {
  id: string;
  mailbox_id: string | null;
  campaign_id: string | null;
  campaign_lead_id: string | null;
  direction: 'out' | 'in';
  kind: Message['kind'];
  subject: string;
  from_address: string;
  to_address: string;
  body_text: string | null;
  step: number | null;
  read_at: Date | null;
  at: Date;
}

/** One lead with the emails written for it and every message of its thread. */
export async function getCampaignLead(sql: Db, userId: string, id: string, leadId: string): Promise<CampaignLeadDetail | null> {
  const lead = await findLead(sql, userId, id, leadId);
  if (!lead) return null;
  const messages = await sql<MessageRow[]>`
    select id, mailbox_id, campaign_id, campaign_lead_id, direction, kind, subject, from_address, to_address,
      body_text, step, read_at, at
    from messages where campaign_lead_id = ${leadId} and clerk_user_id = ${userId}
    order by at, id
  `;
  const steps = await sql<{ step: number; subject: string; body: string; edited: boolean }[]>`
    select step, subject, body, edited from campaign_steps_written where campaign_lead_id = ${leadId} order by step
  `;
  const sentAt = new Map<number, Date>();
  for (const m of messages) if (m.direction === 'out' && m.kind === 'step' && m.step && !sentAt.has(m.step)) sentAt.set(m.step, m.at);
  return {
    lead: toLead(lead),
    steps: steps.map((s) => ({ step: s.step, subject: s.subject, body: s.body, edited: s.edited, sentAt: iso(sentAt.get(s.step) ?? null) })),
    messages: messages.map((m) => ({
      id: m.id,
      mailboxId: m.mailbox_id,
      campaignId: m.campaign_id,
      campaignLeadId: m.campaign_lead_id,
      direction: m.direction,
      kind: m.kind,
      subject: m.subject,
      fromAddress: m.from_address,
      toAddress: m.to_address,
      bodyText: m.body_text,
      step: m.step,
      readAt: iso(m.read_at),
      at: m.at.toISOString(),
    })),
  };
}

/** Edits a written email before it goes out. Null when the lead or the step is not there. */
export async function updateWrittenStep(
  sql: Db,
  userId: string,
  id: string,
  leadId: string,
  step: number,
  req: UpdateWrittenStepRequest,
): Promise<WrittenStep | null> {
  const lead = await findLead(sql, userId, id, leadId);
  if (!lead) return null;
  const [sent] = await sql`
    select 1 from messages where campaign_lead_id = ${leadId} and direction = 'out' and kind = 'step' and step = ${step} limit 1
  `;
  if (sent) throw new CampaignError('bad_state', 'This email has already gone out.');
  const patch: Record<string, unknown> = { edited: true };
  if (req.subject !== undefined) patch.subject = req.subject;
  if (req.body !== undefined) patch.body = req.body;
  const [row] = await sql<{ step: number; subject: string; body: string; edited: boolean }[]>`
    update campaign_steps_written set ${sql(patch)}
    where campaign_lead_id = ${leadId} and step = ${step}
    returning step, subject, body, edited
  `;
  return row ? { ...row, sentAt: null } : null;
}

/** The skip reasons of a lead Claude did not write, which a retry writes again. */
const RETRYABLE = ['write_failed', 'too_similar'];

/**
 * Writes failed leads again in place: leads 'failed' with a write reason go
 * back to 'writing' (all of them, or `leadIds`) and get write jobs at once.
 * A campaign in review goes back to 'writing' until they are written; a
 * started one keeps sending (a done one sends again) and queues them as they
 * are written. Null when the campaign is not the user's.
 */
export async function retryFailedLeads(sql: Sql, userId: string, id: string, leadIds?: string[], now: Date = new Date()): Promise<RetryLeadsResponse | null> {
  const retried = await sql.begin(async (tx) => {
    const c = await lockCampaign(tx, userId, id);
    if (!c) return null;
    if (c.status === 'canceled') throw new CampaignError('bad_state', 'A canceled campaign cannot write again.');
    const rows = await tx`
      update campaign_leads set status = 'writing', skip_reason = null, write_error = null, write_queued_at = null
      where campaign_id = ${id} and status = 'failed' and skip_reason in ${tx(RETRYABLE)}
        ${leadIds ? tx`and id in ${tx(leadIds)}` : tx``}
      returning id
    `;
    if (rows.length === 0) return 0;
    if (c.status === 'review') await tx`update campaigns set status = 'writing' where id = ${id}`;
    // A started campaign is done once no lead is left to send, failed ones aside: it sends again.
    if (c.status === 'done') await tx`update campaigns set status = 'sending', finished_at = null where id = ${id}`;
    await queueWrites(tx, id, now, { force: true });
    return rows.length;
  });
  if (retried === null) return null;
  const campaign = await getCampaign(sql, userId, id);
  return campaign ? { retried, campaign } : null;
}

/**
 * Moves a lead nothing has gone out to yet to another of the campaign's
 * mailboxes; a template campaign renders its emails again for the new
 * sender. Null when the lead is not the user's.
 */
export async function moveLead(sql: Sql, userId: string, id: string, leadId: string, mailboxId: string): Promise<CampaignLead | null> {
  return sql.begin(async (tx) => {
    const c = await lockCampaign(tx, userId, id);
    if (!c) return null;
    const lead = await findLead(tx, userId, id, leadId);
    if (!lead) return null;
    const [own] = await tx`select 1 from campaign_mailboxes where campaign_id = ${id} and mailbox_id = ${mailboxId}`;
    if (!own) throw new CampaignError('bad_mailbox', 'That mailbox does not send for this campaign. Add it to the campaign first.');
    const [sent] = await tx`select 1 from messages where campaign_lead_id = ${leadId} and direction = 'out' limit 1`;
    const [moved] = await tx`
      update campaign_leads set mailbox_id = ${mailboxId}
      where id = ${leadId} and status in ('writing', 'queued') and next_step = 1 and claimed_at is null
      returning id
    `;
    if (sent || !moved) throw new CampaignError('bad_state', 'Only a lead nothing has gone out to yet can change mailbox.');
    await rerenderTemplates(tx, c, leadId);
    const after = await findLead(tx, userId, id, leadId);
    return after ? toLead(after) : null;
  });
}

/** Stops one lead: nothing more goes out to it. A lead that already ended stays as it is. */
export async function stopLead(sql: Db, userId: string, id: string, leadId: string): Promise<CampaignLead | null> {
  const [row] = await sql<LeadRow[]>`
    update campaign_leads l set status = 'stopped', next_send_at = null
    where l.id = ${leadId} and l.campaign_id = ${id} and l.clerk_user_id = ${userId}
      and l.status in ('writing', 'queued', 'active')
    returning ${sql.unsafe(LEAD_COLUMNS)}
  `;
  if (row) return toLead(row);
  const lead = await findLead(sql, userId, id, leadId);
  return lead ? toLead(lead) : null;
}
