// The reads behind the Replies inbox and GET /v1/sending (docs/sending/plan.md,
// "API"). Replies are the human answers the poller matched to a lead;
// bounces and auto replies are handled by outcomes.ts and stay out of here.

import type { Sql } from 'postgres';
import type { Reply, ReplyListQuery, ReplyListResponse, SendingSummary } from '@nvoke/shared';
import { decodeCursor, encodeCursor } from '../leads/repo.js';
import { periodOf } from '../leads/plans.js';
import { listMailboxes } from './mailboxes.js';

interface ReplyRow {
  id: string;
  mailbox_id: string | null;
  campaign_id: string | null;
  campaign_lead_id: string | null;
  direction: 'out' | 'in';
  kind: Reply['kind'];
  subject: string;
  from_address: string;
  to_address: string;
  body_text: string | null;
  step: number | null;
  read_at: Date | null;
  at: Date;
  at_text: string;
  campaign_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}

function toReply(r: ReplyRow): Reply {
  const leadName = [r.first_name, r.last_name].filter(Boolean).join(' ');
  return {
    id: r.id,
    mailboxId: r.mailbox_id,
    campaignId: r.campaign_id,
    campaignLeadId: r.campaign_lead_id,
    direction: r.direction,
    kind: r.kind,
    subject: r.subject,
    fromAddress: r.from_address,
    toAddress: r.to_address,
    bodyText: r.body_text,
    step: r.step,
    readAt: r.read_at?.toISOString() ?? null,
    at: r.at.toISOString(),
    campaignName: r.campaign_name,
    leadName: leadName || null,
    companyName: r.company_name,
  };
}

/** The user's replies, newest first. Null for a cursor that does not decode. */
export async function listReplies(sql: Sql, userId: string, query: ReplyListQuery): Promise<ReplyListResponse | null> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) return null;
  const rows = await sql<ReplyRow[]>`
    select m.id, m.mailbox_id, m.campaign_id, m.campaign_lead_id, m.direction, m.kind, m.subject,
           m.from_address, m.to_address, m.body_text, m.step, m.read_at, m.at, m.at::text as at_text,
           c.name as campaign_name, l.first_name, l.last_name, l.company_name
    from messages m
    left join campaigns c on c.id = m.campaign_id
    left join campaign_leads l on l.id = m.campaign_lead_id
    where m.clerk_user_id = ${userId} and m.direction = 'in' and m.kind = 'reply'
      ${query.unread ? sql`and m.read_at is null` : sql``}
      ${cursor ? sql`and (m.at, m.id) < (${cursor.createdAt}::text::timestamptz, ${cursor.id}::uuid)` : sql``}
    order by m.at desc, m.id desc
    limit ${query.limit + 1}
  `;
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    replies: page.map(toReply),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.at_text, last.id) : null,
  };
}

/** Marks one of the user's incoming messages read. False when it is not theirs. */
export async function markReplyRead(sql: Sql, userId: string, id: string, now: Date = new Date()): Promise<boolean> {
  const rows = await sql`
    update messages set read_at = coalesce(read_at, ${now})
    where id = ${id} and clerk_user_id = ${userId} and direction = 'in'
    returning id
  `;
  return rows.length > 0;
}

/** GET /v1/sending. `available` comes from the server's config, the rest from the user's rows. */
export async function sendingSummary(sql: Sql, userId: string, available: boolean, now: Date = new Date()): Promise<SendingSummary> {
  const period = periodOf(now);
  const [usage] = await sql<{ sent: number }[]>`
    select sent from send_usage where clerk_user_id = ${userId} and period = ${period}
  `;
  const [unread] = await sql<{ n: number }[]>`
    select count(*)::int as n from messages
    where clerk_user_id = ${userId} and direction = 'in' and kind = 'reply' and read_at is null
  `;
  const active = (await listMailboxes(sql, userId, now)).filter((m) => m.status === 'active');
  return {
    available,
    period,
    sentThisPeriod: usage?.sent ?? 0,
    mailboxesActive: active.length,
    capacityToday: active.reduce((sum, m) => sum + m.capacityToday, 0),
    repliesUnread: unread?.n ?? 0,
  };
}
