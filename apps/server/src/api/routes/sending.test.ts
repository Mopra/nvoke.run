import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Campaign,
  CampaignLead,
  CampaignLeadDetail,
  CampaignLeadListResponse,
  CampaignListResponse,
  Mailbox,
  MailboxListResponse,
  ReplyListResponse,
  SendingSummary,
  WrittenStep,
} from '@nvoke/shared';
import { createSecrets } from '../../crypto/secrets.js';
import { ensureAccount } from '../../leads/quota.js';
import { createFakeTransport } from '../../sending/fake-transport.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { silentLog } from '../../testing/fakes.js';
import type { AuthDns } from '../../tools/email-auth.js';
import type { AuthContext } from '../auth.js';
import { sendingRoutes } from './sending.js';

let db: TestDb;
let app: FastifyInstance;
let off: FastifyInstance;
const fake = createFakeTransport();
const secrets = createSecrets(randomBytes(32).toString('base64'));
/** No DNS records anywhere, so the mailbox check never reaches real DNS. */
const nodata = () => Object.assign(new Error('nodata'), { code: 'ENODATA' });
const authDns: AuthDns = {
  resolveMx: async () => { throw nodata(); },
  resolve4: async () => { throw nodata(); },
  resolve6: async () => { throw nodata(); },
  resolveTxt: async () => { throw nodata(); },
};
/** Alice and Bob may send; Carol is any other account. */
const SENDING_USERS = ['alice', 'bob'];

/** x-test-user is the user, x-test-via how they signed in (an API key unless told). */
const authenticate = async (req: FastifyRequest) => {
  const user = req.headers['x-test-user'];
  if (typeof user !== 'string') return;
  req.userId = user;
  const via = (req.headers['x-test-via'] as AuthContext['via'] | undefined) ?? 'api_key';
  req.auth = { userId: user, via, sessionId: null, deviceSessionId: null, apiKeyId: null };
};

beforeAll(async () => {
  db = await createTestDb();
  app = Fastify();
  await app.register(sendingRoutes, { prefix: '/v1', getSql: () => db.sql, authenticate, secrets, enabled: true, transport: fake.factory, log: silentLog, users: SENDING_USERS, authDns });
  await app.ready();
  off = Fastify();
  await off.register(sendingRoutes, { prefix: '/v1', getSql: () => db.sql, authenticate, secrets: null, enabled: true, transport: fake.factory, log: silentLog, users: SENDING_USERS, authDns });
  await off.ready();
});

afterAll(async () => {
  await app.close();
  await off.close();
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
  await ensureAccount(db.sql, 'alice');
  await ensureAccount(db.sql, 'bob');
  await ensureAccount(db.sql, 'carol');
  fake.checkResult = { ok: true };
});

const as = (user: string, via: AuthContext['via'] = 'api_key') => ({ 'x-test-user': user, 'x-test-via': via });

const mailboxBody = {
  address: 'Ada@Acme.io',
  displayName: 'Ada Acme',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  password: 'abcd efgh ijkl mnop',
};

async function connect(user = 'alice', body: object = mailboxBody) {
  return app.inject({ method: 'POST', url: '/v1/mailboxes', headers: as(user), payload: body });
}

