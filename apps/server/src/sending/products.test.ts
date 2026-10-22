// The owner's other products on the send path (docs/sending/plan.md, "Own
// products"): opt-outs per sender, the pool's daily cap, the product's
// signature and the live recheck before an exit1 send.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CampaignProduct } from '@nvoke/shared';
import { createTestDb, type TestDb } from '../testing/db.js';
import { suppressDomainForSender, suppressForSender } from '../leads/suppression.js';
import { createFakeTransport, type FakeTransport } from './fake-transport.js';
import { endLead } from './outcomes.js';
import type { RecheckResult } from './recheck.js';
import { sendTick, type SendDeps } from './sender.js';
import { seedCampaign, seedLead, seedMailbox, silentLog, testSecrets } from './test-seed.js';

let db: TestDb;
let fake: FakeTransport;
let deps: SendDeps;
const secrets = testSecrets();
const NOW = new Date('2026-10-20T12:00:00Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

const EXIT1: CampaignProduct = {
  name: 'exit1',
  domain: 'exit1.dev',
  summary: 'Uptime and SSL monitoring.',
  offer: 'Free plan with certificate alerts.',
  audience: 'Small businesses.',
  prices: 'Free for 50 monitors. Indie $4/mo.',
  pitch: 'Their certificate is broken.',
  proof: [],
  recheck: 'ssl',
};

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, suppressions, email_checks cascade`;
  fake = createFakeTransport();
  deps = { sql: db.sql, secrets, transport: fake.factory, log: silentLog, publicApiUrl: 'https://api.nvoke.test/', enabled: true, users: ['u1'] };
});

async function withProduct(campaignId: string, product: CampaignProduct): Promise<void> {
  await db.sql`update campaigns set product = ${db.sql.json(product)} where id = ${campaignId}`;
}

async function lead(id: string) {
  const [row] = await db.sql<{ status: string; skip_reason: string | null }[]>`select status, skip_reason from campaign_leads where id = ${id}`;
  return row!;
}

describe('opt-outs per sender', () => {
  it("holds a product's opt-out for that product only, and an account-wide one for every campaign", async () => {
    const one = await seedMailbox(db.sql, secrets, { address: 'a@sender.io' });
    const two = await seedMailbox(db.sql, secrets, { address: 'b@sender.io' });
    const exit1 = await seedCampaign(db.sql, [one]);
    await withProduct(exit1, EXIT1);
    const own = await seedCampaign(db.sql, [two]);
    deps.recheckSsl = async () => 'problem';

    // A Day3 opt-out stops neither exit1 nor the account's own campaign.
    await suppressForSender(db.sql, 'u1', 'jane@acme.co.uk', 'manual', 'day3.app');
    await seedLead(db.sql, exit1, one, { address: 'jane@acme.co.uk' });
    await seedLead(db.sql, own, two, { address: 'jane@acme.co.uk' });
    expect(await sendTick(deps, NOW)).toMatchObject({ sent: 2, stopped: 0 });

    // An exit1 opt-out stops exit1 only.
    await suppressForSender(db.sql, 'u1', 'joe@acme.co.uk', 'manual', 'exit1.dev');
    const a = await seedLead(db.sql, exit1, one, { address: 'joe@acme.co.uk' });
    const b = await seedLead(db.sql, own, two, { address: 'joe@acme.co.uk' });
    expect(await sendTick(deps, minutes(10))).toMatchObject({ sent: 1, stopped: 1 });
    expect(await lead(a)).toEqual({ status: 'stopped', skip_reason: 'suppressed' });
    expect(await lead(b)).toMatchObject({ status: 'active' });

    // One for '' stops every campaign of the account.
    await suppressDomainForSender(db.sql, 'u1', 'other.co.uk', 'manual');
    await seedLead(db.sql, exit1, one, { address: 'ann@other.co.uk', nextSendAt: minutes(15) });
    await seedLead(db.sql, own, two, { address: 'ann@other.co.uk', nextSendAt: minutes(15) });
    expect(await sendTick(deps, minutes(20))).toMatchObject({ sent: 0, stopped: 2 });

    // A company's opt-out covers its subdomains, and an address at that company on another site.
    await suppressDomainForSender(db.sql, 'u1', 'endress.com', 'manual');
    const sub = await seedLead(db.sql, own, two, { address: 'it@shop.endress.com', nextSendAt: minutes(25) });
    expect(await sendTick(deps, minutes(30))).toMatchObject({ sent: 0, stopped: 1 });
    expect(await lead(sub)).toEqual({ status: 'stopped', skip_reason: 'suppressed' });
    const other = await seedLead(db.sql, own, two, { address: 'it@endress.com', nextSendAt: minutes(35) });
    await db.sql`update campaign_leads set domain = 'endress.de' where id = ${other}`;
    expect(await sendTick(deps, minutes(40))).toMatchObject({ sent: 0, stopped: 1 });
  });

  it("records an opt-out from a product's campaign for that product", async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    await withProduct(c, EXIT1);
    const l = await seedLead(db.sql, c, mb, { address: 'jane@acme.co.uk' });
    await endLead(db.sql, l, 'opted_out', NOW);
    await endLead(db.sql, l, 'bounced', NOW);
    const rows = await db.sql<{ sender: string; reason: string }[]>`select sender, reason from send_suppressions order by reason`;
    expect(rows).toEqual([
      { sender: '', reason: 'bounce' },
      { sender: 'exit1.dev', reason: 'unsubscribe' },
    ]);
  });
});

describe('pools', () => {
  it("stops a pool's mailboxes at the pool's daily cap", async () => {
    const a = await seedMailbox(db.sql, secrets, { address: 'a@sender.io' });
    const b = await seedMailbox(db.sql, secrets, { address: 'b@sender.io' });
    await db.sql`insert into send_pools (clerk_user_id, name, daily_cap) values ('u1', 'zoho', 1)`;
    await db.sql`update mailboxes set pool = 'zoho'`;
    const c = await seedCampaign(db.sql, [a, b]);
    await seedLead(db.sql, c, a, { address: 'one@acme.co.uk' });
    await seedLead(db.sql, c, b, { address: 'two@other.co.uk' });

    expect((await sendTick(deps, NOW)).sent).toBe(1);
    expect((await sendTick(deps, minutes(10))).sent).toBe(0);
    await db.sql`update send_pools set daily_cap = 2`;
    expect((await sendTick(deps, minutes(20))).sent).toBe(1);
  });
});

describe('recheck', () => {
  it('sends while the problem is there and stops a lead once the site is fixed or gone', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    await db.sql`update mailboxes set signature = ''`;
    const c = await seedCampaign(db.sql, [mb]);
    await withProduct(c, EXIT1);
    const broken = await seedLead(db.sql, c, mb, { address: 'info@broken.com' });
    const fixed = await seedLead(db.sql, c, mb, { address: 'info@fixed.com', nextSendAt: new Date('2026-01-02T00:00:00Z') });
    const gone = await seedLead(db.sql, c, mb, { address: 'info@gone.com', nextSendAt: new Date('2026-01-03T00:00:00Z') });
    const seen: Record<string, RecheckResult> = { 'broken.com': 'problem', 'fixed.com': 'resolved', 'gone.com': 'unreachable' };
    const asked: string[] = [];
    deps.recheckSsl = async (domain) => {
      asked.push(domain);
      return seen[domain]!;
    };

    expect((await sendTick(deps, NOW)).sent).toBe(1);
    // The signature falls back to the product's site, not the account's.
    expect(fake.sent[0]!.text).toContain('Mo\nexit1.dev');
    expect(await lead(broken)).toMatchObject({ status: 'active' });
    await sendTick(deps, minutes(10));
    await sendTick(deps, minutes(20));
    expect(await lead(fixed)).toEqual({ status: 'stopped', skip_reason: 'resolved' });
    // A site that does not answer is asked again later, and given up on after three days.
    expect(await lead(gone)).toEqual({ status: 'queued', skip_reason: null });
    const [later] = await db.sql<{ next_send_at: Date }[]>`select next_send_at from campaign_leads where id = ${gone}`;
    expect(later!.next_send_at.getTime()).toBeGreaterThanOrEqual(minutes(20).getTime() + 6 * 3_600_000);
    await db.sql`update campaign_leads set written_at = ${new Date(NOW.getTime() - 4 * 86_400_000)}, next_send_at = ${minutes(25)} where id = ${gone}`;
    await sendTick(deps, minutes(30));
    expect(await lead(gone)).toEqual({ status: 'stopped', skip_reason: 'unreachable' });
    expect(fake.sent).toHaveLength(1);
    expect(asked).toEqual(['broken.com', 'fixed.com', 'gone.com', 'gone.com']);
  });

  it('leaves campaigns without a recheck alone', async () => {
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    await withProduct(c, { ...EXIT1, recheck: null });
    await seedLead(db.sql, c, mb, { address: 'info@broken.com' });
    deps.recheckSsl = async () => {
      throw new Error('not asked');
    };
    expect((await sendTick(deps, NOW)).sent).toBe(1);
  });
});
