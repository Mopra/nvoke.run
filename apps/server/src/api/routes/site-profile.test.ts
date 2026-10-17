import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SITE_PROFILE_RUNS_PER_DAY, SiteProfile } from '@nvoke/shared';
import { AiError, type Ai, type StructuredRequest } from '../../ai/client.js';
import type { ReadSiteResult } from '../../profile/read-site.js';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { siteProfileRoutes, siteShotRoutes } from './site-profile.js';

let db: TestDb;
let app: FastifyInstance;
let reply: unknown;
let site: ReadSiteResult;
let shots: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requests: StructuredRequest<any>[] = [];

const claudeAnswer = {
  profile: {
    name: 'Acme Dental Supply',
    summary: 'Sells dental chairs and booking software to clinics.',
    offer: 'Dental chairs, lamps and a booking system.',
    audience: 'Dental clinics in Denmark.',
    proofPoints: ['Founded 2009', ' ', '400 clinics'],
    voice: ['klinikindretning'],
    language: 'DA',
    country: 'DK',
  },
  suggestions: [
    { kind: 'local', niche: 'tandlæge', location: 'Aarhus', keyword: null, country: null, items: null, why: 'Clinics that buy chairs.' },
    { kind: 'web', niche: null, location: null, keyword: 'tandklinik', country: 'DK', items: null, why: 'Clinics with their own site.' },
    { kind: 'maps', niche: 'dentist', location: 'Aarhus', keyword: null, country: null, items: null, why: 'Unknown kind.' },
    // Missing its location: dropped.
    { kind: 'local', niche: 'dentist', location: null, keyword: null, country: null, items: null, why: 'Broken.' },
    { kind: 'launches', niche: null, location: null, keyword: 'dental', country: null, items: null, why: 'New dental software.' },
    { kind: 'domains', niche: null, location: null, keyword: null, country: 'dk', items: ['tandlaegen.dk', 'Colosseum Klinikken'], why: 'Chains.' },
  ],
};

/** Claude behind the src/ai interface: answers with `reply`, or throws it when it is an error. */
const ai: Ai = {
  async ready() {
    return true;
  },
  async structured(req) {
    requests.push(req);
    if (reply instanceof Error) throw reply;
    return { data: req.schema.parse(reply), model: 'fake', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 };
  },
};

beforeAll(async () => {
  db = await createTestDb();
  app = Fastify();
  await app.register(siteProfileRoutes, {
    prefix: '/v1/site-profile',
    getSql: () => db.sql,
    authenticate: async (req) => {
      const user = req.headers['x-test-user'];
      if (typeof user === 'string') req.userId = user;
    },
    getAi: () => ai,
    urlPolicy: { allowPrivate: false },
    apiUrl: 'https://api.nvoke.test/',
    shots: false,
    read: async () => site,
    resolve: async (host) => [{ address: host === 'intranet.example' ? '10.0.0.5' : '93.184.216.34', family: 4 }],
    // Images whose URL says "live" load; the rest 404.
    imageFetch: async (url) =>
      String(url).includes('live') ? new Response('img', { status: 200, headers: { 'content-type': 'image/png' } }) : new Response('', { status: 404 }),
    shoot: async (url) => {
      shots.push(url);
      return Buffer.from('jpeg bytes');
    },
  });
  await app.register(siteShotRoutes, { getSql: () => db.sql });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.sql`truncate accounts cascade`;
  await db.sql`insert into accounts (clerk_user_id) values ('alice'), ('bob')`;
  requests.length = 0;
  shots = [];
  reply = claudeAnswer;
  site = {
    ok: true,
    website: 'https://acme.dk/',
    domain: 'acme.dk',
    pages: [{ url: 'https://acme.dk/', title: 'Acme', description: 'Chairs', text: 'We sell chairs to clinics.' }],
    visuals: { icons: ['https://acme.dk/gone.png', 'https://acme.dk/live-icon.png'], images: ['https://acme.dk/live-og.png'] },
  };
});

const as = (user: string) => ({ 'x-test-user': user });
const build = (user: string, website: unknown) =>
  app.inject({ method: 'POST', url: '/v1/site-profile', headers: as(user), payload: { website } });

