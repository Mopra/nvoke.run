import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiError, type Ai, type StructuredRequest } from '../ai/client.js';
import { addressHash } from '../leads/suppression.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { claim } from '../worker/queue.js';
import { createFakeTransport, type FakeTransport } from './fake-transport.js';
import { fallbackReply, listCsv, replyProblem, runFulfilJob, type FulfilDeps, type ReadReply } from './fulfil.js';
import { handleMail, pollTick, type PollDeps } from './poller.js';
import { sendTick, type SendDeps } from './sender.js';
import type { MailboxRow } from './mailboxes.js';
import type { IncomingMail } from './types.js';
import { seedCampaign, seedLead, seedMailbox, silentLog, testSecrets } from './test-seed.js';

let db: TestDb;
let fake: FakeTransport;
let send: SendDeps;
let poll: PollDeps;
let fulfil: FulfilDeps;
let calls: StructuredRequest<never>[];
let reading: ReadReply | Error;
let written: string | Error;
const secrets = testSecrets();
const NOW = new Date('2026-10-20T12:00:00Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const yes: ReadReply = {
  accepts: true,
  why: 'They said yes and asked for Germany.',
  buyers: 'owners of independent dental clinics in Germany',
  description: 'Owners and managing dentists of independent dental clinics.',
  product: 'Booking software for dental clinics.',
  countries: ['de', 'XX1'],
  locations: [],
};

const ai: Ai = {
  ready: async () => true,
  async structured(req) {
    calls.push(req as StructuredRequest<never>);
    const answer = req.toolName === 'save_reading' ? reading : written instanceof Error ? written : { body: written };
    if (answer instanceof Error) throw answer;
    return { data: req.schema.parse(answer), model: 'fake', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 };
  },
};

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, suppressions, email_checks, jobs cascade`;
  fake = createFakeTransport();
  calls = [];
  reading = yes;
  written =
    'Hi Jane,\n\nHere is the list: 2 owners of independent dental clinics in Germany, one per company, attached as a CSV. Each work email was checked against the company mail server. It is fewer than the 40 I offered. You can run your own at nvoke.run with 50 verified emails a month free.';
  send = { sql: db.sql, secrets, transport: fake.factory, log: silentLog, publicApiUrl: 'https://api.nvoke.test', enabled: true, users: ['u1'] };
  poll = { sql: db.sql, secrets, transport: fake.factory, log: silentLog, enabled: true, users: ['u1'] };
  fulfil = { sql: db.sql, ai, log: silentLog, secrets, transport: fake.factory, publicApiUrl: 'https://api.nvoke.test', users: ['u1'] };
});

let uid = 0;
function mail(o: Partial<IncomingMail>): IncomingMail {
  uid += 1;
  return {
    folder: 'INBOX',
    uid,
    messageId: `<in-${uid}@acme.co.uk>`,
    inReplyTo: null,
    references: [],
    from: 'jane@acme.co.uk',
    to: ['me@sender.io'],
    subject: 'Re: Subject 1',
    text: 'Yes please, focus on Germany.',
    headers: {},
    deliveryStatus: null,
    date: later(30),
    ...o,
  };
}

/** A fulfil campaign with step 1 sent to one lead. */
async function sentLead(o: { fulfil?: boolean } = {}) {
  const mb = await seedMailbox(db.sql, secrets);
  const c = await seedCampaign(db.sql, [mb]);
  if (o.fulfil !== false) await db.sql`update campaigns set fulfil = 'buyer_list' where id = ${c}`;
  const l = await seedLead(db.sql, c, mb, { address: 'jane@acme.co.uk' });
  await sendTick(send, NOW);
  return { mb, c, l, sentId: fake.sent[0]!.messageId };
}

async function replyWith(sentId: string, o: Partial<IncomingMail> = {}) {
  const m = mail({ inReplyTo: sentId, references: [sentId], ...o });
  fake.inbox.push(m);
  await db.sql`update mailboxes set last_poll_at = null`;
  await pollTick(poll, later(40 + uid));
  return m;
}

async function fulfilment() {
  const rows = await db.sql<{ id: string; state: string; search_id: string | null; market: string | null; people: number | null; error: string | null; params: unknown }[]>`
    select id, state, search_id, market, people, error, params from fulfilments`;
  return rows;
}

/** Runs every queued fulfil job once, whenever it was due. */
async function runJobs(): Promise<number> {
  await db.sql`update jobs set run_after = now() - interval '1 second' where type = 'fulfil' and status = 'queued'`;
  const jobs = await claim(db.sql, { workerId: 't', limit: 10, types: ['fulfil'] });
  for (const job of jobs) {
    await runFulfilJob(fulfil, job);
    await db.sql`update jobs set status = 'done' where id = ${job.id} and status = 'running'`;
  }
  return jobs.length;
}

/** Fills the fulfilment's search with people and ends it. */
async function finishSearch(searchId: string, people: Array<{ domain: string; first?: string | null; verification?: string; seniority?: string; address?: string }>) {
  for (const p of people) {
    const [company] = await db.sql<{ id: string }[]>`
      insert into companies (search_id, clerk_user_id, name, domain, website, source)
      values (${searchId}, 'u1', ${`Clinic ${p.domain}`}, ${p.domain}, ${`https://${p.domain}/`}, 'test')
      on conflict (search_id, domain) do update set name = excluded.name
      returning id`;
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, first_name, last_name, title, seniority, source_url)
      values (${company!.id}, ${searchId}, 'u1', ${p.address ?? `${(p.first ?? 'info').toLowerCase()}@${p.domain}`}, 'personal',
        ${p.verification ?? 'valid'}, ${p.first === undefined ? 'Anna' : p.first}, 'Berg', 'Owner', ${p.seniority ?? 'founder'}, ${`https://${p.domain}/team`})`;
  }
  await db.sql`update searches set status = 'done', finished_at = now() where id = ${searchId}`;
}

