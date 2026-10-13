import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAlerter, DAY3_EMAILS_URL } from './alerts.js';
import { createTestDb, type TestDb } from './testing/db.js';
import { fakeFetch, silentLog } from './testing/fakes.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate alerts_sent`;
});

const NOW = new Date('2026-10-13T12:00:00Z');

describe('alerts', () => {
  it('emails through Day3 at most once per interval per key', async () => {
    const fetch = fakeFetch({ [DAY3_EMAILS_URL]: { status: 200, body: '{"id":"eml_1"}' } });
    let now = NOW;
    const alerter = createAlerter({ sql: db.sql, log: silentLog, apiKey: 'day3_test', to: ['ops@nvoke.run'], from: 'nvoke <alerts@nvoke.run>', fetch, now: () => now });
    const alert = { key: 'source-unavailable:brave', subject: 'brave is refusing searches', text: 'details' };

    expect(await alerter.send(alert)).toBe(true);
    expect(await alerter.send(alert)).toBe(false);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]!.headers.authorization).toBe('Bearer day3_test');
    expect(JSON.parse(fetch.calls[0]!.body!)).toEqual({
      from: 'nvoke <alerts@nvoke.run>',
      to: ['ops@nvoke.run'],
      subject: '[nvoke] brave is refusing searches',
      text: 'details',
    });

    now = new Date(NOW.getTime() + 61 * 60_000);
    expect(await alerter.send(alert)).toBe(true);
    expect(await alerter.send({ ...alert, key: 'other' })).toBe(true);
    expect(fetch.calls).toHaveLength(3);
  });

  it('only logs without a Day3 key, and never throws when Day3 fails', async () => {
    const quiet = createAlerter({ sql: db.sql, log: silentLog, to: ['ops@nvoke.run'], from: 'a@b.c', now: () => NOW });
    expect(await quiet.send({ key: 'a', subject: 's', text: 't' })).toBe(false);

    const down = fakeFetch({ [DAY3_EMAILS_URL]: { status: 500, body: 'down' } });
    const failing = createAlerter({ sql: db.sql, log: silentLog, apiKey: 'k', to: ['ops@nvoke.run'], from: 'a@b.c', fetch: down, now: () => NOW });
    expect(await failing.send({ key: 'b', subject: 's', text: 't' })).toBe(false);
  });
});