async function search(user = 'alice') {
  const [s] = await db.sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, "limit") values (${user}, 'icp', 10) returning id`;
  return s!.id;
}

const steps = [
  { waitDays: 0, brief: 'The problem and our offer.' },
  { waitDays: 3, brief: 'A short bump.' },
];

/** An autopilot campaign on an empty search: nothing to write, so it waits in review. */
async function campaign(user = 'alice') {
  const mailbox = Mailbox.parse((await connect(user)).json());
  const res = await app.inject({
    method: 'POST',
    url: '/v1/campaigns',
    headers: as(user),
    payload: { name: 'Agencies', source: 'search', searchId: await search(user), steps, mailboxIds: [mailbox.id] },
  });
  expect(res.statusCode).toBe(201);
  return { campaign: Campaign.parse(res.json()), mailbox };
}

/** A lead with written steps, as enroll and the write job leave it. */
async function lead(campaignId: string, mailboxId: string, user = 'alice') {
  const [l] = await db.sql<{ id: string }[]>`
    insert into campaign_leads (campaign_id, clerk_user_id, address, first_name, last_name, company_name, domain, mailbox_id, status, written_at)
    values (${campaignId}, ${user}, 'jo@client.io', 'Jo', 'Client', 'Client Co', 'client.io', ${mailboxId}, 'queued', now())
    returning id`;
  await db.sql`
    insert into campaign_steps_written (campaign_lead_id, step, subject, body)
    values (${l!.id}, 1, 'Leads for Client Co', 'Hi Jo, ...'), (${l!.id}, 2, 'Re: Leads for Client Co', 'Hi again')`;
  return l!.id;
}

describe('sending routes', () => {
  it('404s every route for an account outside SENDING_USERS, as if none existed', async () => {
    const { campaign: c, mailbox } = await campaign();
    const leadId = await lead(c.id, mailbox.id);
    const routes: [string, string][] = [
      ['GET', '/v1/sending'],
      ['GET', '/v1/mailboxes'],
      ['POST', '/v1/mailboxes'],
      ['PATCH', `/v1/mailboxes/${mailbox.id}`],
      ['DELETE', `/v1/mailboxes/${mailbox.id}`],
      ['POST', `/v1/mailboxes/${mailbox.id}/check`],
      ['GET', '/v1/campaigns'],
      ['POST', '/v1/campaigns'],
      ['GET', `/v1/campaigns/${c.id}`],
      ['PATCH', `/v1/campaigns/${c.id}`],
      ['DELETE', `/v1/campaigns/${c.id}`],
      ['POST', `/v1/campaigns/${c.id}/start`],
      ['POST', `/v1/campaigns/${c.id}/pause`],
      ['POST', `/v1/campaigns/${c.id}/resume`],
      ['GET', `/v1/campaigns/${c.id}/leads`],
      ['GET', `/v1/campaigns/${c.id}/leads/${leadId}`],
      ['PATCH', `/v1/campaigns/${c.id}/leads/${leadId}/steps/1`],
      ['POST', `/v1/campaigns/${c.id}/leads/${leadId}/stop`],
      ['GET', '/v1/replies'],
      ['POST', `/v1/replies/${leadId}/read`],
    ];
    for (const server of [app, off]) {
      for (const [method, url] of routes) {
        for (const via of ['api_key', 'clerk'] as const) {
          const res = await server.inject({ method: method as 'GET', url, headers: as('carol', via), payload: method === 'GET' || method === 'DELETE' ? undefined : {} });
          expect(res.statusCode, `${method} ${url}`).toBe(404);
          expect(res.json()).toEqual({ error: 'not_found' });
        }
      }
    }
    // Nothing of Alice's moved.
    expect(Campaign.parse((await app.inject({ method: 'GET', url: `/v1/campaigns/${c.id}`, headers: as('alice') })).json()).status).toBe(c.status);
    expect(MailboxListResponse.parse((await app.inject({ method: 'GET', url: '/v1/mailboxes', headers: as('alice') })).json()).mailboxes).toHaveLength(1);
  });

  it('401s without a user and 503s without SECRETS_KEY, the summary aside', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/mailboxes' })).statusCode).toBe(401);
    const res = await off.inject({ method: 'GET', url: '/v1/campaigns', headers: as('alice') });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'sending_unavailable' });
    const summary = SendingSummary.parse((await off.inject({ method: 'GET', url: '/v1/sending', headers: as('alice') })).json());
    expect(summary.available).toBe(false);
  });

  it('connects, lists, updates, checks and deletes mailboxes, scoped to the owner', async () => {
    const res = await connect();
    expect(res.statusCode).toBe(201);
    const mailbox = Mailbox.parse(res.json());
    expect(mailbox).toMatchObject({ address: 'ada@acme.io', status: 'checking' });
    expect(JSON.stringify(res.json())).not.toContain('abcd');

    const again = await connect();
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('mailbox_exists');
    expect((await connect('alice', { ...mailboxBody, smtpPort: 0 })).statusCode).toBe(400);

    const url = `/v1/mailboxes/${mailbox.id}`;
    fake.checkResult = { ok: false, step: 'smtp', kind: 'auth', message: '535 bad credentials' };
    const checked = Mailbox.parse((await app.inject({ method: 'POST', url: `${url}/check`, headers: as('alice') })).json());
    expect(checked.status).toBe('error');
    expect(checked.statusReason).toBeTruthy();
    expect(checked.emailAuth).toMatchObject({ spf: { grade: 'fail' }, dmarc: { grade: 'fail' } });

    expect((await app.inject({ method: 'PATCH', url, headers: as('bob'), payload: { dailyCap: 10 } })).statusCode).toBe(404);
    const patched = await app.inject({ method: 'PATCH', url, headers: as('alice'), payload: { dailyCap: 10, signature: 'Ada' } });
    expect(Mailbox.parse(patched.json())).toMatchObject({ dailyCap: 10, signature: 'Ada' });
    expect((await app.inject({ method: 'PATCH', url, headers: as('alice'), payload: { dailyCap: 51 } })).statusCode).toBe(400);

    const list = MailboxListResponse.parse((await app.inject({ method: 'GET', url: '/v1/mailboxes', headers: as('alice') })).json());
    expect(list.mailboxes.map((m) => m.id)).toEqual([mailbox.id]);
    const bobs = MailboxListResponse.parse((await app.inject({ method: 'GET', url: '/v1/mailboxes', headers: as('bob') })).json());
    expect(bobs.mailboxes).toEqual([]);

    expect((await app.inject({ method: 'DELETE', url, headers: as('bob') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url, headers: as('alice') })).statusCode).toBe(204);
    expect((await app.inject({ method: 'POST', url: `${url}/check`, headers: as('alice') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: '/v1/mailboxes/nope', headers: as('alice'), payload: { dailyCap: 5 } })).statusCode).toBe(404);
  });

  it('drafts a campaign, and only a person in the web app starts or resumes it', async () => {
    const { campaign: c, mailbox } = await campaign();
    expect(c).toMatchObject({ name: 'Agencies', source: 'search', autopilot: true, status: 'review', mailboxIds: [mailbox.id] });

    const list = CampaignListResponse.parse((await app.inject({ method: 'GET', url: '/v1/campaigns', headers: as('alice') })).json());
    expect(list.campaigns.map((x) => x.id)).toEqual([c.id]);
    expect((await app.inject({ method: 'GET', url: `/v1/campaigns/${c.id}`, headers: as('bob') })).statusCode).toBe(404);

    const url = `/v1/campaigns/${c.id}`;
    const renamed = await app.inject({ method: 'PATCH', url, headers: as('alice'), payload: { name: 'Agencies EU', dailyNew: 10 } });
    expect(Campaign.parse(renamed.json())).toMatchObject({ name: 'Agencies EU', dailyNew: 10 });

    // An API key, a desktop token or an agent's OAuth token cannot start it.
    for (const via of ['api_key', 'device', 'oauth'] as const) {
      const res = await app.inject({ method: 'POST', url: `${url}/start`, headers: as('alice', via) });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'session_required' });
    }
    expect((await app.inject({ method: 'POST', url: `${url}/start`, headers: as('bob', 'clerk') })).statusCode).toBe(404);
    const started = Campaign.parse((await app.inject({ method: 'POST', url: `${url}/start`, headers: as('alice', 'clerk') })).json());
    expect(started.status).toBe('scheduled');
    expect(Date.parse(started.reviewUntil!)).toBeGreaterThan(Date.now());

    // Started, its steps and mailboxes go out unreviewed: only the person may change them.
    for (const via of ['api_key', 'device', 'oauth'] as const) {
      const res = await app.inject({ method: 'PATCH', url, headers: as('alice', via), payload: { steps: [{ waitDays: 0, brief: 'Buy now.' }] } });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'session_required' });
    }
    expect((await app.inject({ method: 'PATCH', url, headers: as('bob'), payload: { name: 'x' } })).statusCode).toBe(404);
    const byPerson = await app.inject({ method: 'PATCH', url, headers: as('alice', 'clerk'), payload: { name: 'Agencies EU 2' } });
    expect(Campaign.parse(byPerson.json())).toMatchObject({ name: 'Agencies EU 2', status: 'scheduled' });

    const twice = await app.inject({ method: 'POST', url: `${url}/start`, headers: as('alice', 'clerk') });
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({ error: 'bad_state', detail: expect.any(String) });

    // Pausing is fine from anywhere; resuming takes the person again.
    expect(Campaign.parse((await app.inject({ method: 'POST', url: `${url}/pause`, headers: as('alice') })).json()).status).toBe('paused');
    expect((await app.inject({ method: 'POST', url: `${url}/resume`, headers: as('alice') })).statusCode).toBe(403);
    expect(Campaign.parse((await app.inject({ method: 'POST', url: `${url}/resume`, headers: as('alice', 'clerk') })).json()).status).toBe('scheduled');

    expect((await app.inject({ method: 'DELETE', url, headers: as('bob') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url, headers: as('alice') })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url, headers: as('alice') })).statusCode).toBe(404);
  });

  it('refuses a campaign with bad input or someone else’s mailbox', async () => {
    const mailbox = Mailbox.parse((await connect('bob')).json());
    const searchId = await search();
    const post = (payload: object) => app.inject({ method: 'POST', url: '/v1/campaigns', headers: as('alice'), payload });
    expect((await post({ name: 'x', source: 'search', searchId, steps: [{ waitDays: 2, brief: 'b' }], mailboxIds: [mailbox.id] })).statusCode).toBe(400);
    const theirs = await post({ name: 'x', source: 'search', searchId, steps, mailboxIds: [mailbox.id] });
    expect(theirs.statusCode).toBe(400);
    expect(theirs.json().error).toBe('bad_mailbox');
  });

  it('lists leads, shows one with its emails, edits a step and stops the lead', async () => {
    const { campaign: c, mailbox } = await campaign();
    const leadId = await lead(c.id, mailbox.id);
    const base = `/v1/campaigns/${c.id}/leads`;

    const list = CampaignLeadListResponse.parse((await app.inject({ method: 'GET', url: base, headers: as('alice') })).json());
    expect(list.leads.map((l) => l.id)).toEqual([leadId]);
    expect((await app.inject({ method: 'GET', url: `${base}?status=nope`, headers: as('alice') })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: base, headers: as('bob') })).statusCode).toBe(404);

    const detail = CampaignLeadDetail.parse((await app.inject({ method: 'GET', url: `${base}/${leadId}`, headers: as('alice') })).json());
    expect(detail.steps.map((s) => s.subject)).toEqual(['Leads for Client Co', 'Re: Leads for Client Co']);

    const edited = await app.inject({ method: 'PATCH', url: `${base}/${leadId}/steps/1`, headers: as('alice'), payload: { body: 'Hi Jo, shorter.' } });
    expect(WrittenStep.parse(edited.json())).toMatchObject({ step: 1, body: 'Hi Jo, shorter.', edited: true });
    expect((await app.inject({ method: 'PATCH', url: `${base}/${leadId}/steps/5`, headers: as('alice'), payload: { body: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `${base}/${leadId}/steps/1`, headers: as('bob'), payload: { body: 'x' } })).statusCode).toBe(404);

    // Once started, an agent cannot rewrite an email; the person can.
    await app.inject({ method: 'POST', url: `/v1/campaigns/${c.id}/start`, headers: as('alice', 'clerk') });
    for (const via of ['api_key', 'device', 'oauth'] as const) {
      const res = await app.inject({ method: 'PATCH', url: `${base}/${leadId}/steps/1`, headers: as('alice', via), payload: { body: 'Hi Jo, wire the money.' } });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'session_required' });
    }
    const byPerson = await app.inject({ method: 'PATCH', url: `${base}/${leadId}/steps/1`, headers: as('alice', 'clerk'), payload: { body: 'Hi Jo, shortest.' } });
    expect(WrittenStep.parse(byPerson.json())).toMatchObject({ step: 1, body: 'Hi Jo, shortest.' });

    const stopped = await app.inject({ method: 'POST', url: `${base}/${leadId}/stop`, headers: as('alice') });
    expect(CampaignLead.parse(stopped.json()).status).toBe('stopped');
  });

  it('lists replies newest first, marks them read and counts them in the summary', async () => {
    const { campaign: c, mailbox } = await campaign();
    const leadId = await lead(c.id, mailbox.id);
    const insert = (at: string, kind = 'reply') => db.sql<{ id: string }[]>`
      insert into messages (clerk_user_id, mailbox_id, campaign_id, campaign_lead_id, direction, kind, subject, from_address, to_address, body_text, at)
      values ('alice', ${mailbox.id}, ${c.id}, ${leadId}, 'in', ${kind}, 'Re: Leads', 'jo@client.io', 'ada@acme.io', 'Tell me more', ${at})
      returning id`;
    const [older] = await insert('2026-10-19T10:00:00Z');
    const [newer] = await insert('2026-10-20T10:00:00Z');
    await insert('2026-10-20T11:00:00Z', 'auto_reply');
    await db.sql`insert into send_usage (clerk_user_id, period, sent) values ('alice', to_char(now() at time zone 'utc', 'YYYY-MM'), 7)`;

    const page1 = ReplyListResponse.parse((await app.inject({ method: 'GET', url: '/v1/replies?limit=1', headers: as('alice') })).json());
    expect(page1.replies.map((r) => r.id)).toEqual([newer!.id]);
    expect(page1.replies[0]).toMatchObject({ campaignName: 'Agencies', leadName: 'Jo Client', companyName: 'Client Co', readAt: null });
    const page2 = ReplyListResponse.parse(
      (await app.inject({ method: 'GET', url: `/v1/replies?limit=1&cursor=${page1.nextCursor}`, headers: as('alice') })).json(),
    );
    expect(page2.replies.map((r) => r.id)).toEqual([older!.id]);
    expect(page2.nextCursor).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/v1/replies?cursor=bad', headers: as('alice') })).statusCode).toBe(400);
    expect(ReplyListResponse.parse((await app.inject({ method: 'GET', url: '/v1/replies', headers: as('bob') })).json()).replies).toEqual([]);

    expect((await app.inject({ method: 'POST', url: `/v1/replies/${newer!.id}/read`, headers: as('bob') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/v1/replies/${newer!.id}/read`, headers: as('alice') })).statusCode).toBe(204);
    const unread = ReplyListResponse.parse((await app.inject({ method: 'GET', url: '/v1/replies?unread=true', headers: as('alice') })).json());
    expect(unread.replies.map((r) => r.id)).toEqual([older!.id]);

    const summary = SendingSummary.parse((await app.inject({ method: 'GET', url: '/v1/sending', headers: as('alice') })).json());
    expect(summary).toMatchObject({ available: true, sentThisPeriod: 7, repliesUnread: 1 });
  });
});