describe('fulfil: reading the reply', () => {
  it('queues one fulfilment for a reply on a fulfil campaign, however often the mail or a new reply is read', async () => {
    const { mb, sentId } = await sentLead();
    const m = await replyWith(sentId);
    expect(await fulfilment()).toMatchObject([{ state: 'pending' }]);

    // The same mail read again, and another reply while the first is pending.
    const [box] = await db.sql<MailboxRow[]>`select * from mailboxes where id = ${mb}`;
    expect(await db.sql.begin((tx) => handleMail(tx, box!, m, later(60)))).toBe('ignored');
    await replyWith(sentId, { text: 'Also Austria if you can.' });
    expect(await fulfilment()).toHaveLength(1);
    const [jobs] = await db.sql<{ n: number }[]>`select count(*)::int as n from jobs where type = 'fulfil'`;
    expect(jobs!.n).toBe(1);
  });

  it('queues nothing for an opt-out, or on a campaign without fulfil', async () => {
    const { sentId } = await sentLead();
    await replyWith(sentId, { text: 'Please remove me from your list.' });
    expect(await fulfilment()).toEqual([]);

    await db.sql`truncate accounts, jobs cascade`;
    fake.sent.length = 0;
    const other = await sentLead({ fulfil: false });
    await replyWith(other.sentId);
    expect(await fulfilment()).toEqual([]);
  });

  it('declines a reply that is not a yes, and reads again when a later reply comes', async () => {
    const { sentId } = await sentLead();
    reading = { ...yes, accepts: false, why: 'A question without a yes.' };
    await replyWith(sentId, { text: 'How does this work?' });
    expect(await runJobs()).toBe(1);
    expect(await fulfilment()).toMatchObject([{ state: 'declined', search_id: null }]);
    expect(calls.map((c) => c.task)).toEqual(['fulfil_read']);
    // The thread and the reply are in the prompt.
    expect(calls[0]!.prompt).toContain('Hi Jane, body 1.');
    expect(calls[0]!.prompt).toContain('How does this work?');

    reading = yes;
    await replyWith(sentId, { text: 'Ok, yes, go ahead.' });
    expect(await fulfilment()).toMatchObject([{ state: 'pending' }]);
    await runJobs();
    const [f] = await fulfilment();
    expect(f).toMatchObject({ state: 'searching', market: yes.buyers });
    expect(f!.params).toMatchObject({ kind: 'icp', params: { description: yes.description, product: yes.product, countries: ['de'] } });
    expect(fake.sent).toHaveLength(1);
  });
});