describe('site profile pictures', () => {
  it('keeps the first icon and the share image that load, without a screenshot', async () => {
    const profile = SiteProfile.parse((await build('alice', 'acme.dk')).json());
    expect(profile.icon).toBe('https://acme.dk/live-icon.png');
    expect(profile.image).toBe('https://acme.dk/live-og.png');
    expect(shots).toEqual([]);
  });

  it('takes a screenshot when the share image does not load, served by its token only', async () => {
    if (site.ok) site.visuals = { icons: [], images: ['https://acme.dk/gone-og.png'] };
    const profile = SiteProfile.parse((await build('alice', 'acme.dk')).json());
    expect(shots).toEqual(['https://acme.dk/']);
    expect(profile.icon).toBeNull();
    expect(profile.image).toMatch(/^https:\/\/api\.nvoke\.test\/site-shots\/[A-Za-z0-9_-]{43}\.jpg$/);

    const path = new URL(profile.image!).pathname;
    const res = await app.inject({ method: 'GET', url: path });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.body).toBe('jpeg bytes');
    expect((await app.inject({ method: 'GET', url: '/site-shots/nope.jpg' })).statusCode).toBe(404);

    // A new build replaces the account's screenshot.
    await build('alice', 'acme.dk');
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(404);
  });
});

describe('site profile routes', () => {
  it('401s without a user', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/site-profile' })).statusCode).toBe(401);
  });

  it('404s before a profile exists', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/site-profile', headers: as('alice') });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('builds a profile with searches the API accepts, stores it per account and logs the cost', async () => {
    const res = await build('alice', 'acme.dk');
    expect(res.statusCode).toBe(200);
    const profile = SiteProfile.parse(res.json());
    expect(profile.domain).toBe('acme.dk');
    expect(profile.profile).toMatchObject({ language: 'da', country: 'dk', proofPoints: ['Founded 2009', '400 clinics'] });
    expect(profile.suggestions.map((s) => s.search.kind)).toEqual(['local', 'web', 'launches', 'domains']);
    expect(profile.suggestions[0]).toEqual({
      why: 'Clinics that buy chairs.',
      search: { kind: 'local', params: { niche: 'tandlæge', location: 'Aarhus' }, limit: 100 },
    });
    expect(profile.suggestions[3]!.search).toEqual({ kind: 'domains', params: { items: ['tandlaegen.dk', 'Colosseum Klinikken'], country: 'dk' } });

    // The pages went to Claude on the bulk tier, billed to the account.
    expect(requests[0]).toMatchObject({ userId: 'alice', task: 'site-profile', tier: 'bulk' });
    expect(JSON.stringify(requests[0]!.prompt)).toContain('We sell chairs to clinics.');

    const got = await app.inject({ method: 'GET', url: '/v1/site-profile', headers: as('alice') });
    expect(SiteProfile.parse(got.json())).toEqual(profile);
    expect((await app.inject({ method: 'GET', url: '/v1/site-profile', headers: as('bob') })).statusCode).toBe(404);
  });

  it('edits the profile and keeps the suggestions', async () => {
    const built = SiteProfile.parse((await build('alice', 'https://acme.dk')).json());
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/site-profile',
      headers: as('alice'),
      payload: { audience: 'Dental clinics with 3 to 20 chairs', voice: ['tandklinik'] },
    });
    expect(res.statusCode).toBe(200);
    const edited = SiteProfile.parse(res.json());
    expect(edited.profile).toEqual({ ...built.profile, audience: 'Dental clinics with 3 to 20 chairs', voice: ['tandklinik'] });
    expect(edited.suggestions).toEqual(built.suggestions);

    expect((await app.inject({ method: 'PATCH', url: '/v1/site-profile', headers: as('alice'), payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/v1/site-profile', headers: as('bob'), payload: { name: 'X' } })).statusCode).toBe(404);
  });

  it('rejects what is not a public website', async () => {
    expect((await build('alice', 'not a site')).statusCode).toBe(400);
    expect((await build('alice', 'localhost')).statusCode).toBe(400);
    const res = await build('alice', 'intranet.example');
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'site_unreadable', detail: 'not_allowed' });
    expect(requests).toHaveLength(0);
  });

  it('says why the site could not be read, without calling Claude', async () => {
    site = { ok: false, reason: 'blocked' };
    const res = await build('alice', 'acme.dk');
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'site_unreadable', detail: 'blocked' });
    expect(requests).toHaveLength(0);
  });

  it('answers ai_unavailable when Claude fails, and keeps the old profile', async () => {
    await build('alice', 'acme.dk');
    reply = new AiError('budget_exceeded', 'spent');
    const res = await build('alice', 'other.dk');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'ai_unavailable' });
    const got = SiteProfile.parse((await app.inject({ method: 'GET', url: '/v1/site-profile', headers: as('alice') })).json());
    expect(got.domain).toBe('acme.dk');
  });

  it('limits builds per account per day', async () => {
    site = { ok: false, reason: 'unreachable' };
    for (let i = 0; i < SITE_PROFILE_RUNS_PER_DAY; i++) expect((await build('alice', 'acme.dk')).statusCode).toBe(422);
    expect((await build('alice', 'acme.dk')).statusCode).toBe(429);
    expect((await build('bob', 'acme.dk')).statusCode).toBe(422);
  });
});
