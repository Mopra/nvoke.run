import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Verification } from '@nvoke/shared';
import { RateLimiter } from '../leads/limits.js';
import { ensureAccount } from '../leads/quota.js';
import { createSearch } from '../leads/repo.js';
import { RobotsCache } from '../leads/robots.js';
import type { AdapterRegistry } from '../leads/sources/index.js';
import { suppress } from '../leads/suppression.js';
import type { DomainProbe, ProbeCandidate, Verifier } from '../leads/verify/index.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { fakeFetch, silentLog } from '../testing/fakes.js';
import { CONFIDENCE, runPeople } from './people-job.js';
import { runVerify, type PipelineDeps } from './pipeline.js';
import type { Job } from './queue.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, usage, jobs, email_checks, suppressions, searches cascade`;
});

/**
 * A verifier whose mail server accepts `accepts` (or anything, when
 * catch-all) and remembers what it was asked. verify() answers like the
 * cache would after a probe.
 */
function stubVerifier(opts: { accepts?: string[]; catchAll?: boolean; paced?: boolean } = {}) {
  const asked: ProbeCandidate[][][] = [];
  const verifier = {
    asked,
    async probeDomain(domain: string, groups: ProbeCandidate[][]): Promise<DomainProbe> {
      asked.push(groups);
      const base = { domain, mxHost: 'mx.test', results: [], accepted: groups.map(() => null) };
      if (opts.paced) return { ...base, catchAll: null, reason: 'smtp_paced', retryAfterMs: 30_000 };
      if (opts.catchAll) return { ...base, catchAll: true, reason: 'accepts_any_recipient' };
      const accepted = groups.map((g) => g.find((c) => opts.accepts?.includes(c.address))?.address ?? null);
      return { ...base, catchAll: false, accepted, reason: null };
    },
    async verify(address: string) {
      const verification: Verification = opts.catchAll ? 'catch_all' : opts.accepts?.includes(address) ? 'valid' : 'invalid';
      return { address, verification, mxHost: 'mx.test', reason: 'cached' };
    },
  };
  return verifier;
}

function deps(verifier: ReturnType<typeof stubVerifier>): PipelineDeps {
  const fetch = fakeFetch({});
  const limiter = new RateLimiter(1);
  return {
    sql: db.sql,
    log: silentLog,
    adapters: {} as AdapterRegistry,
    crawl: { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) },
    verifier: verifier as unknown as Verifier,
  };
}

interface Seed {
  people: Array<{ first: string; last: string; title?: string; seniority?: string }>;
  emails?: string[];
  domain?: string;
}