describe('fulfil: the list', () => {
  it('runs the search as the owner and replies in the thread with the CSV, once', async () => {
    const { l, sentId } = await sentLead();
    const reply = await replyWith(sentId);
    await runJobs(); // reads: a yes
    let [f] = await fulfilment();
    expect(f!.state).toBe('searching');
    // The yes was read and the search started in the same run.
    expect(f!.search_id).not.toBeNull();
    const [s] = await db.sql<{ clerk_user_id: string; kind: string; limit: number; status: string }[]>`
      select clerk_user_id, kind, "limit", status from searches where id = ${f!.search_id}`;
    expect(s).toMatchObject({ clerk_user_id: 'u1', kind: 'icp', limit: 130, status: 'queued' });

    // Still running with too few: it waits.
    await runJobs();
    expect(fake.sent).toHaveLength(1);

    await finishSearch(f!.search_id!, [
      { domain: 'smile.de', first: 'Anna' },
      { domain: 'smile.de', first: 'Bo', seniority: 'staff' },
      { domain: 'teeth.de', first: 'Carl' },
      { domain: 'nameless.de', first: null },
      { domain: 'bad.de', first: 'Dora', verification: 'invalid' },
      { domain: 'acme.co.uk', first: 'Self' },
      { domain: '=evil.de', first: '=cmd' },
    ]);
    await db.sql`insert into suppressions (hash, kind, source) values (${addressHash('=cmd@=evil.de')}, 'address', 'unsubscribe')`;
    await runJobs();

    expect(fake.sent).toHaveLength(2);
    const out = fake.sent[1]!;
    expect(out.from).toBe('me@sender.io');
    expect(out.to).toBe('jane@acme.co.uk');
    expect(out.subject).toBe('Re: Subject 1');
    expect(out.inReplyTo).toBe(reply.messageId);
    expect(out.references).toEqual([sentId, reply.messageId]);
    expect(out.text.startsWith('Hi Jane,')).toBe(true);
    expect(out.text).toMatch(/Mo\nSender ApS$/);
    expect(out.attachments).toHaveLength(1);
    const csv = out.attachments![0]!.content;
    expect(out.attachments![0]!.contentType).toBe('text/csv; charset=utf-8');
    const lines = csv.replace(String.fromCharCode(0xfeff), '').trim().split('\r\n');
    expect(lines[0]).toBe('name,title,company,domain,email,source_page');
    expect(lines.slice(1)).toEqual([
      'Anna Berg,Owner,Clinic smile.de,smile.de,anna@smile.de,https://smile.de/team',
      'Carl Berg,Owner,Clinic teeth.de,teeth.de,carl@teeth.de,https://teeth.de/team',
    ]);

    [f] = await fulfilment();
    expect(f).toMatchObject({ state: 'sent', people: 2, error: null });
    const [row] = await db.sql<{ direction: string; kind: string; message_id: string; in_reply_to: string; body_text: string; campaign_lead_id: string }[]>`
      select direction, kind, message_id, in_reply_to, body_text, campaign_lead_id from messages where kind = 'other'`;
    expect(row).toMatchObject({ direction: 'out', kind: 'other', message_id: out.messageId, in_reply_to: reply.messageId, campaign_lead_id: l });
    expect(row!.body_text).toBe(out.text);
    expect(calls.map((c) => c.task)).toEqual(['fulfil_read', 'fulfil_reply']);
    expect(calls[1]!.prompt).toContain('2 people');

    // Again and again: nothing more goes out.
    await replyWith(sentId, { text: 'Thanks, got it.' });
    expect(await runJobs()).toBe(0);
    expect(fake.sent).toHaveLength(2);
  });

  it('with nobody found, says so and asks one question, with no file', async () => {
    const { sentId } = await sentLead();
    await replyWith(sentId);
    await runJobs();
    const [f] = await fulfilment();
    await finishSearch(f!.search_id!, []);
    written = new AiError('unavailable', 'no key');
    await runJobs();
    expect(fake.sent).toHaveLength(2);
    const out = fake.sent[1]!;
    expect(out.attachments).toBeUndefined();
    expect(out.text).toContain('found nobody it could verify for that market');
    expect(out.text).toContain('?');
    expect(await fulfilment()).toMatchObject([{ state: 'sent', people: 0 }]);
  });

  it('stops a search that runs too long and sends what it holds', async () => {
    const { sentId } = await sentLead();
    await replyWith(sentId);
    await runJobs();
    const [f] = await fulfilment();
    await finishSearch(f!.search_id!, [{ domain: 'smile.de', first: 'Anna' }]);
    await db.sql`update searches set status = 'running', created_at = now() - interval '7 hours' where id = ${f!.search_id}`;
    written = 'Hi Jane,\n\nHere is what there is: 1 owner of an independent dental clinic in Germany, attached as a CSV. Its work email was checked against the company mail server. It is far fewer than 40. You can run your own at nvoke.run with 50 verified emails a month free.';
    await runJobs();
    const [s] = await db.sql<{ status: string }[]>`select status from searches where id = ${f!.search_id}`;
    expect(s!.status).toBe('canceled');
    expect(fake.sent).toHaveLength(2);
    expect(await fulfilment()).toMatchObject([{ state: 'sent', people: 1 }]);
  });

  it('sends nothing to a lead suppressed after the yes', async () => {
    const { sentId } = await sentLead();
    await replyWith(sentId);
    await runJobs();
    const [f] = await fulfilment();
    await finishSearch(f!.search_id!, [{ domain: 'smile.de', first: 'Anna' }]);
    await db.sql`insert into send_suppressions (clerk_user_id, hash, reason) values ('u1', ${addressHash('jane@acme.co.uk')}, 'unsubscribe')`;
    await runJobs();
    expect(fake.sent).toHaveLength(1);
    expect(await fulfilment()).toMatchObject([{ state: 'failed', error: 'the lead is suppressed' }]);
  });

  it('waits for room when the mailbox has used its daily cap', async () => {
    const { mb, sentId } = await sentLead();
    await replyWith(sentId);
    await runJobs();
    const [f] = await fulfilment();
    await finishSearch(f!.search_id!, [{ domain: 'smile.de', first: 'Anna' }]);
    await db.sql`update mailboxes set daily_cap = 1, last_send_at = null where id = ${mb}`;
    await db.sql`update messages set at = now() where direction = 'out'`;
    await runJobs();
    expect(fake.sent).toHaveLength(1);
    expect(await fulfilment()).toMatchObject([{ state: 'searching' }]);
    const [job] = await db.sql<{ status: string; run_after: Date }[]>`select status, run_after from jobs where type = 'fulfil'`;
    expect(job!.status).toBe('queued');
    expect(job!.run_after.getTime()).toBeGreaterThan(Date.now() + 20 * 60_000);
  });
});

