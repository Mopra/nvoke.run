import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CreateWebhookResponse,
  LeadReadyPayload,
  SearchFinishedPayload,
  Webhook,
  WebhookDeliveryListResponse,
  WebhookListResponse,
  WebhookPayload,
} from '@nvoke/shared';
import { userWebhookRoutes } from '../api/routes/user-webhooks.js';
import { createDrop } from '../feed/drops.js';
import { ensureAccount } from '../leads/quota.js';
import { suppress } from '../leads/suppression.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import { checkUrl, isPublicAddress, type Resolve } from './address.js';
import { deliverDue, MAX_ATTEMPTS, RETRY_DELAYS_MS } from './deliver.js';
import { leadSettled, searchFinished } from './events.js';
import { httpSender, signWebhook, type SendResult, type WebhookRequest } from './send.js';

describe('addresses', () => {
  it('tells public addresses from private ones', () => {
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111']) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::a9fe:a9fe',
      'not an ip',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  const dns: Resolve = async (host) =>
    ({
      'hooks.example.com': [{ address: '93.184.216.34', family: 4 }],
      'internal.example.com': [{ address: '10.0.0.5', family: 4 }],
      'rebind.example.com': [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    })[host] ?? [];

  it('accepts https on a public host and refuses everything else', async () => {
    const strict = { allowPrivate: false };
    await expect(checkUrl('https://hooks.example.com/x', strict, dns)).resolves.toBeInstanceOf(URL);
    await expect(checkUrl('http://hooks.example.com/x', strict, dns)).rejects.toThrow('must be https');
    await expect(checkUrl('https://localhost/x', strict, dns)).rejects.toThrow('private address');
    await expect(checkUrl('https://127.0.0.1/x', strict, dns)).rejects.toThrow('private address');
    await expect(checkUrl('https://[::1]/x', strict, dns)).rejects.toThrow('private address');
    await expect(checkUrl('https://internal.example.com/x', strict, dns)).rejects.toThrow('private address');
    await expect(checkUrl('https://rebind.example.com/x', strict, dns)).rejects.toThrow('private address');
    await expect(checkUrl('https://nowhere.example.com/x', strict, dns)).rejects.toThrow('does not resolve');
    await expect(checkUrl('https://user:pw@hooks.example.com/x', strict, dns)).rejects.toThrow('credentials');
    await expect(checkUrl('http://127.0.0.1:9/x', { allowPrivate: true }, dns)).resolves.toBeInstanceOf(URL);
  });
});

describe('signing', () => {
  it('matches the Standard Webhooks reference signature', () => {
    expect(signWebhook('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'msg_p5jXN8AQM9LWM0D4loKWxJek', 1614265330, '{"test": 2432232314}')).toBe(
      'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    );
  });
});

describe('httpSender', () => {
  let server: http.Server;
  let base: string;
  const seen: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        seen.push({ headers: req.headers, body });
        if (req.url === '/ok') return res.writeHead(204).end();
        if (req.url === '/broken') return res.writeHead(500).end('  database\n down  ');
        if (req.url === '/redirect') return res.writeHead(302, { location: '/ok' }).end();
        // /slow never answers.
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  const req = (path: string): WebhookRequest => ({
    url: `${base}${path}`,
    secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
    id: 'd1',
    body: '{"type":"ping"}',
    now: new Date(1614265330_000),
  });

  it('posts a signed body and reads the answer', async () => {
    const send = httpSender({ allowPrivate: true, timeoutMs: 500 });
    expect(await send(req('/ok'))).toMatchObject({ ok: true, status: 204, error: null });
    const last = seen.at(-1)!;
    expect(last.body).toBe('{"type":"ping"}');
    expect(last.headers['webhook-id']).toBe('d1');
    expect(last.headers['webhook-timestamp']).toBe('1614265330');
    expect(last.headers['webhook-signature']).toBe(signWebhook(req('/ok').secret, 'd1', 1614265330, '{"type":"ping"}'));
    expect(last.headers['user-agent']).toMatch(/^nvoke-webhooks\//);

    expect(await send(req('/broken'))).toMatchObject({ ok: false, status: 500, error: 'HTTP 500: database down' });
    expect(await send(req('/redirect'))).toMatchObject({ ok: false, status: 302 });
    expect(await send(req('/slow'))).toMatchObject({ ok: false, status: null, error: 'timeout' });
  });

  it('refuses private addresses on the socket unless allowed', async () => {
    const send = httpSender({ allowPrivate: false, timeoutMs: 500 });
    expect(await send(req('/ok'))).toMatchObject({ ok: false, status: null, error: 'must be https' });
    const httpsLocal = await send({ ...req('/ok'), url: `https://127.0.0.1:1/ok` });
    expect(httpsLocal).toMatchObject({ ok: false, error: 'private address' });
  });
});

// Database: routes, events and delivery

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});

async function seedSearch(opts: { user?: string; dropId?: string | null; status?: string } = {}) {
  const user = opts.user ?? 'u1';
  await ensureAccount(db.sql, user);
  const [search] = await db.sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, params, "limit", status, drop_id)
    values (${user}, ${opts.dropId ? 'drop' : 'local'},
      ${db.sql.json(opts.dropId ? { dropId: opts.dropId, dropName: 'AI launches', sources: ['show_hn'] } : { niche: 'dentists', location: 'Aarhus' })},
      10, ${opts.status ?? 'running'}, ${opts.dropId ?? null})
    returning id
  `;
  return search!.id;
}

async function seedCompany(searchId: string, domain: string, emails: Array<[string, string | null]>, user = 'u1') {
  const [company] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source, crawl_status, crawled_at)
    values (${searchId}, ${user}, ${domain}, ${domain}, ${`https://${domain}/`}, 'test', 'done', now())
    returning id
  `;
  for (const [address, verification] of emails) {
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, checked_at)
      values (${company!.id}, ${searchId}, ${user}, ${address}, 'generic', ${verification}, ${verification ? new Date() : null})
    `;
  }
  return company!.id;
}

async function seedWebhook(opts: { user?: string; events?: string[]; scope?: string; dropId?: string | null; enabled?: boolean } = {}) {
  await ensureAccount(db.sql, opts.user ?? 'u1');
  const [row] = await db.sql<{ id: string }[]>`
    insert into webhooks (clerk_user_id, url, secret, events, scope, drop_id, enabled)
    values (${opts.user ?? 'u1'}, 'https://hooks.example.com/x', 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
      ${opts.events ?? ['lead.ready', 'search.finished']}::text[], ${opts.scope ?? 'all'}, ${opts.dropId ?? null}, ${opts.enabled ?? true})
    returning id
  `;
  return row!.id;
}

const deliveries = (webhookId: string) =>
  db.sql<{ event: string; company_id: string | null; status: string; attempts: number; next_attempt_at: Date; last_error: string | null }[]>`
    select event, company_id, status, attempts, next_attempt_at, last_error from webhook_deliveries
    where webhook_id = ${webhookId} order by event, company_id
  `;

/** A sender that records requests and answers from a script. */
function fakeSender(answer: (req: WebhookRequest) => Partial<SendResult> = () => ({ ok: true, status: 200 })) {
  const sent: Array<WebhookRequest & { payload: WebhookPayload }> = [];
  const send = async (req: WebhookRequest): Promise<SendResult> => {
    sent.push({ ...req, payload: WebhookPayload.parse(JSON.parse(req.body)) });
    return { ok: false, status: null, error: null, durationMs: 1, ...answer(req) };
  };
  return { send, sent };
}

describe('events', () => {
  beforeEach(async () => {
    await db.sql`truncate accounts, suppressions cascade`;
  });

  it('announces a company once its last address is checked, once', async () => {
    const hook = await seedWebhook();
    const search = await seedSearch();
    const company = await seedCompany(search, 'alpha.dk', [
      ['info@alpha.dk', 'valid'],
      ['ole@alpha.dk', null],
    ]);
    expect(await leadSettled(db.sql, company)).toBe(0);
    await db.sql`update emails set verification = 'invalid' where address = 'ole@alpha.dk'`;
    expect(await leadSettled(db.sql, company)).toBe(1);
    expect(await leadSettled(db.sql, company)).toBe(0);
    expect(await deliveries(hook)).toMatchObject([{ event: 'lead.ready', company_id: company, status: 'pending' }]);
  });

  it('never announces a company without a valid, unsuppressed address', async () => {
    const hook = await seedWebhook();
    const search = await seedSearch();
    const invalid = await seedCompany(search, 'beta.dk', [['info@beta.dk', 'invalid']]);
    const optedOut = await seedCompany(search, 'gamma.dk', [['info@gamma.dk', 'valid']]);
    await suppress(db.sql, { address: 'info@gamma.dk' }, 'admin');
    expect(await leadSettled(db.sql, invalid)).toBe(0);
    expect(await leadSettled(db.sql, optedOut)).toBe(0);
    expect(await deliveries(hook)).toEqual([]);
  });

  it('on finish, announces leads left unsettled by the quota and the search', async () => {
    const hook = await seedWebhook();
    const search = await seedSearch({ status: 'failed' });
    const company = await seedCompany(search, 'alpha.dk', [
      ['info@alpha.dk', 'valid'],
      ['sales@alpha.dk', null],
    ]);
    expect(await searchFinished(db.sql, search)).toBe(2);
    expect(await searchFinished(db.sql, search)).toBe(0);
    expect((await deliveries(hook)).map((d) => [d.event, d.company_id])).toEqual([
      ['lead.ready', company],
      ['search.finished', null],
    ]);
  });

  it('matches events, scope, drop and owner', async () => {
    await ensureAccount(db.sql, 'u1');
    const drop = await createDrop(db.sql, 'u1', { name: 'AI launches' });
    const other = await createDrop(db.sql, 'u1', { name: 'Fintech' });
    const all = await seedWebhook();
    const drops = await seedWebhook({ scope: 'drops' });
    const thisDrop = await seedWebhook({ scope: 'drops', dropId: drop.id });
    const otherDrop = await seedWebhook({ scope: 'drops', dropId: other.id });
    const finishedOnly = await seedWebhook({ events: ['search.finished'] });
    const paused = await seedWebhook({ enabled: false });
    await ensureAccount(db.sql, 'u2');
    const stranger = await seedWebhook({ user: 'u2' });

    const plain = await seedSearch({ status: 'done' });
    await seedCompany(plain, 'alpha.dk', [['info@alpha.dk', 'valid']]);
    const dropped = await seedSearch({ status: 'done', dropId: drop.id });
    await seedCompany(dropped, 'beta.dk', [['info@beta.dk', 'valid']]);
    await searchFinished(db.sql, plain);
    await searchFinished(db.sql, dropped);

    const count = async (id: string) => (await deliveries(id)).map((d) => d.event).join(',');
    expect(await count(all)).toBe('lead.ready,lead.ready,search.finished,search.finished');
    expect(await count(drops)).toBe('lead.ready,search.finished');
    expect(await count(thisDrop)).toBe('lead.ready,search.finished');
    expect(await count(otherDrop)).toBe('');
    expect(await count(finishedOnly)).toBe('search.finished,search.finished');
    expect(await count(paused)).toBe('');
    expect(await count(stranger)).toBe('');

    // Deleting a drop deletes the webhooks narrowed to it.
    await db.sql`delete from drops where id = ${drop.id}`;
    expect(await db.sql`select 1 from webhooks where id = ${thisDrop}`).toHaveLength(0);
  });
});

describe('deliverDue', () => {
  beforeEach(async () => {
    await db.sql`truncate accounts, suppressions cascade`;
  });

  it('sends the lead as the API shows it, then the finished search', async () => {
    await ensureAccount(db.sql, 'u1');
    const drop = await createDrop(db.sql, 'u1', { name: 'AI launches' });
    const hook = await seedWebhook();
    const search = await seedSearch({ status: 'done', dropId: drop.id });
    const company = await seedCompany(search, 'alpha.dk', [
      ['info@alpha.dk', 'valid'],
      ['ole@alpha.dk', 'invalid'],
      ['hidden@alpha.dk', null],
    ]);
    await searchFinished(db.sql, search);

    const { send, sent } = fakeSender();
    const result = await deliverDue({ sql: db.sql, send, log: silentLog });
    expect(result).toEqual({ delivered: 2, failed: 0, retrying: 0, skipped: 0 });
    const lead = LeadReadyPayload.parse(sent.find((s) => s.payload.type === 'lead.ready')!.payload);
    expect(lead.data.search).toEqual({ id: search, kind: 'drop', dropId: drop.id, dropName: 'AI launches' });
    expect(lead.data.company.id).toBe(company);
    expect(lead.data.company.emails.map((e) => [e.address, e.verification])).toEqual([
      ['info@alpha.dk', 'valid'],
      ['ole@alpha.dk', 'invalid'],
    ]);
    const finished = SearchFinishedPayload.parse(sent.find((s) => s.payload.type === 'search.finished')!.payload);
    expect(finished.data.search).toMatchObject({ id: search, status: 'done' });
    expect(sent.map((s) => s.secret)).toEqual(['whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw']);

    expect((await deliveries(hook)).map((d) => d.status)).toEqual(['delivered', 'delivered']);
    const [row] = await db.sql<{ last_success_at: Date | null }[]>`select last_success_at from webhooks where id = ${hook}`;
    expect(row?.last_success_at).not.toBeNull();
    // Nothing left to send.
    expect(await deliverDue({ sql: db.sql, send, log: silentLog })).toEqual({ delivered: 0, failed: 0, retrying: 0, skipped: 0 });
  });

  it('skips a delivery whose data is gone', async () => {
    const hook = await seedWebhook();
    const search = await seedSearch({ status: 'done' });
    await seedCompany(search, 'alpha.dk', [['info@alpha.dk', 'valid']]);
    await searchFinished(db.sql, search);
    await suppress(db.sql, { address: 'info@alpha.dk' }, 'opt_out_page');

    const { send, sent } = fakeSender();
    expect(await deliverDue({ sql: db.sql, send, log: silentLog })).toMatchObject({ delivered: 1, skipped: 1 });
    expect(sent.map((s) => s.payload.type)).toEqual(['search.finished']);
    expect((await deliveries(hook)).map((d) => [d.event, d.status])).toEqual([
      ['lead.ready', 'skipped'],
      ['search.finished', 'delivered'],
    ]);
  });

  it('retries on the schedule, then fails and turns off a webhook that never worked', async () => {
    const hook = await seedWebhook({ events: ['search.finished'] });
    const search = await seedSearch({ status: 'done' });
    await searchFinished(db.sql, search);
    const { send } = fakeSender(() => ({ ok: false, status: 503, error: 'HTTP 503' }));

    let now = new Date();
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      expect(await deliverDue({ sql: db.sql, send, log: silentLog, now: () => now })).toMatchObject({ retrying: 1 });
      const [d] = await deliveries(hook);
      expect(d).toMatchObject({ status: 'pending', attempts: attempt, last_error: 'HTTP 503' });
      expect(d!.next_attempt_at.getTime() - now.getTime()).toBe(RETRY_DELAYS_MS[attempt - 1]);
      // Not due yet.
      expect(await deliverDue({ sql: db.sql, send, log: silentLog, now: () => now })).toMatchObject({ retrying: 0 });
      now = d!.next_attempt_at;
    }
    expect(await deliverDue({ sql: db.sql, send, log: silentLog, now: () => now })).toMatchObject({ failed: 1 });
    expect(await deliveries(hook)).toMatchObject([{ status: 'failed', attempts: MAX_ATTEMPTS }]);
    const [row] = await db.sql<{ enabled: boolean; disabled_reason: string | null }[]>`
      select enabled, disabled_reason from webhooks where id = ${hook}`;
    expect(row).toEqual({ enabled: false, disabled_reason: 'failing' });
  });

  it('keeps a webhook on when it succeeded since the failed delivery was made', async () => {
    const hook = await seedWebhook({ events: ['search.finished'] });
    const search = await seedSearch({ status: 'done' });
    await searchFinished(db.sql, search);
    await db.sql`update webhook_deliveries set attempts = ${MAX_ATTEMPTS - 1} where webhook_id = ${hook}`;
    await db.sql`update webhooks set last_success_at = now() + interval '1 second' where id = ${hook}`;
    const { send } = fakeSender(() => ({ ok: false, status: 500, error: 'HTTP 500' }));
    expect(await deliverDue({ sql: db.sql, send, log: silentLog })).toMatchObject({ failed: 1 });
    const [row] = await db.sql<{ enabled: boolean }[]>`select enabled from webhooks where id = ${hook}`;
    expect(row?.enabled).toBe(true);
  });
});

describe('webhook routes', () => {
  let app: FastifyInstance;
  const dns: Resolve = async (host) =>
    host === 'hooks.example.com' ? [{ address: '93.184.216.34', family: 4 }] : host === 'lan.example.com' ? [{ address: '192.168.0.2', family: 4 }] : [];
  const pings: WebhookRequest[] = [];

  beforeAll(async () => {
    app = Fastify();
    await app.register(userWebhookRoutes, {
      prefix: '/v1',
      getSql: () => db.sql,
      authenticate: async (req) => {
        const user = req.headers['x-test-user'];
        if (typeof user === 'string') req.userId = user;
      },
      urlPolicy: { allowPrivate: false },
      resolve: dns,
      send: async (req) => {
        pings.push(req);
        return { ok: true, status: 200, error: null, durationMs: 12 };
      },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await db.sql`truncate accounts cascade`;
  });

  const as = (user: string) => ({ 'x-test-user': user });
  const create = (user: string, payload: object) => app.inject({ method: 'POST', url: '/v1/webhooks', headers: as(user), payload });

  it('401s without a user', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/webhooks' })).statusCode).toBe(401);
  });

  it('creates with a secret shown once, lists, tests, pauses and deletes', async () => {
    const res = await create('alice', { url: 'https://hooks.example.com/nvoke' });
    expect(res.statusCode).toBe(201);
    const created = CreateWebhookResponse.parse(res.json());
    expect(created).toMatchObject({ events: ['lead.ready', 'search.finished'], scope: 'all', dropId: null, enabled: true });
    expect(created.secret).toMatch(/^whsec_[A-Za-z0-9+/]{32}$/);

    const list = WebhookListResponse.parse((await app.inject({ method: 'GET', url: '/v1/webhooks', headers: as('alice') })).json());
    expect(list.webhooks.map((w) => w.id)).toEqual([created.id]);
    expect(JSON.stringify(list)).not.toContain(created.secret);
    expect(WebhookListResponse.parse((await app.inject({ method: 'GET', url: '/v1/webhooks', headers: as('bob') })).json()).webhooks).toEqual([]);

    const url = `/v1/webhooks/${created.id}`;
    const test = await app.inject({ method: 'POST', url: `${url}/test`, headers: as('alice') });
    expect(test.json()).toEqual({ ok: true, status: 200, error: null, durationMs: 12 });
    const ping = pings.at(-1)!;
    expect(ping.secret).toBe(created.secret);
    expect(WebhookPayload.parse(JSON.parse(ping.body))).toMatchObject({ type: 'ping', data: { webhookId: created.id } });
    expect((await app.inject({ method: 'POST', url: `${url}/test`, headers: as('bob') })).statusCode).toBe(404);

    const paused = await app.inject({ method: 'PATCH', url, headers: as('alice'), payload: { enabled: false, events: ['lead.ready'] } });
    expect(Webhook.parse(paused.json())).toMatchObject({ enabled: false, events: ['lead.ready'] });
    expect((await app.inject({ method: 'PATCH', url, headers: as('bob'), payload: { enabled: true } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url, headers: as('alice'), payload: {} })).statusCode).toBe(400);

    const listed = await app.inject({ method: 'GET', url: `${url}/deliveries`, headers: as('alice') });
    expect(WebhookDeliveryListResponse.parse(listed.json()).deliveries).toEqual([]);

    expect((await app.inject({ method: 'DELETE', url, headers: as('bob') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url, headers: as('alice') })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `${url}/deliveries`, headers: as('alice') })).statusCode).toBe(404);
  });

  it('refuses URLs that are not https on a public address', async () => {
    for (const url of ['http://hooks.example.com/x', 'https://lan.example.com/x', 'https://127.0.0.1/x', 'https://nowhere.example.com/x']) {
      const res = await create('alice', { url });
      expect(res.statusCode, url).toBe(422);
      expect(res.json().error).toBe('webhook_url_not_allowed');
    }
    expect((await create('alice', { url: 'ftp://hooks.example.com/x' })).statusCode).toBe(400);
  });

  it('narrows to a drop only the user owns', async () => {
    await ensureAccount(db.sql, 'bob');
    const bobs = await createDrop(db.sql, 'bob', { name: 'Bob’s' });
    expect((await create('alice', { url: 'https://hooks.example.com/x', dropId: bobs.id })).statusCode).toBe(400);
    const res = await create('bob', { url: 'https://hooks.example.com/x', dropId: bobs.id });
    expect(Webhook.parse(res.json())).toMatchObject({ scope: 'drops', dropId: bobs.id });
  });

  it('caps webhooks per account', async () => {
    for (let i = 0; i < 10; i++) expect((await create('alice', { url: `https://hooks.example.com/${i}` })).statusCode).toBe(201);
    const res = await create('alice', { url: 'https://hooks.example.com/11' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'too_many_webhooks' });
  });
});
