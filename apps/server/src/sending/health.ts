// Mailbox health (docs/sending/plan.md, "health.ts"). A mailbox that bounces
// too much or whose login fails is paused before it burns its domain, with
// a reason the user can act on. A campaign left with no working mailbox
// pauses too, so its leads wait instead of piling up.

import type { Sql, TransactionSql } from 'postgres';

type Db = Sql | TransactionSql;

export const HEALTH = {
  windowDays: 7,
  /** Hard bounces over sends in the window that pause the mailbox. */
  maxBounceRate: 0.03,
  /** Below this many sends the rate says nothing yet. */
  minSends: 20,
} as const;

export interface HealthResult {
  paused: boolean;
  sends: number;
  hardBounces: number;
}

/**
 * Pauses the mailbox at 3% hard bounces over the last 7 days (with at least
 * 20 sends), then pauses its campaigns that have no working mailbox left.
 */
export async function checkHealth(sql: Db, mailboxId: string, now: Date = new Date()): Promise<HealthResult> {
  const since = new Date(now.getTime() - HEALTH.windowDays * 86_400_000);
  const [row] = await sql<{ sends: number; hard: number }[]>`
    select
      (select count(*)::int from messages
        where mailbox_id = ${mailboxId} and direction = 'out' and kind = 'step' and at > ${since}) as sends,
      (select count(*)::int from messages
        where mailbox_id = ${mailboxId} and direction = 'in' and kind = 'bounce'
          and smtp_response like 'hard%' and at > ${since}) as hard`;
  const sends = row?.sends ?? 0;
  const hardBounces = row?.hard ?? 0;
  let paused = false;
  if (sends >= HEALTH.minSends && hardBounces / sends >= HEALTH.maxBounceRate) {
    const pct = Math.round((hardBounces / sends) * 1000) / 10;
    paused = await pauseMailbox(
      sql,
      mailboxId,
      `Paused: ${hardBounces} of the last ${sends} emails bounced (${pct}%). Check the leads' verification before you resume.`,
    );
  }
  return { paused, sends, hardBounces };
}

/** The provider refused the login while sending. */
export async function authFailed(sql: Db, mailboxId: string, response: string): Promise<boolean> {
  const detail = response.trim().slice(0, 200);
  const [box] = await sql<{ provider: string }[]>`select provider from mailboxes where id = ${mailboxId}`;
  if (box?.provider === 'microsoft') {
    return pauseMailbox(sql, mailboxId, `Paused: Microsoft refused the sign-in${detail ? ` (${detail})` : ''}. Sign in with Microsoft again to resume.`);
  }
  return pauseMailbox(
    sql,
    mailboxId,
    `Paused: the mail server refused the password${detail ? ` (${detail})` : ''}. Enter a new app password to resume.`,
  );
}

/** Pauses an active mailbox with a reason, then its campaigns left without one. */
export async function pauseMailbox(sql: Db, mailboxId: string, reason: string): Promise<boolean> {
  const rows = await sql`
    update mailboxes set status = 'paused', status_reason = ${reason}
    where id = ${mailboxId} and status in ('active', 'checking')
    returning id`;
  await pauseOrphanedCampaigns(sql, mailboxId);
  return rows.length > 0;
}

/** Campaigns of this mailbox that are running with every mailbox paused, errored or gone. */
export async function pauseOrphanedCampaigns(sql: Db, mailboxId: string): Promise<number> {
  const rows = await sql`
    update campaigns c set status = 'paused'
    where c.status in ('scheduled', 'sending')
      and c.id in (select campaign_id from campaign_mailboxes where mailbox_id = ${mailboxId})
      and not exists (
        select 1 from campaign_mailboxes cm join mailboxes m on m.id = cm.mailbox_id
        where cm.campaign_id = c.id and m.status in ('active', 'checking')
      )
    returning id`;
  return rows.length;
}