describe('fulfil: the words', () => {
  it('checks a written reply and falls back to plain words', () => {
    expect(replyProblem('Hi Jane,\n\nHere are 12 people! nvoke.run', { firstName: 'Jane', count: 12 })).toMatch(/exclamation/);
    expect(replyProblem('Hello,\n\nHere are 12 people. nvoke.run', { firstName: 'Jane', count: 12 })).toMatch(/first name/);
    expect(replyProblem('Hi Jane,\n\nHere are twelve people. nvoke.run', { firstName: 'Jane', count: 12 })).toMatch(/digits/);
    expect(replyProblem('Hi Jane,\n\nNobody found.', { firstName: 'Jane', count: 0 })).toMatch(/question/);
    for (const count of [0, 3, 40]) {
      const text = fallbackReply({ firstName: 'Jane', buyers: 'owners of dental clinics', count });
      expect(replyProblem(text, { firstName: 'Jane', count })).toBeNull();
      for (const code of [0x2013, 0x2014]) expect(text).not.toContain(String.fromCharCode(code));
    }
  });

  it('writes the CSV with formulas neutralized', () => {
    const csv = listCsv([{ name: '=HYPERLINK("x")', title: null, company: 'A, B', domain: 'a.de', email: 'a@a.de', source_page: null }]);
    expect(csv.split('\r\n')[1]).toBe(`"'=HYPERLINK(""x"")",,"A, B",a.de,a@a.de,`);
  });
});
