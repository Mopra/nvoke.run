import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureAccount } from '../leads/quota.js';
import { addressHash, domainHash } from '../leads/suppression.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { collectOptOuts, importOptOuts } from './opt-out-import.js';

// Shaped like the owner's own outreach files (mrr/outreach and mrr/leads).
const SENT_CSV = [
  '2026-10-15T07:49:33.205Z,agency-note,client,sterrific@hotmail.com,user_37xC0HeRHAejzf8GUFJ69DvHD5I,200',
  '2026-10-15T07:49:40.027Z,agency-note,own,Marketing@EimServices.ca,user_35VCwKyHyGB22UzDkHxUx1qCDYj,200',
  '2026-10-15T17:34:05Z,beehiiv-oneclick,zoho-day3,wacobuzz@gmail.com,,sent,optout',
].join('\n');

const DO_NOT_CONTACT = [
  '# Never email these addresses or domains again, on any channel.',
  '# One per line. A bare domain blocks every address at it.',
  'cchomenurses.com',
  'someone@literaturecambridge.co.uk  # asked on the phone',
  '',
  'not a domain',
].join('\r\n');

const DRAFTS = JSON.stringify([
  {
    to: 'hello@ttrpgkids.com',
    from: 'morten@day3.app',
    subject: 'Your monthly issue',
    text: 'Write to me at morten@day3.app or reply.',
    source_url: 'https://ttrpgkids-newsletter.beehiiv.com',
  },
  { to: 'Info@DeltaCoastLLC.com', from: 'morten@exit1.dev', domain: 'deltacoastllc.com', cc: 'owner@deltacoastllc.com', send_on: '2026-10-22' },
]);

describe('collectOptOuts', () => {
  it('reads addresses from CSV cells, lines and bare domains from text, and to fields from drafts', () => {
    const out = collectOptOuts([
      { name: 'outreach/sent.csv', text: SENT_CSV },
      { name: 'outreach/do-not-contact.txt', text: DO_NOT_CONTACT },
      { name: 'leads/drafts-2026-10-22.json', text: DRAFTS },
    ]);
    expect([...out.addresses].sort()).toEqual([
      'hello@ttrpgkids.com',
      'info@deltacoastllc.com',
      'marketing@eimservices.ca',
      'owner@deltacoastllc.com',
      'someone@literaturecambridge.co.uk',
      'sterrific@hotmail.com',
      'wacobuzz@gmail.com',
    ]);
    expect([...out.domains]).toEqual(['cchomenurses.com']);
  });
});

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
  await ensureAccount(db.sql, 'u1');
});

describe('importOptOuts', () => {
  it('stores manual opt-outs per sender, and the --domain ones for every sender, once', async () => {
    const optOuts = { addresses: new Set(['a@x.com', 'morten@day3.app']), domains: new Set(['blocked.com']) };
    const first = await importOptOuts(db.sql, 'u1', optOuts, ['day3.app', 'Exit1.dev'], ['endress.com']);
    expect(first).toEqual({
      'day3.app': { addresses: 1, domains: 1, added: 2 },
      'exit1.dev': { addresses: 1, domains: 1, added: 2 },
      '': { addresses: 0, domains: 1, added: 1 },
    });
    const rows = await db.sql<{ sender: string; hash: string; reason: string }[]>`
      select sender, hash, reason from send_suppressions where clerk_user_id = 'u1' order by sender, hash`;
    const expected = [
      { sender: '', hash: domainHash('endress.com'), reason: 'manual' },
      ...['day3.app', 'exit1.dev'].flatMap((sender) =>
        [addressHash('a@x.com'), domainHash('blocked.com')].sort().map((hash) => ({ sender, hash, reason: 'manual' })),
      ),
    ];
    expect(rows).toEqual(expected);

    const again = await importOptOuts(db.sql, 'u1', optOuts, ['day3.app', 'exit1.dev'], ['endress.com']);
    expect(Object.values(again).map((c) => c.added)).toEqual([0, 0, 0]);
  });
});
