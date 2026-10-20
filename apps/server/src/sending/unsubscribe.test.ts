import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { addressHash } from '../leads/suppression.js';
import { createFakeTransport } from './fake-transport.js';
import { footer, withFooter } from './footer.js';
import { sendTick } from './sender.js';
import { readUnsubscribe, signUnsubscribe, unsubscribeByMessage } from './unsubscribe.js';
import { seedCampaign, seedLead, seedMailbox, silentLog, testSecrets } from './test-seed.js';

let db: TestDb;
const secrets = testSecrets();
const ID = '3f6da89e-5f16-4921-9a64-f7987d47af45';

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
});

describe('unsubscribe tokens', () => {
  it('round trips the message id', () => {
    const token = signUnsubscribe(secrets, ID);
    expect(token.startsWith(`${ID}.`)).toBe(true);
    expect(readUnsubscribe(secrets, token)).toBe(ID);
  });

  it('refuses a tampered, moved or foreign token', () => {
    const token = signUnsubscribe(secrets, ID);
    const other = '00000000-0000-4000-8000-000000000000';
    expect(readUnsubscribe(secrets, `${other}${token.slice(ID.length)}`)).toBeNull();
    const at = ID.length + 5;
    const flipped = `${token.slice(0, at)}${token[at] === 'A' ? 'B' : 'A'}${token.slice(at + 1)}`;
    expect(readUnsubscribe(secrets, flipped)).toBeNull();
    expect(readUnsubscribe(secrets, `${token}x`)).toBeNull();
    expect(readUnsubscribe(secrets, ID)).toBeNull();
    expect(readUnsubscribe(secrets, 'not-a-uuid.abc')).toBeNull();
    expect(readUnsubscribe(testSecrets(), token)).toBeNull();
  });

  it('ends the lead and suppresses the address for that sender, once', async () => {
    const fake = createFakeTransport();
    const mb = await seedMailbox(db.sql, secrets);
    const c = await seedCampaign(db.sql, [mb]);
    const l = await seedLead(db.sql, c, mb, { address: 'jane@acme.co.uk' });
    await sendTick({ sql: db.sql, secrets, transport: fake.factory, log: silentLog, publicApiUrl: 'https://api.nvoke.test', enabled: true }, new Date('2026-10-20T12:00:00Z'));
    const token = /\/u\/([^>]+)>/.exec(fake.sent[0]!.headers['List-Unsubscribe']!)![1]!;
    const messageId = readUnsubscribe(secrets, token)!;

    expect(await unsubscribeByMessage(db.sql, messageId)).toBe(true);
    expect(await unsubscribeByMessage(db.sql, messageId)).toBe(true);
    const [row] = await db.sql<{ status: string; next_send_at: Date | null }[]>`select status, next_send_at from campaign_leads where id = ${l}`;
    expect(row).toEqual({ status: 'opted_out', next_send_at: null });
    const [camp] = await db.sql<{ opted_out: number }[]>`select opted_out from campaigns where id = ${c}`;
    expect(camp!.opted_out).toBe(1);
    const sup = await db.sql`select reason from send_suppressions where clerk_user_id = 'u1' and hash = ${addressHash('jane@acme.co.uk')}`;
    expect(sup).toEqual([{ reason: 'unsubscribe' }]);
    // The global list is for the opt-out page; one sender's link does not erase the lead elsewhere.
    expect(await db.sql`select 1 from suppressions`).toHaveLength(0);

    expect(await unsubscribeByMessage(db.sql, '00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(await unsubscribeByMessage(db.sql, 'nope')).toBe(false);
  });
});

describe('footer', () => {
  it('signs with the signature, else the display name, and says why and how to stop', () => {
    expect(footer({ signature: '', displayName: 'Mo', domain: 'acme.com' })).toBe(
      "Mo\n\nI found your address on acme.com's website. Reply stop and I will not write again.",
    );
    expect(withFooter('Hi.\n\n', { signature: 'Mo\nnvoke', displayName: 'Mo', domain: 'acme.com', unsubscribeUrl: 'https://x/u/t' })).toBe(
      "Hi.\n\nMo\nnvoke\n\nI found your address on acme.com's website. Reply stop and I will not write again.",
    );
  });
});
