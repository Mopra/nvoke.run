import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REVIEW_MINUTES, type CampaignSchedule } from '@nvoke/shared';
import { ensureAccount } from '../leads/quota.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import {
  createCampaign,
  deleteCampaign,
  getCampaign,
  getCampaignLead,
  listCampaignLeads,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  startCampaign,
  stopLead,
  updateCampaign,
  updateWrittenStep,
} from './campaigns.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs cascade`;
});

// A Monday, 08:00 UTC.
const NOW = new Date('2026-10-19T08:00:00Z');
const HOUR = 3_600_000;
const SCHEDULE: CampaignSchedule = { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 };

async function mailbox(address = 'me@sender.io'): Promise<string> {
  await ensureAccount(db.sql, 'u1');
  const [row] = await db.sql<{ id: string }[]>`
    insert into mailboxes (clerk_user_id, address, display_name, provider, smtp_host, smtp_port, smtp_secure,
      imap_host, imap_port, username, secret, status)
    values ('u1', ${address}, 'Mo', 'smtp', 'smtp.sender.io', 465, true, 'imap.sender.io', 993, ${address}, 'sealed', 'active')
    returning id`;
  return row!.id;
}

/** A search with one valid named person per domain. */
async function search(domains: string[]): Promise<string> {
  await ensureAccount(db.sql, 'u1');
  const [s] = await db.sql<{ id: string }[]>`insert into searches (clerk_user_id, kind, "limit") values ('u1', 'local', 50) returning id`;
  for (const d of domains) {
    const [c] = await db.sql<{ id: string }[]>`
      insert into companies (search_id, clerk_user_id, name, domain, website, source)
      values (${s!.id}, 'u1', ${d}, ${d}, ${`https://${d}/`}, 'test') returning id`;
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, first_name)
      values (${c!.id}, ${s!.id}, 'u1', ${`ann@${d}`}, 'personal', 'valid', 'Ann')`;
  }
  return s!.id;
}

/** Creates a list campaign and marks its leads written at `writtenAt`, as the write job would. */
async function written(domains: string[], writtenAt = NOW) {
  const m = await mailbox();
  const s = await search(domains);
  const c = await createCampaign(
    db.sql,
    'u1',
    { name: 'Test', source: 'list', searchId: s, mailboxIds: [m], schedule: SCHEDULE, steps: [{ waitDays: 0, brief: 'Hello.' }, { waitDays: 3, brief: 'Bump.' }] },
    NOW,
  );
  const ids = await db.sql<{ id: string }[]>`select id from campaign_leads where campaign_id = ${c.id} order by address`;
  for (const { id } of ids) {
    for (const step of [1, 2]) {
      await db.sql`insert into campaign_steps_written (campaign_lead_id, step, subject, body) values (${id}, ${step}, 'quick question', ${`Hi Ann, step ${step}.`})`;
    }
  }
  await db.sql`update campaign_leads set status = 'queued', written_at = ${writtenAt} where campaign_id = ${c.id}`;
  await db.sql`update campaigns set status = 'review' where id = ${c.id}`;
  return { campaign: c, mailboxId: m, leadIds: ids.map((r) => r.id) };
}

async function sendTimes(campaignId: string): Promise<Date[]> {
  const rows = await db.sql<{ next_send_at: Date | null }[]>`select next_send_at from campaign_leads where campaign_id = ${campaignId} order by address`;
  return rows.map((r) => r.next_send_at!);
}

function inWorkingHours(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5 && d.getUTCHours() >= 9 && d.getUTCHours() < 17;
}

describe('startCampaign', () => {
  it('needs review, then opens the review hour and schedules every lead after it and its hold', async () => {
    const { campaign } = await written(['a.com', 'b.com']);
    // Still writing: not yet.
    await db.sql`update campaigns set status = 'writing' where id = ${campaign.id}`;
    await expect(startCampaign(db.sql, 'u1', campaign.id, NOW)).rejects.toMatchObject({ code: 'bad_state' });
    await db.sql`update campaigns set status = 'review' where id = ${campaign.id}`;

    const started = await startCampaign(db.sql, 'u1', campaign.id, NOW);
    expect(started).toMatchObject({ status: 'scheduled', startedAt: NOW.toISOString() });
    expect(started!.reviewUntil).toBe(new Date(NOW.getTime() + REVIEW_MINUTES * 60_000).toISOString());
    for (const at of await sendTimes(campaign.id)) {
      // Written at 08:00 with a 2 hour hold: not before 10:00, inside 9 to 17 UTC (the leads have no country).
      expect(at.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 2 * HOUR);
      expect(inWorkingHours(at)).toBe(true);
    }
    await expect(startCampaign(db.sql, 'u1', campaign.id, NOW)).rejects.toMatchObject({ code: 'bad_state' });
    expect(await startCampaign(db.sql, 'u2', campaign.id, NOW)).toBeNull();
  });

  it('waits for the review window when the hold is already over', async () => {
    const { campaign } = await written(['a.com'], new Date(NOW.getTime() - 5 * HOUR));
    // Monday 10:30 UTC: the review hour ends at 11:30.
    const at = new Date(NOW.getTime() + 2.5 * HOUR);
    await startCampaign(db.sql, 'u1', campaign.id, at);
    const [send] = await sendTimes(campaign.id);
    expect(send!.getTime()).toBeGreaterThanOrEqual(at.getTime() + REVIEW_MINUTES * 60_000);
    expect(inWorkingHours(send!)).toBe(true);
  });
});

describe('pause and resume', () => {
  it('pauses a started campaign and moves sends that fell due into working hours on resume', async () => {
    const { campaign } = await written(['a.com']);
    await expect(pauseCampaign(db.sql, 'u1', campaign.id)).rejects.toMatchObject({ code: 'bad_state' });
    await startCampaign(db.sql, 'u1', campaign.id, NOW);
    expect((await pauseCampaign(db.sql, 'u1', campaign.id))!.status).toBe('paused');
    // Resumed on Friday evening, after the send time passed: it moves to Monday.
    const friday = new Date('2026-10-23T19:00:00Z');
    expect((await resumeCampaign(db.sql, 'u1', campaign.id, friday))!.status).toBe('scheduled');
    const [send] = await sendTimes(campaign.id);
    expect(send!.getTime()).toBeGreaterThan(friday.getTime());
    expect(send!.getUTCDay()).toBe(1);
    expect(inWorkingHours(send!)).toBe(true);
    await expect(resumeCampaign(db.sql, 'u1', campaign.id, friday)).rejects.toMatchObject({ code: 'bad_state' });
  });
});

describe('campaign reads and edits', () => {
  it('lists, updates and deletes', async () => {
    const { campaign } = await written(['a.com']);
    const other = await mailbox('two@sender.io');
    const updated = await updateCampaign(db.sql, 'u1', campaign.id, { name: 'Renamed', dailyNew: 10, mailboxIds: [other] });
    expect(updated).toMatchObject({ name: 'Renamed', dailyNew: 10, mailboxIds: [other] });
    // The unsent lead moved to the remaining mailbox.
    const [lead] = await db.sql<{ mailbox_id: string }[]>`select mailbox_id from campaign_leads where campaign_id = ${campaign.id}`;
    expect(lead!.mailbox_id).toBe(other);
    expect((await listCampaigns(db.sql, 'u1')).map((c) => c.name)).toEqual(['Renamed']);
    expect(await listCampaigns(db.sql, 'u2')).toEqual([]);
    expect(await updateCampaign(db.sql, 'u2', campaign.id, { name: 'x' })).toBeNull();
    expect(await deleteCampaign(db.sql, 'u2', campaign.id)).toBe(false);
    expect(await deleteCampaign(db.sql, 'u1', campaign.id)).toBe(true);
    expect(await getCampaign(db.sql, 'u1', campaign.id)).toBeNull();
  });

  it('pages leads, hides skipped ones unless asked', async () => {
    const { campaign } = await written(['a.com', 'b.com', 'c.com']);
    await db.sql`update campaign_leads set status = 'skipped', skip_reason = 'country' where address = 'ann@c.com'`;
    const first = await listCampaignLeads(db.sql, 'u1', campaign.id, { limit: 1 });
    expect(first!.leads).toHaveLength(1);
    const second = await listCampaignLeads(db.sql, 'u1', campaign.id, { limit: 1, cursor: first!.nextCursor! });
    expect(second!.leads).toHaveLength(1);
    expect(second!.nextCursor).toBeNull();
    expect(new Set([first!.leads[0]!.address, second!.leads[0]!.address])).toEqual(new Set(['ann@a.com', 'ann@b.com']));
    const skipped = await listCampaignLeads(db.sql, 'u1', campaign.id, { status: 'skipped' });
    expect(skipped!.leads.map((l) => l.skipReason)).toEqual(['country']);
    expect(await listCampaignLeads(db.sql, 'u1', campaign.id, { cursor: 'nonsense' })).toBeNull();
    expect(await listCampaignLeads(db.sql, 'u2', campaign.id)).toBeNull();
  });

  it('edits a written step until it is sent, and stops a lead', async () => {
    const { campaign, mailboxId, leadIds } = await written(['a.com']);
    const leadId = leadIds[0]!;
    expect(await updateWrittenStep(db.sql, 'u1', campaign.id, leadId, 1, { body: 'Hi Ann, rewritten.' })).toEqual({
      step: 1,
      subject: 'quick question',
      body: 'Hi Ann, rewritten.',
      edited: true,
      sentAt: null,
    });
    expect(await updateWrittenStep(db.sql, 'u1', campaign.id, leadId, 4, { body: 'x' })).toBeNull();
    await db.sql`
      insert into messages (clerk_user_id, mailbox_id, campaign_id, campaign_lead_id, direction, kind, from_address, to_address, step, at)
      values ('u1', ${mailboxId}, ${campaign.id}, ${leadId}, 'out', 'step', 'me@sender.io', 'ann@a.com', 1, ${NOW})`;
    await expect(updateWrittenStep(db.sql, 'u1', campaign.id, leadId, 1, { body: 'again' })).rejects.toMatchObject({ code: 'bad_state' });

    const detail = await getCampaignLead(db.sql, 'u1', campaign.id, leadId);
    expect(detail!.steps.map((s) => s.sentAt)).toEqual([NOW.toISOString(), null]);
    expect(detail!.messages).toHaveLength(1);

    expect((await stopLead(db.sql, 'u1', campaign.id, leadId))!).toMatchObject({ status: 'stopped', nextSendAt: null });
    expect(await stopLead(db.sql, 'u2', campaign.id, leadId)).toBeNull();
  });
});
