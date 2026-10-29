import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { ensureAccount } from './quota.js';
import { renameCompanies } from './rename-companies.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
});

async function seed(): Promise<{ campaignId: string; search: string }> {
  await ensureAccount(db.sql, 'u1');
  const [s] = await db.sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, "limit") values ('u1', 'web', 50) returning id`;
  const [c] = await db.sql<{ id: string }[]>`
    insert into campaigns (clerk_user_id, name, steps, schedule) values ('u1', 'Test', '[]', '{}') returning id`;
  return { campaignId: c!.id, search: s!.id };
}

async function company(search: string, name: string, domain: string, source = 'brave'): Promise<string> {
  const [row] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source)
    values (${search}, 'u1', ${name}, ${domain}, ${`https://${domain}/`}, ${source})
    returning id`;
  return row!.id;
}

async function lead(campaignId: string, companyId: string, name: string, domain: string, o: { sent?: boolean; edited?: boolean } = {}) {
  const [row] = await db.sql<{ id: string }[]>`
    insert into campaign_leads (campaign_id, clerk_user_id, company_id, address, company_name, domain)
    values (${campaignId}, 'u1', ${companyId}, ${`hi@${domain}`}, ${name}, ${domain})
    returning id`;
  await db.sql`
    insert into campaign_steps_written (campaign_lead_id, step, subject, body, edited)
    values (${row!.id}, 1, ${`A note for ${name}`}, ${`Hi, I saw ${name} online.`}, ${o.edited ?? false})`;
  if (o.sent) {
    await db.sql`
      insert into messages (clerk_user_id, campaign_id, campaign_lead_id, direction, kind, from_address, to_address, step)
      values ('u1', ${campaignId}, ${row!.id}, 'out', 'step', 'me@sender.io', ${`hi@${domain}`}, 1)`;
  }
  return row!.id;
}

describe('renameCompanies', () => {
  it('lists bad names without writing, then fixes unsent leads and their drafts', async () => {
    const { campaignId, search } = await seed();
    const virtual = await company(search, 'Services Offered:', 'virtual-sales.com');
    const tsl = await company(search, 'Website:', 'tslmarketing.com');
    const good = await company(search, 'Acme Dental', 'acmedental.com');
    await company(search, 'Website:', 'osm-place.dk', 'osm');
    await company(search, 'Brew by Numbers', 'bbn.co.uk');
    const unsent = await lead(campaignId, virtual, 'Services Offered:', 'virtual-sales.com');
    const sent = await lead(campaignId, tsl, 'Website:', 'tslmarketing.com', { sent: true });
    await lead(campaignId, good, 'Acme Dental', 'acmedental.com');

    const dry = await renameCompanies(db.sql, { apply: false });
    expect(dry.renames.map((r) => [r.table, r.from, r.to])).toEqual([
      ['companies', 'Services Offered:', 'Virtual Sales'],
      ['companies', 'Website:', 'Tslmarketing'],
      ['campaign_leads', 'Services Offered:', 'Virtual Sales'],
    ]);
    expect(dry.draftsFixed).toBe(1);
    const [still] = await db.sql<{ name: string }[]>`select name from companies where id = ${virtual}`;
    expect(still!.name).toBe('Services Offered:');

    await renameCompanies(db.sql, { apply: true });
    const names = await db.sql<{ domain: string; name: string }[]>`select domain, name from companies order by domain`;
    expect(names.map((n) => n.name)).toEqual(['Acme Dental', 'Brew by Numbers', 'Website:', 'Tslmarketing', 'Virtual Sales']);
    const leads = await db.sql<{ id: string; company_name: string }[]>`select id, company_name from campaign_leads`;
    expect(leads.find((l) => l.id === unsent)!.company_name).toBe('Virtual Sales');
    expect(leads.find((l) => l.id === sent)!.company_name).toBe('Website:');
    const [draft] = await db.sql<{ subject: string; body: string }[]>`
      select subject, body from campaign_steps_written where campaign_lead_id = ${unsent}`;
    expect(draft).toEqual({ subject: 'A note for Virtual Sales', body: 'Hi, I saw Virtual Sales online.' });

    expect((await renameCompanies(db.sql, { apply: false })).renames).toEqual([]);
  });

  it('swaps whole words only in a draft', async () => {
    const { campaignId, search } = await seed();
    const c = await company(search, 'News', 'dailybugle.com');
    const id = await lead(campaignId, c, 'News', 'dailybugle.com');
    await db.sql`update campaign_steps_written set body = 'Your newsletter at News: News was great.' where campaign_lead_id = ${id}`;
    await renameCompanies(db.sql, { apply: true });
    const [draft] = await db.sql<{ body: string }[]>`select body from campaign_steps_written where campaign_lead_id = ${id}`;
    expect(draft!.body).toBe('Your newsletter at Dailybugle: Dailybugle was great.');
  });

  it('leaves a draft the user edited alone', async () => {
    const { campaignId, search } = await seed();
    const c = await company(search, 'Website:', 'tslmarketing.com');
    const id = await lead(campaignId, c, 'Website:', 'tslmarketing.com', { edited: true });
    const result = await renameCompanies(db.sql, { apply: true });
    expect(result.draftsEdited).toBe(1);
    const [draft] = await db.sql<{ body: string }[]>`select body from campaign_steps_written where campaign_lead_id = ${id}`;
    expect(draft!.body).toBe('Hi, I saw Website: online.');
  });
});