async function seed({ people, emails = [], domain = 'acme.dk' }: Seed) {
  await ensureAccount(db.sql, 'u1');
  const search = await createSearch(db.sql, 'u1', { kind: 'local', params: { niche: 'agencies', location: 'Aarhus' } }, 10);
  await db.sql`update searches set status = 'running' where id = ${search.id}`;
  const [company] = await db.sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source, crawl_status)
    values (${search.id}, 'u1', 'Acme', ${domain}, ${`https://${domain}/`}, 'test', 'done')
    returning id
  `;
  for (const p of people) {
    await db.sql`
      insert into people (company_id, search_id, first_name, last_name, title, seniority, source, source_url)
      values (${company!.id}, ${search.id}, ${p.first}, ${p.last}, ${p.title ?? null}, ${p.seniority ?? null}, 'page', ${`https://${domain}/team`})
    `;
  }
  for (const address of emails) {
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind, source_url, found_via)
      values (${company!.id}, ${search.id}, 'u1', ${address}, 'personal', ${`https://${domain}/kontakt`}, 'page')
    `;
  }
  const job: Job = { id: '1', type: 'people', payload: { companyId: company!.id }, searchId: search.id, attempts: 1, maxAttempts: 3 };
  return { searchId: search.id, companyId: company!.id, job };
}

async function emailsOf(companyId: string) {
  return db.sql<
    {
      id: string;
      address: string;
      first_name: string | null;
      last_name: string | null;
      title: string | null;
      seniority: string | null;
      found_via: string | null;
      confidence: number | null;
      source_url: string | null;
      person_id: string | null;
      verification: Verification | null;
    }[]
  >`
    select id, address, first_name, last_name, title, seniority, found_via, confidence, source_url, person_id, verification
    from emails where company_id = ${companyId} order by created_at, address
  `;
}

const signal = new AbortController().signal;

describe('runPeople', () => {
  it('links printed addresses, learns the pattern from them and finds the decision makers', async () => {
    const { companyId, searchId, job } = await seed({
      people: [
        { first: 'Mia', last: 'Kro', title: 'Designer', seniority: 'staff' },
        { first: 'Anna', last: 'Berg', title: 'Designer', seniority: 'staff' },
        { first: 'Søren', last: 'Kjær', title: 'CEO', seniority: 'founder' },
        { first: 'Ole', last: 'Holm', title: 'Head of Sales', seniority: 'director' },
        { first: 'Ida', last: 'Lund' },
      ],
      emails: ['anna.berg@acme.dk'],
    });
    const v = stubVerifier({ accepts: ['soeren.kjaer@acme.dk', 'ole.holm@acme.dk'] });
    await runPeople(deps(v), job, signal);

    // Founder, director, then the titled designer; Ida has no title and Anna has an address.
    expect(v.asked).toHaveLength(1);
    expect(v.asked[0]!.map((g) => g.map((c) => c.address))).toEqual([
      ['soren.kjaer@acme.dk', 'soeren.kjaer@acme.dk'],
      ['ole.holm@acme.dk', 'ole@acme.dk'],
      ['mia.kro@acme.dk', 'mia@acme.dk'],
    ]);

    const rows = await emailsOf(companyId);
    expect(rows.find((r) => r.address === 'anna.berg@acme.dk')).toMatchObject({ first_name: 'Anna', last_name: 'Berg', title: 'Designer', found_via: 'page' });
    const soeren = rows.find((r) => r.address === 'soeren.kjaer@acme.dk');
    expect(soeren).toMatchObject({
      first_name: 'Søren',
      last_name: 'Kjær',
      title: 'CEO',
      seniority: 'founder',
      found_via: 'pattern',
      confidence: CONFIDENCE.accepted,
      source_url: 'https://acme.dk/team',
      verification: null,
    });
    expect(soeren?.person_id).toBeTruthy();
    expect(rows.find((r) => r.address === 'ole.holm@acme.dk')).toMatchObject({ seniority: 'director', confidence: 95 });
    expect(rows).toHaveLength(3);

    const [search] = await db.sql<{ emails_found: number }[]>`select emails_found from searches where id = ${searchId}`;
    expect(search?.emails_found).toBe(2);

    // The verify jobs that follow are answered from the cache and charge the user.
    const jobs = await db.sql<{ payload: { emailId: string } }[]>`select payload from jobs where type = 'verify' and status = 'queued'`;
    expect(jobs).toHaveLength(2);
    for (const j of jobs) {
      await runVerify(deps(v), { id: '2', type: 'verify', payload: j.payload as unknown as Record<string, unknown>, searchId, attempts: 1, maxAttempts: 3 }, signal);
    }
    expect((await emailsOf(companyId)).filter((r) => r.verification === 'valid').map((r) => r.address).sort()).toEqual([
      'ole.holm@acme.dk',
      'soeren.kjaer@acme.dk',
    ]);
    const [usage] = await db.sql<{ emails_verified: number }[]>`select emails_verified from usage where clerk_user_id = 'u1'`;
    expect(usage?.emails_verified).toBe(2);

    // A second run finds nobody left to ask.
    await runPeople(deps(v), job, signal);
    expect(v.asked).toHaveLength(2);
    expect(v.asked[1]!.map((g) => g[0]!.address)).toEqual(['mia.kro@acme.dk']);
  });

  it('uses the prior without a known pattern, and named addresses from other searches when there are some', async () => {
    const first = await seed({ people: [{ first: 'Jan', last: 'Müller', title: 'Founder', seniority: 'founder' }] });
    const v = stubVerifier({ accepts: ['jan@acme.dk'] });
    await runPeople(deps(v), first.job, signal);
    expect(v.asked[0]![0]!.map((c) => c.address)).toEqual(['jan@acme.dk', 'jan.mueller@acme.dk', 'jan.muller@acme.dk', 'janmueller@acme.dk', 'jmueller@acme.dk']);

    // Another search of the same domain learns first@ from the address confirmed above.
    await db.sql`update emails set verification = 'valid'`;
    const second = await seed({ people: [{ first: 'Eva', last: 'Sand', title: 'CTO', seniority: 'executive' }] });
    const v2 = stubVerifier({});
    await runPeople(deps(v2), second.job, signal);
    expect(v2.asked[0]![0]!.map((c) => c.address)).toEqual(['eva@acme.dk', 'eva.sand@acme.dk']);
  });

  it('guesses on a catch-all domain only as far as the evidence goes', async () => {
    const known = await seed({
      people: [
        { first: 'Anna', last: 'Berg', title: 'Designer', seniority: 'staff' },
        { first: 'Søren', last: 'Kjær', title: 'CEO', seniority: 'founder' },
        { first: 'Ole', last: 'Holm', title: 'Head of Sales', seniority: 'director' },
        { first: 'Mia', last: 'Kro', title: 'Designer', seniority: 'staff' },
      ],
      emails: ['anna.berg@acme.dk'],
    });
    await runPeople(deps(stubVerifier({ catchAll: true })), known.job, signal);
    const guesses = (await emailsOf(known.companyId)).filter((r) => r.found_via === 'pattern');
    expect(guesses.map((r) => [r.address, r.confidence])).toEqual([
      ['ole.holm@acme.dk', CONFIDENCE.catchAllKnownPattern],
      ['soren.kjaer@acme.dk', CONFIDENCE.catchAllKnownPattern],
    ]);

    const unknown = await seed({
      domain: 'other.dk',
      people: [
        { first: 'Søren', last: 'Kjær', title: 'CEO', seniority: 'founder' },
        { first: 'Ole', last: 'Holm', title: 'Head of Sales', seniority: 'director' },
      ],
    });
    await runPeople(deps(stubVerifier({ catchAll: true })), unknown.job, signal);
    expect((await emailsOf(unknown.companyId)).map((r) => [r.address, r.confidence])).toEqual([['soren@other.dk', CONFIDENCE.catchAllGuess]]);
  });

  it('comes back later when paced, and stays away from canceled searches, suppressed domains and spent quotas', async () => {
    const paced = await seed({ people: [{ first: 'Søren', last: 'Kjær', title: 'CEO', seniority: 'founder' }] });
    await runPeople(deps(stubVerifier({ paced: true })), paced.job, signal);
    const [requeued] = await db.sql<{ payload: { companyId: string; retry: number }; later: boolean }[]>`
      select payload, run_after > now() + interval '20 seconds' as later from jobs where type = 'people'
    `;
    expect(requeued).toMatchObject({ payload: { companyId: paced.companyId, retry: 0 }, later: true });
    expect(await emailsOf(paced.companyId)).toHaveLength(0);

    const canceled = await seed({ domain: 'c.dk', people: [{ first: 'Søren', last: 'Kjær', title: 'CEO', seniority: 'founder' }] });
    await db.sql`update searches set status = 'canceled' where id = ${canceled.searchId}`;
    const v = stubVerifier({ accepts: ['soren@c.dk'] });
    await runPeople(deps(v), canceled.job, signal);
    expect(v.asked).toHaveLength(0);

    const suppressed = await seed({ domain: 'gone.dk', people: [{ first: 'Søren', last: 'Kjær', title: 'CEO', seniority: 'founder' }] });
    await suppress(db.sql, { domain: 'gone.dk' }, 'admin');
    await runPeople(deps(v), suppressed.job, signal);
    expect(v.asked).toHaveLength(0);

    const spent = await seed({ domain: 'spent.dk', people: [{ first: 'Søren', last: 'Kjær', title: 'CEO', seniority: 'founder' }] });
    const period = new Date().toISOString().slice(0, 7);
    await db.sql`insert into usage (clerk_user_id, period, emails_verified) values ('u1', ${period}, 50) on conflict (clerk_user_id, period) do update set emails_verified = 50`;
    await runPeople(deps(v), spent.job, signal);
    expect(v.asked).toHaveLength(0);
    const [search] = await db.sql<{ status: string; error: string | null }[]>`select status, error from searches where id = ${spent.searchId}`;
    expect(search).toEqual({ status: 'failed', error: 'quota_exceeded' });
  });
});
