import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CampaignProduct, CreateCampaignRequest } from '@nvoke/shared';
import { ensureAccount } from '../leads/quota.js';
import { addressHash, domainHash } from '../leads/suppression.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import { CampaignError, createCampaign, getCampaign } from './campaigns.js';
import { enrollTick } from './enroll.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs, suppressions cascade`;
});

// A Monday, 08:00 UTC.
const NOW = new Date('2026-10-19T08:00:00Z');
const MIN = 60_000;
const DAY = 86_400_000;

async function mailbox(sql: Sql, address = 'me@sender.io', userId = 'u1'): Promise<string> {
  await ensureAccount(sql, userId);
  const [row] = await sql<{ id: string }[]>`
    insert into mailboxes (clerk_user_id, address, display_name, provider, smtp_host, smtp_port, smtp_secure,
      imap_host, imap_port, username, secret, status)
    values (${userId}, ${address}, 'Mo', 'smtp', 'smtp.sender.io', 465, true, 'imap.sender.io', 993, ${address}, 'sealed', 'active')
    returning id`;
  return row!.id;
}

async function search(o: { dropId?: string; createdAt?: Date } = {}): Promise<string> {
  await ensureAccount(db.sql, 'u1');
  const [row] = await db.sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, "limit", drop_id, created_at)
    values ('u1', ${o.dropId ? 'drop' : 'local'}, 50, ${o.dropId ?? null}, ${o.createdAt ?? NOW})
    returning id`;
  return row!.id;
}

async function company(searchId: string, domain: string, location: string | null = null): Promise<string> {
  const [row] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source, location)
    values (${searchId}, 'u1', ${domain.split('.')[0]!}, ${domain}, ${`https://${domain}/`}, 'test', ${location})
    returning id`;
  return row!.id;
}

interface EmailOver {
  verification?: string | null;
  firstName?: string | null;
  seniority?: string | null;
  confidence?: number | null;
}

async function email(searchId: string, companyId: string, address: string, o: EmailOver = {}): Promise<string> {
  const [row] = await db.sql<{ id: string }[]>`
    insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, first_name, seniority, confidence)
    values (${companyId}, ${searchId}, 'u1', ${address}, 'personal',
      ${o.verification === undefined ? 'valid' : o.verification}, ${o.firstName === undefined ? address.split('@')[0]! : o.firstName},
      ${o.seniority ?? null}, ${o.confidence ?? null})
    returning id`;
  return row!.id;
}

const STEPS = [
  { waitDays: 0, brief: 'The problem and the offer.' },
  { waitDays: 3, brief: 'A short bump.' },
];

function req(mailboxIds: string[], over: Partial<CreateCampaignRequest> = {}): CreateCampaignRequest {
  return { name: 'Test', source: 'list', steps: STEPS, mailboxIds, ...over };
}

async function leads(campaignId: string) {
  return db.sql<{ address: string; status: string; skip_reason: string | null; mailbox_id: string | null; country: string | null; timezone: string }[]>`
    select address, status, skip_reason, mailbox_id, country, timezone from campaign_leads where campaign_id = ${campaignId} order by address`;
}

/** Another campaign of u1 (for `product`, else nvoke) that wrote to `address` at `at`. */
async function contactedBefore(address: string, at: Date, product?: CampaignProduct) {
  const [c] = await db.sql<{ id: string }[]>`
    insert into campaigns (clerk_user_id, name, status, steps, schedule, product)
    values ('u1', 'Old', 'done', ${db.sql.json(STEPS)}, ${db.sql.json({ days: [1], startHour: 9, endHour: 17 })},
      ${product ? db.sql.json(product) : null}) returning id`;
  await db.sql`
    insert into campaign_leads (campaign_id, clerk_user_id, address, company_name, domain, status, created_at)
    values (${c!.id}, 'u1', ${address}, 'Old', ${address.split('@')[1]!}, 'done', ${at})`;
}

describe('enrollCampaign rules', () => {
  it('enrolls valid named people, one per company, and keeps the rest as skipped with a reason', async () => {
    const m = await mailbox(db.sql);
    const s = await search();
    const a = await company(s, 'alpha.com', 'London, UK');
    await email(s, a, 'anna@alpha.com', { seniority: 'founder', confidence: 60 });
    await email(s, a, 'bob@alpha.com', { seniority: 'staff', confidence: 99 });
    await email(s, a, 'info@alpha.com', { firstName: null });
    const b = await company(s, 'beta.com');
    await email(s, b, 'carl@beta.com', { verification: 'risky' });
    await email(s, b, 'dora@beta.com', { verification: 'catch_all' });
    const c = await company(s, 'gamma.com');
    await email(s, c, 'eve@gamma.com');
    await db.sql`insert into suppressions (hash, kind, source) values (${addressHash('eve@gamma.com')}, 'address', 'opt_out_page')`;
    const d = await company(s, 'delta.com');
    await email(s, d, 'finn@delta.com');
    await db.sql`insert into send_suppressions (clerk_user_id, hash, reason) values ('u1', ${addressHash('finn@delta.com')}, 'unsubscribe')`;
    const e = await company(s, 'echo.com');
    await email(s, e, 'gus@echo.com');
    await contactedBefore('gus@echo.com', new Date(NOW.getTime() - 10 * DAY));
    const f = await company(s, 'foxtrot.com');
    await email(s, f, 'hal@foxtrot.com');
    await contactedBefore('hal@foxtrot.com', new Date(NOW.getTime() - 100 * DAY));
    const g = await company(s, 'berlin-tools.com', 'Berlin, Germany');
    await email(s, g, 'ida@berlin-tools.com');
    const h = await company(s, 'hotel.com');
    await email(s, h, 'jo@hotel.com', { verification: null });
    // A Danish domain listed in London, and a German address on a .com company.
    const i = await company(s, 'klinik.dk', 'London, UK');
    await email(s, i, 'kai@klinik.dk');
    const j = await company(s, 'juliet.com', 'Austin, TX');
    await email(s, j, 'lea@juliet.de');
    // The owner's other outreach already wrote to this company.
    const k = await company(s, 'kilo.com');
    await email(s, k, 'max@kilo.com');
    await db.sql`insert into send_suppressions (clerk_user_id, hash, reason) values ('u1', ${domainHash('kilo.com')}, 'manual')`;

    const campaign = await createCampaign(db.sql, 'u1', req([m], { searchId: s }), NOW);
    expect(campaign.status).toBe('writing');
    expect(campaign.leads).toBe(2);
    expect(campaign.writing).toBe(2);
    expect(campaign.skipped).toEqual({ per_company: 1, not_person: 1, not_valid: 2, suppressed: 3, contacted: 1, country: 3 });

    const rows = await leads(campaign.id);
    const status = Object.fromEntries(rows.map((r) => [r.address, r.skip_reason ?? r.status]));
    expect(status).toEqual({
      'anna@alpha.com': 'writing',
      'bob@alpha.com': 'per_company',
      'info@alpha.com': 'not_person',
      'carl@beta.com': 'not_valid',
      'dora@beta.com': 'not_valid',
      'eve@gamma.com': 'suppressed',
      'finn@delta.com': 'suppressed',
      'gus@echo.com': 'contacted',
      'hal@foxtrot.com': 'writing',
      'ida@berlin-tools.com': 'country',
      'kai@klinik.dk': 'country',
      'lea@juliet.de': 'country',
      'max@kilo.com': 'suppressed',
    });
    const anna = rows.find((r) => r.address === 'anna@alpha.com')!;
    expect(anna).toMatchObject({ mailbox_id: m, country: 'GB', timezone: 'Europe/London' });

    // One write job holds both leads.
    const jobs = await db.sql<{ payload: { campaignId: string; leadIds: string[] } }[]>`select payload from jobs where type = 'write'`;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload.campaignId).toBe(campaign.id);
    expect(jobs[0]!.payload.leadIds).toHaveLength(2);
  });

  it('skips a company another campaign of the same sender wrote to, whoever it reached there', async () => {
    const m = await mailbox(db.sql);
    const s = await search();
    const a = await company(s, 'alpha.com');
    await email(s, a, 'anna@alpha.com');
    await contactedBefore('bob@alpha.com', new Date(NOW.getTime() - 10 * DAY));
    // Another sender (a product campaign) wrote to beta.com: nvoke still may.
    const b = await company(s, 'beta.com');
    await email(s, b, 'carl@beta.com');
    const day3: CampaignProduct = {
      name: 'Day3', domain: 'day3.app', summary: 'Email.', offer: 'Free move.', audience: 'Newsletters.',
      prices: '$1 a month.', pitch: 'Cheaper.', proof: [], recheck: null,
    };
    await contactedBefore('dora@beta.com', new Date(NOW.getTime() - 10 * DAY), day3);
    // Past the 90 days it is fair game again.
    const c = await company(s, 'gamma.com');
    await email(s, c, 'eve@gamma.com');
    await contactedBefore('finn@gamma.com', new Date(NOW.getTime() - 100 * DAY));
    const campaign = await createCampaign(db.sql, 'u1', req([m], { searchId: s }), NOW);
    const status = Object.fromEntries((await leads(campaign.id)).map((r) => [r.address, r.skip_reason ?? r.status]));
    expect(status).toEqual({ 'anna@alpha.com': 'contacted', 'carl@beta.com': 'writing', 'eve@gamma.com': 'writing' });
  });

  it('takes catch_all and unnamed addresses when the campaign says so, and several per company by confidence', async () => {
    const m = await mailbox(db.sql);
    const s = await search();
    const a = await company(s, 'alpha.com');
    await email(s, a, 'low@alpha.com', { confidence: 10 });
    await email(s, a, 'high@alpha.com', { confidence: 90 });
    await email(s, a, 'info@alpha.com', { firstName: null, verification: 'catch_all' });
    const campaign = await createCampaign(db.sql, 'u1', req([m], { searchId: s, allowCatchAll: true, peopleOnly: false, perCompany: 2 }), NOW);
    const status = Object.fromEntries((await leads(campaign.id)).map((r) => [r.address, r.skip_reason ?? r.status]));
    // Equal seniority: confidence decides, then a name beats none.
    expect(status).toEqual({ 'high@alpha.com': 'writing', 'low@alpha.com': 'writing', 'info@alpha.com': 'per_company' });
  });

  it('enrolls only the picked emails of a list, and refuses a list nobody can be written to', async () => {
    const m = await mailbox(db.sql);
    const s = await search();
    const one = await email(s, await company(s, 'alpha.com'), 'anna@alpha.com');
    await email(s, await company(s, 'beta.com'), 'bea@beta.com');
    const bad = await email(s, await company(s, 'gamma.com'), 'gil@gamma.com', { verification: 'invalid' });

    const campaign = await createCampaign(db.sql, 'u1', req([m], { emailIds: [one] }), NOW);
    expect((await leads(campaign.id)).map((r) => r.address)).toEqual(['anna@alpha.com']);

    await expect(createCampaign(db.sql, 'u1', req([m], { emailIds: [bad] }), NOW)).rejects.toMatchObject({ code: 'no_leads' });
    // Nothing of the refused campaign stays.
    expect(await db.sql`select 1 from campaigns`).toHaveLength(1);
  });

  it('refuses a mailbox or search that is not the user\'s', async () => {
    const mine = await mailbox(db.sql);
    const theirs = await mailbox(db.sql, 'other@else.io', 'u2');
    const s = await search();
    await expect(createCampaign(db.sql, 'u1', req([mine, theirs], { searchId: s }), NOW)).rejects.toBeInstanceOf(CampaignError);
    await expect(createCampaign(db.sql, 'u1', req([theirs], { searchId: s }), NOW)).rejects.toMatchObject({ code: 'bad_mailbox' });
    await expect(createCampaign(db.sql, 'u2', req([theirs], { searchId: s }), NOW)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('spreads leads over the campaign\'s mailboxes, fewest first', async () => {
    const m1 = await mailbox(db.sql, 'a@sender.io');
    const m2 = await mailbox(db.sql, 'b@sender.io');
    const s = await search();
    for (const d of ['a', 'b', 'c', 'd']) await email(s, await company(s, `${d}.com`), `x@${d}.com`);
    const campaign = await createCampaign(db.sql, 'u1', req([m1, m2], { searchId: s }), NOW);
    const byBox = (await leads(campaign.id)).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.mailbox_id!]: (acc[r.mailbox_id!] ?? 0) + 1 }), {});
    expect(byBox).toEqual({ [m1]: 2, [m2]: 2 });
  });
});

describe('autopilot', () => {
  async function started(over: Partial<CreateCampaignRequest>) {
    const m = await mailbox(db.sql);
    const campaign = await createCampaign(db.sql, 'u1', req([m], over), NOW);
    // As if written, reviewed and started.
    await db.sql`update campaign_leads set status = 'queued' where campaign_id = ${campaign.id} and status = 'writing'`;
    await db.sql`update campaigns set status = 'sending', started_at = ${NOW}, enrolled_at = ${NOW} where id = ${campaign.id}`;
    return (await getCampaign(db.sql, 'u1', campaign.id))!;
  }

  it('enrolls the new valid emails of an ongoing search, at most every 5 minutes', async () => {
    const s = await search();
    await email(s, await company(s, 'alpha.com'), 'anna@alpha.com');
    const campaign = await started({ source: 'search', searchId: s });
    expect(campaign.autopilot).toBe(true);
    expect(campaign.leads).toBe(1);

    const b = await company(s, 'beta.com');
    await email(s, b, 'bea@beta.com');
    await email(s, b, 'ben@beta.com', { verification: null });
    // Too soon after the last look.
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 2 * MIN))).toBe(0);
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 6 * MIN))).toBe(1);
    expect((await leads(campaign.id)).map((r) => r.address)).toEqual(['anna@alpha.com', 'bea@beta.com']);

    // Ben's check finishes; beta.com already has its one lead.
    await db.sql`update emails set verification = 'valid' where address = 'ben@beta.com'`;
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 12 * MIN))).toBe(0);
    expect((await leads(campaign.id)).find((r) => r.address === 'ben@beta.com')?.skip_reason).toBe('per_company');
    // Bea waits for a fuller write batch, at most WRITE_WAIT_MS.
    expect(await db.sql`select 1 from jobs where type = 'write'`).toHaveLength(1);
    await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 37 * MIN));
    expect(await db.sql`select 1 from jobs where type = 'write'`).toHaveLength(2);
  });

  it('writes in full batches of WRITE_BATCH, and sends the rest once the oldest waited, paused or not', async () => {
    const s = await search();
    const campaign = await started({ source: 'search', searchId: s });
    for (let i = 0; i < 12; i++) await email(s, await company(s, `c${i}.com`), `x@c${i}.com`);
    const writeJobs = () => db.sql<{ payload: { leadIds: string[] } }[]>`select payload from jobs where type = 'write' order by id`;

    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 6 * MIN))).toBe(12);
    expect((await writeJobs()).map((j) => j.payload.leadIds.length)).toEqual([10]);
    // Paused: nothing enrolls, but the two waiting are still written.
    await db.sql`update campaigns set status = 'paused' where id = ${campaign.id}`;
    await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 20 * MIN));
    expect(await writeJobs()).toHaveLength(1);
    await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 37 * MIN));
    expect((await writeJobs()).map((j) => j.payload.leadIds.length)).toEqual([10, 2]);
    // Each lead is in one job.
    const ids = (await writeJobs()).flatMap((j) => j.payload.leadIds);
    expect(new Set(ids).size).toBe(12);
    await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 80 * MIN));
    expect(await writeJobs()).toHaveLength(2);
  });

  it('enrolls only for SENDING_USERS, and nothing with nobody in it', async () => {
    const s = await search();
    await started({ source: 'search', searchId: s });
    await email(s, await company(s, 'alpha.com'), 'anna@alpha.com');
    expect(await enrollTick(db.sql, silentLog, [], new Date(NOW.getTime() + 6 * MIN))).toBe(0);
    expect(await enrollTick(db.sql, silentLog, ['u2'], new Date(NOW.getTime() + 6 * MIN))).toBe(0);
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 6 * MIN))).toBe(1);
  });

  it('fills an autopilot campaign in review whose search was still empty', async () => {
    const s = await search();
    const m = await mailbox(db.sql);
    const campaign = await createCampaign(db.sql, 'u1', req([m], { source: 'search', searchId: s }), NOW);
    expect(campaign.status).toBe('review');
    expect(campaign.leads).toBe(0);
    await email(s, await company(s, 'alpha.com'), 'anna@alpha.com');
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 6 * MIN))).toBe(1);
    expect((await leads(campaign.id)).map((r) => [r.address, r.status])).toEqual([['anna@alpha.com', 'writing']]);
  });

  it('enrolls nothing while paused', async () => {
    const s = await search();
    const campaign = await started({ source: 'search', searchId: s });
    await db.sql`update campaigns set status = 'paused' where id = ${campaign.id}`;
    await email(s, await company(s, 'alpha.com'), 'anna@alpha.com');
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 10 * MIN))).toBe(0);
  });

  it('follows a drop: every search it makes after the campaign is created', async () => {
    await ensureAccount(db.sql, 'u1');
    const [d] = await db.sql<{ id: string }[]>`
      insert into drops (clerk_user_id, name, sources, daily_limit) values ('u1', 'Launches', '{show_hn}', 10) returning id`;
    const old = await search({ dropId: d!.id, createdAt: new Date(NOW.getTime() - DAY) });
    await email(old, await company(old, 'old.com'), 'olga@old.com');

    const campaign = await started({ source: 'drop', dropId: d!.id });
    expect(campaign.status).toBe('sending');
    expect(campaign.leads).toBe(0);

    const fresh = await search({ dropId: d!.id, createdAt: new Date(NOW.getTime() + 3 * MIN) });
    await email(fresh, await company(fresh, 'new.com'), 'nina@new.com');
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 6 * MIN))).toBe(1);
    expect((await leads(campaign.id)).map((r) => r.address)).toEqual(['nina@new.com']);
  });

  it('enrolls at most daily_new a UTC day and holds the rest for the next day', async () => {
    const s = await search();
    const campaign = await started({ source: 'search', searchId: s, dailyNew: 2 });
    for (const x of ['a', 'b', 'c']) await email(s, await company(s, `${x}.com`), `x@${x}.com`);

    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 6 * MIN))).toBe(2);
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(NOW.getTime() + 12 * MIN))).toBe(0);
    // The one held back is not marked skipped, so the next day takes it.
    expect(await leads(campaign.id)).toHaveLength(2);
    expect(await enrollTick(db.sql, silentLog, ['u1'], new Date(Date.UTC(2026, 9, 20, 0, 1)))).toBe(1);
  });

  it('a new autopilot campaign with nothing yet goes straight to review', async () => {
    const m = await mailbox(db.sql);
    const s = await search();
    const campaign = await createCampaign(db.sql, 'u1', req([m], { source: 'search', searchId: s }), NOW);
    expect(campaign).toMatchObject({ status: 'review', leads: 0, autopilot: true });
  });
});
