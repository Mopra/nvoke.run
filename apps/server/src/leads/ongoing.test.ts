import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TOP_PLAN, type IcpSearchParams, type Plan } from '@nvoke/shared';
import type { Ai } from '../ai/client.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import { failSearch, maybeFinishSearch } from '../worker/pipeline.js';
import { periodOf } from './plans.js';
import {
  MAX_ESCALATIONS_PER_DAY,
  MIN_SETTLED_FOR_RATE,
  STAGES,
  allowanceRoom,
  decide,
  markShortSearches,
  projectVerified,
  searchCounts,
  ongoingReserved,
  runOngoing,
  utcDay,
  verifiedTarget,
  type OngoingDeps,
  type RunRecord,
} from './ongoing.js';
import { IcpPlan, planQueryCount, savePlan, toPlan, type ClaudePlan, type ClaudeReplan } from './planner.js';
import { ensureAccount } from './quota.js';
import { cancelSearch, createSearch } from './repo.js';
import { queuedChecks } from '../worker/queue.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate accounts, jobs, ongoing_budget cascade`;
});

const params: IcpSearchParams = { description: 'Outbound agencies' };
const firstRaw: ClaudePlan = {
  summary: 'Outbound agencies',
  fit: ['Runs outbound for clients'],
  disqualifiers: ['A job board'],
  countries: ['us'],
  core: [{ q: 'cold email agency', country: 'us' }],
  directories: [],
  adjacent: [],
  wider: [],
  local: [],
};
const firstPlan = toPlan(firstRaw, params);

const q = (prefix: string, n: number, country: string) => Array.from({ length: n }, (_, i) => ({ q: `${prefix} ${i}`, country }));
let nextRound: ClaudeReplan = { directories: [], adjacent: [], wider: [], local: [] };
let replans = 0;
const ai: Ai = {
  ready: async () => true,
  structured: async () => {
    replans++;
    return { data: nextRound as never, model: 'm', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0.01 };
  },
};

const deps = (over: Partial<OngoingDeps> = {}): OngoingDeps => ({
  sql: db.sql,
  ai,
  log: silentLog,
  runBraveBudget: 120,
  dailyBraveBudget: 40,
  globalDailyBraveBudget: 400,
  ...over,
});

beforeEach(() => {
  replans = 0;
  nextRound = {
    directories: q('top outbound agencies list', 3, 'us'),
    adjacent: q('appointment setting agency', 3, 'us'),
    wider: q('cold email agency', 4, 'nl'),
    local: [],
  };
});

/** An icp search that ran out of work: running, with its plan and no jobs left. The account is on the top plan unless `plan` says otherwise. */
async function shortSearch(user = 'alice', limit = 100, over: { runs?: RunRecord[]; validEmails?: number; plan?: Plan } = {}): Promise<string> {
  await ensureAccount(db.sql, user);
  await db.sql`update accounts set plan = ${over.plan ?? TOP_PLAN} where clerk_user_id = ${user}`;
  const search = await createSearch(db.sql, user, { kind: 'icp', params }, limit);
  await savePlan(db.sql, search.id, firstPlan);
  await db.sql`delete from jobs where search_id = ${search.id}`;
  await db.sql`update searches set status = 'running', started_at = now(), stage = 'exhausted' where id = ${search.id}`;
  if (over.runs) await db.sql`update searches set runs = ${db.sql.json(over.runs as never)} where id = ${search.id}`;
  for (let i = 0; i < (over.validEmails ?? 0); i++) {
    const [c] = await db.sql<{ id: string }[]>`
      insert into companies (search_id, clerk_user_id, name, domain, website, source)
      values (${search.id}, ${user}, ${`Co ${i}`}, ${`co${i}.test`}, ${`https://co${i}.test/`}, 'test') returning id`;
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, checked_at)
      values (${c!.id}, ${search.id}, ${user}, ${`info@co${i}.test`}, 'generic', 'valid', now())`;
  }
  return search.id;
}

async function row(id: string) {
  const [r] = await db.sql<
    { status: string; stage: string | null; stage_note: string | null; runs: RunRecord[]; limit: number; plan: unknown; finished_at: Date | null }[]
  >`select status, stage, stage_note, runs, "limit", plan, finished_at from searches where id = ${id}`;
  return r!;
}

/** Verified emails already charged to the user this month. */
const used = (user: string, n: number) =>
  db.sql`insert into usage (clerk_user_id, period, emails_verified) values (${user}, ${periodOf(new Date())}, ${n})
    on conflict (clerk_user_id, period) do update set emails_verified = excluded.emails_verified`;

const verifyJob = (id: string, status = 'queued') =>
  db.sql`insert into jobs (type, payload, search_id, status) values ('verify', ${db.sql.json({ emailId: 'x' })}, ${id}, ${status})`;

const findJobs = async (id: string) =>
  (await db.sql<{ n: number }[]>`select count(*)::int as n from jobs where search_id = ${id} and type = 'find' and status = 'queued'`)[0]!.n;

describe('decide', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const base = { runs: [], limit: 150, ongoing: false, verified: 10, verifiedSince: 0, room: 10_000, now };
  const run = (trigger?: RunRecord['trigger'], hoursAgo = 1): RunRecord => ({
    params,
    limit: 150,
    foundBefore: 0,
    createdAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
    ...(trigger ? { trigger } : {}),
  });

  it('aims for 30% of the limit the user asked for, at least 100', () => {
    expect(verifiedTarget(150)).toBe(100);
    expect(verifiedTarget(1000)).toBe(300);
  });

  it('pushes on while short, says so with the real count', () => {
    expect(decide(base)).toEqual({ escalate: true, note: 'Found 10 verified so far, short of 100. Working out where else to look' });
    // The target follows the user's run, not the rounds nvoke added.
    expect(decide({ ...base, runs: [run(undefined, 30), { ...run('escalate'), limit: 900 }], verified: 120 }).escalate).toBe(false);
  });

  it('stops at the target, the daily cap, an ongoing round or a spent allowance', () => {
    expect(decide({ ...base, verified: 100 })).toMatchObject({ escalate: false, stage: 'done', note: 'Found 100 verified emails, enough for this search.' });
    const capped = decide({ ...base, runs: [run(undefined, 5), ...Array.from({ length: MAX_ESCALATIONS_PER_DAY }, () => run('escalate'))] });
    expect(capped).toMatchObject({ escalate: false, stage: 'exhausted' });
    expect(capped.note).toContain('Looked further 3 times in the last 24 hours. Keep it ongoing to look again every day');
    // Rounds older than a day do not count.
    expect(decide({ ...base, runs: [run(undefined, 80), ...Array.from({ length: 3 }, () => run('escalate', 30))] }).escalate).toBe(true);
    expect(decide({ ...base, ongoing: true, runs: [run(), run('ongoing')], verified: 52, verifiedSince: 7 })).toMatchObject({
      escalate: false,
      note: 'Added 7 verified emails in this daily round, 52 in all. Next round tomorrow',
    });
    expect(decide({ ...base, ongoing: true, room: 0 })).toMatchObject({ escalate: false, stage: 'paused', note: 'Found 10 verified emails. Paused until your allowance renews' });
  });

  it('judges early by what the pending checks could still bring', () => {
    expect(decide({ ...base, projected: 120 }).escalate).toBe(false);
  });

  it('never aims past what the allowance can still take', () => {
    // 10 found and room for 15 more: aims for 25, not 100.
    expect(decide({ ...base, room: 15 })).toEqual({ escalate: true, note: 'Found 10 verified so far, short of 25. Working out where else to look' });
    // Open checks that fill the allowance end it, however far from 100.
    expect(decide({ ...base, room: 15, projected: 25 })).toMatchObject({
      escalate: false,
      stage: 'done',
      note: 'Found 10 verified emails, as many as this month’s allowance can take.',
    });
    expect(decide({ ...base, room: 0 })).toMatchObject({ escalate: false, stage: 'paused', note: 'Found 10 verified emails. This month’s allowance is used up' });
  });

  it('never pushes on while checks are queued or deferred', () => {
    expect(decide({ ...base, checksQueued: 268 })).toMatchObject({
      escalate: false,
      stage: STAGES.round,
      note: 'Found 10 verified so far. Checking 268 addresses before looking further',
    });
    // Enough is still enough.
    expect(decide({ ...base, checksQueued: 3, projected: 100 })).toMatchObject({ escalate: false, stage: 'done' });
  });
});

describe('never short', () => {
  it('holds a short icp search instead of ending it, then starts a fresh round', async () => {
    const id = await shortSearch('alice', 100, { validEmails: 3 });
    expect(await maybeFinishSearch(db.sql, id)).toBe(false);
    expect(await row(id)).toMatchObject({ status: 'running', stage: STAGES.hold, stage_note: 'Found 3 verified so far, short of 100. Working out where else to look' });

    const result = await runOngoing(deps(), { daily: false });
    expect(result.rounds).toBe(1);
    expect(replans).toBe(1);
    const after = await row(id);
    expect(after.status).toBe('running');
    expect(after.stage).toBe(STAGES.round);
    expect(after.stage_note).toBe('Found 3 verified so far. Looking in 1 more country, 3 new niches and 3 more list page searches');
    expect(after.runs).toHaveLength(2);
    expect(after.runs[1]).toMatchObject({ trigger: 'escalate', limit: 100, foundBefore: 3 });
    expect(after.limit).toBe(103);
    const plan = IcpPlan.parse(after.plan);
    expect(plan.round).toBe(1);
    expect(planQueryCount(plan)).toBe(10);
    expect(await findJobs(id)).toBe(1);
  });

  it('leaves other kinds and searches at their target alone', async () => {
    await ensureAccount(db.sql, 'bob');
    const local = await createSearch(db.sql, 'bob', { kind: 'local', params: { niche: 'dentists', location: 'Aarhus' } }, 50);
    await db.sql`delete from jobs where search_id = ${local.id}`;
    await db.sql`update searches set status = 'running' where id = ${local.id}`;
    expect(await maybeFinishSearch(db.sql, local.id)).toBe(true);

    const full = await shortSearch('bob', 100, { validEmails: 100 });
    expect(await maybeFinishSearch(db.sql, full)).toBe(true);
    expect(await row(full)).toMatchObject({ status: 'done', stage: 'done', stage_note: 'Found 100 verified emails, enough for this search.' });
  });

  it('ends plainly when nothing new is left, and after three rounds a day', async () => {
    const id = await shortSearch('carol');
    await maybeFinishSearch(db.sql, id);
    nextRound = { directories: [{ q: 'cold email agency', country: 'us' }], adjacent: [], wider: [], local: [] };
    await runOngoing(deps(), { daily: false });
    const ended = await row(id);
    expect(ended.status).toBe('done');
    expect(ended.stage).toBe('exhausted');
    expect(ended.stage_note).toContain('nvoke has run every search it could think of');

    const now = Date.now();
    const runs: RunRecord[] = [
      { params, limit: 100, foundBefore: 0, createdAt: new Date(now - 5 * 3_600_000).toISOString() },
      ...[1, 2, 3].map((h) => ({ params, limit: 100, foundBefore: 0, createdAt: new Date(now - h * 3_600_000).toISOString(), trigger: 'escalate' as const })),
    ];
    const capped = await shortSearch('carol', 100, { runs });
    expect(await maybeFinishSearch(db.sql, capped)).toBe(true);
    expect((await row(capped)).stage_note).toContain('short of 100. Looked further 3 times in the last 24 hours');
  });

  it('starts the next round early once the checks are done and what is left cannot close the gap', async () => {
    const id = await shortSearch('dave', 100, { validEmails: 2 });
    await db.sql`update searches set stage = 'deeper' where id = ${id}`;
    const [c] = await db.sql<{ id: string }[]>`select id from companies where search_id = ${id} limit 1`;
    await db.sql`insert into jobs (type, payload, search_id) values ('people', ${db.sql.json({ companyId: c!.id })}, ${id})`;
    // A deferred check waits: no early call while it is queued.
    await db.sql`insert into jobs (type, payload, search_id, run_after) values ('verify', ${db.sql.json({ emailId: 'x', deferred: true })}, ${id}, now() + interval '5 minutes')`;
    expect((await queuedChecks(db.sql, id)).queued).toBe(1);
    const now = new Date();
    expect(await markShortSearches(db.sql, now)).toBe(0);
    await db.sql`update jobs set status = 'done' where search_id = ${id} and type = 'verify'`;
    expect(await markShortSearches(db.sql, new Date(now.getTime() + 3 * 60_000))).toBe(1);
    expect((await row(id)).stage).toBe(STAGES.hold);
    // A crawl still running means more addresses may come: no early call.
    const other = await shortSearch('dave');
    await db.sql`insert into jobs (type, payload, search_id) values ('crawl', ${db.sql.json({ companyId: 'x' })}, ${other})`;
    expect(await markShortSearches(db.sql)).toBe(0);
  });

  it('counts a company waiting for fit after its crawl as checks to come, and holds no round for it', async () => {
    const id = await shortSearch('fay', 100, { validEmails: 2 });
    await db.sql`update searches set stage = 'deeper' where id = ${id}`;
    const [c] = await db.sql<{ id: string }[]>`
      insert into companies (search_id, clerk_user_id, name, domain, website, source, crawl_status, fit_state)
      values (${id}, 'fay', 'Waiting', 'waiting.test', 'https://waiting.test/', 'brave', 'done', 'pending') returning id`;
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind)
      values (${c!.id}, ${id}, 'fay', 'info@waiting.test', 'generic'), (${c!.id}, ${id}, 'fay', 'mette@waiting.test', 'personal')`;
    await db.sql`insert into people (company_id, search_id, first_name, last_name, title, source) values (${c!.id}, ${id}, 'Mette', 'Hansen', 'CEO', 'page')`;
    // Its two addresses wait for fit, not for a verify job; with people it may get a people job too.
    expect(await queuedChecks(db.sql, id)).toEqual({ queued: 2, capacity: 0 });
    expect((await searchCounts(db.sql, id)).peoplePending).toBe(1);
    expect(await markShortSearches(db.sql)).toBe(0);
    expect((await row(id)).stage).toBe('deeper');
    // A waiting company with nothing but people still counts once.
    await db.sql`delete from emails where company_id = ${c!.id}`;
    expect((await queuedChecks(db.sql, id)).queued).toBe(1);
  });

  it('judges a search early once, then waits before looking again', async () => {
    const id = await shortSearch('ivan', 100, { validEmails: 2 });
    await db.sql`update searches set stage = 'deeper' where id = ${id}`;
    // 120 unchecked addresses could still close the gap.
    for (let i = 0; i < 120; i++) {
      await db.sql`
        insert into emails (company_id, search_id, clerk_user_id, address, kind)
        select id, search_id, clerk_user_id, ${`x${i}@co0.test`}, 'personal' from companies where search_id = ${id} limit 1`;
    }
    const now = new Date();
    expect(await markShortSearches(db.sql, now)).toBe(0);
    await db.sql`update emails set verification = 'invalid' where search_id = ${id} and verification is null`;
    expect(await markShortSearches(db.sql, new Date(now.getTime() + 60_000))).toBe(0);
    expect(await markShortSearches(db.sql, new Date(now.getTime() + 3 * 60_000))).toBe(1);
  });

  it('backs off a round whose claim keeps getting dropped, and ends it after three tries', async () => {
    const id = await shortSearch('judy');
    const claim = (minutesAgo: number, attempts: number) => db.sql`
      update searches set stage = 'replan', plan = plan || jsonb_build_object('claimedAt', (now() - make_interval(mins => ${minutesAgo}))::text, 'claimAttempts', ${attempts}::int)
      where id = ${id}`;
    await claim(15, 2);
    expect((await runOngoing(deps(), { daily: false })).rounds).toBe(0);
    await claim(45, 3);
    expect((await runOngoing(deps(), { daily: false })).rounds).toBe(1);
    expect(replans).toBe(0);
    expect(await row(id)).toMatchObject({ status: 'done', stage: 'exhausted' });
    expect((await row(id)).stage_note).toContain('Planning more searches failed 3 times');
  });

  it('says plainly when a held search is canceled or fails, and a cancel ends ongoing', async () => {
    const id = await shortSearch('kim');
    await db.sql`update searches set ongoing = true where id = ${id}`;
    await maybeFinishSearch(db.sql, id);
    const canceled = await cancelSearch(db.sql, 'kim', id);
    expect(canceled && canceled.ongoing).toBe(false);
    expect(await row(id)).toMatchObject({ status: 'canceled', stage: 'canceled', stage_note: 'Stopped' });
    expect((await runOngoing(deps(), { daily: false })).rounds).toBe(0);

    const failed = await shortSearch('kim');
    await db.sql`update searches set ongoing = true where id = ${failed}`;
    await failSearch(db.sql, failed, 'boom');
    expect(await row(failed)).toMatchObject({ status: 'failed', stage: 'failed', stage_note: 'Stopped by an error. Trying again at the next daily round' });
    const quota = await shortSearch('kim');
    await failSearch(db.sql, quota, 'quota_exceeded');
    expect(await row(quota)).toMatchObject({ stage: 'paused', stage_note: 'This month’s allowance is used up' });
  });

  it('ends with a note when Claude is out of reach', async () => {
    const id = await shortSearch('erin');
    await maybeFinishSearch(db.sql, id);
    await runOngoing(deps({ ai: undefined }), { daily: false });
    expect(await row(id)).toMatchObject({ status: 'done', stage: 'exhausted' });
    expect((await row(id)).stage_note).toContain('Claude is out of reach');
  });
});

describe('ongoing', () => {
  /** An ongoing search created two days back an hour earlier in the day, ended `hoursAgo`. */
  async function endedOngoing(user: string, hoursAgo = 25, status = 'done'): Promise<string> {
    const id = await shortSearch(user);
    await db.sql`
      update searches set status = ${status}, ongoing = true, finished_at = now() - make_interval(secs => ${hoursAgo * 3600}),
        created_at = now() - interval '2 days 1 hour'
      where id = ${id}`;
    return id;
  }

  it('runs a daily round at the time of day the search was made, inside its reserved budget', async () => {
    const id = await endedOngoing('alice');
    // Ended after today's round time came round: waits for tomorrow's.
    const fresh = await endedOngoing('alice', 0.5);
    nextRound = { directories: q('list', 8, 'us'), adjacent: q('niche', 14, 'us'), wider: q('wider', 14, 'gb'), local: [] };
    const result = await runOngoing(deps());
    expect(result.daily).toBe(1);
    const after = await row(id);
    expect(after.status).toBe('running');
    expect(after.runs.at(-1)).toMatchObject({ trigger: 'ongoing', braveBudget: 40 });
    const plan = IcpPlan.parse(after.plan);
    expect(plan.braveBudget).toBe(40);
    expect(planQueryCount(plan)).toBe(36);
    expect(after.stage_note).toMatch(/^Daily round\. Found 0 verified so far\. Looking in 1 more country/);
    expect(await findJobs(id)).toBe(1);
    expect(await ongoingReserved(db.sql, utcDay(new Date()))).toBe(40);
    expect((await row(fresh)).status).toBe('done');
  });

  it('holds the global daily budget across searches, reserving before Claude plans', async () => {
    const a = await endedOngoing('alice');
    const b = await endedOngoing('bob', 26);
    await runOngoing(deps({ globalDailyBraveBudget: 43 }));
    // The one waiting longest went first with 40; 3 requests left is too few for a round.
    expect([(await row(a)).status, (await row(b)).status]).toEqual(['done', 'running']);
    // What is left still buys a smaller round.
    const c = await endedOngoing('carl', 27);
    await runOngoing(deps({ globalDailyBraveBudget: 48 }));
    expect((await row(c)).runs.at(-1)).toMatchObject({ trigger: 'ongoing', braveBudget: 8 });
    expect(await ongoingReserved(db.sql, utcDay(new Date()))).toBe(48);
  });

  it('gives the reservation back when a daily round does not start', async () => {
    const id = await endedOngoing('dora');
    nextRound = { directories: [{ q: 'cold email agency', country: 'us' }], adjacent: [], wider: [], local: [] };
    await runOngoing(deps());
    expect(await row(id)).toMatchObject({ status: 'done', stage: 'exhausted' });
    expect((await row(id)).stage_note).toContain('Nothing new to search for in this daily round');
    expect(await ongoingReserved(db.sql, utcDay(new Date()))).toBe(0);
  });

  it('pauses while the allowance is used up and resumes when it renews', async () => {
    const id = await endedOngoing('frank');
    await db.sql`update accounts set plan = 'free' where clerk_user_id = 'frank'`;
    // One email left of 50 is less than one Sonar email.
    await used('frank', 49);
    await runOngoing(deps());
    expect(await row(id)).toMatchObject({ status: 'done', stage: 'paused', stage_note: 'Found 0 verified emails. Paused until your allowance renews' });
    await db.sql`delete from usage where clerk_user_id = 'frank'`;
    await runOngoing(deps());
    expect((await row(id)).status).toBe('running');
  });

  it('picks up failed searches and canceled ones switched back on', async () => {
    const failed = await endedOngoing('gina', 25, 'failed');
    const canceled = await endedOngoing('gina', 26, 'canceled');
    await runOngoing(deps());
    expect(await row(failed)).toMatchObject({ status: 'running', stage: STAGES.round });
    expect(await row(canceled)).toMatchObject({ status: 'running', stage: STAGES.round });
  });

  it('does not chain fresh rounds onto a daily round', async () => {
    const id = await endedOngoing('hank');
    await runOngoing(deps());
    await db.sql`delete from jobs where search_id = ${id}`;
    expect(await maybeFinishSearch(db.sql, id)).toBe(true);
    expect(await row(id)).toMatchObject({ status: 'done', stage: 'done', stage_note: 'Added 0 verified emails in this daily round, 0 in all. Next round tomorrow' });
  });
});

describe('projectVerified', () => {
  it('counts unchecked addresses at the valid rate seen so far, and one per people job', () => {
    // 200 checks back, half valid: 60 unchecked bring about 30.
    expect(projectVerified({ verified: 100, settled: 200, unchecked: 60, peoplePending: 4 })).toBe(134);
    // Too few back to tell: every unchecked address counts.
    expect(projectVerified({ verified: 5, settled: MIN_SETTLED_FOR_RATE - 1, unchecked: 60, peoplePending: 0 })).toBe(65);
  });
});

describe('escalation while checks and people probes are left', () => {
  async function withAddresses(id: string, n: number, verification: string | null) {
    const [c] = await db.sql<{ id: string; clerk_user_id: string }[]>`select id, clerk_user_id from companies where search_id = ${id} limit 1`;
    for (let i = 0; i < n; i++) {
      await db.sql`
        insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, checked_at)
        values (${c!.id}, ${id}, ${c!.clerk_user_id}, ${`p${verification ?? 'open'}${i}@co0.test`}, 'personal', ${verification}, ${verification ? new Date() : null})`;
    }
  }

  it('holds a search whose open addresses cannot close the gap at the rate seen so far, even with people jobs queued', async () => {
    // Target 100: 40 valid of 100 checked, 80 open (about 32 more) and 3 people jobs: 75, short.
    const id = await shortSearch('erin', 100, { validEmails: 40 });
    await withAddresses(id, 60, 'invalid');
    await withAddresses(id, 80, null);
    const [c] = await db.sql<{ id: string }[]>`select id from companies where search_id = ${id} limit 1`;
    for (let i = 0; i < 3; i++) {
      await db.sql`insert into jobs (type, payload, search_id) values ('people', ${db.sql.json({ companyId: c!.id })}, ${id})`;
    }
    expect(await markShortSearches(db.sql)).toBe(1);
    expect((await row(id)).stage).toBe(STAGES.hold);

    // The tick starts the fresh round at once, with people jobs still queued.
    const result = await runOngoing(deps(), { daily: false });
    expect(result.rounds).toBe(1);
    expect((await row(id)).stage).toBe(STAGES.round);
    expect(await findJobs(id)).toBe(1);
  });

  it('leaves a search alone while its open checks can still reach the target', async () => {
    // 40 valid of 50 checked: 80 open at that rate bring 64, enough for 100.
    const id = await shortSearch('frank', 100, { validEmails: 40 });
    await withAddresses(id, 10, 'invalid');
    await withAddresses(id, 80, null);
    expect(await markShortSearches(db.sql)).toBe(0);
    expect((await row(id)).stage).toBe('exhausted');
  });

  it('does not count role inboxes that will be left unchecked, or ones already left out', async () => {
    const id = await shortSearch('gina', 100, { validEmails: 2 });
    const [c] = await db.sql<{ id: string; clerk_user_id: string }[]>`select id, clerk_user_id from companies where search_id = ${id} limit 1`;
    await db.sql`
      insert into emails (company_id, search_id, clerk_user_id, address, kind, verification)
      values (${c!.id}, ${id}, 'gina', 'mette@co0.test', 'personal', 'valid')`;
    for (let i = 0; i < 150; i++) {
      await db.sql`
        insert into emails (company_id, search_id, clerk_user_id, address, kind, skipped)
        values (${c!.id}, ${id}, 'gina', ${`role${i}@co0.test`}, 'generic', ${i % 2 ? 'role_inbox' : null})`;
    }
    expect((await searchCounts(db.sql, id)).unchecked).toBe(0);
  });
});

describe('escalation within the allowance', () => {
  it('counts the room left in icp emails, three of the allowance each', async () => {
    await ensureAccount(db.sql, 'lena');
    expect(await allowanceRoom(db.sql, 'lena')).toBe(16);
    await used('lena', 45);
    expect(await allowanceRoom(db.sql, 'lena')).toBe(1);
    await used('lena', 49);
    expect(await allowanceRoom(db.sql, 'lena')).toBe(0);
  });

  it('starts no round when the allowance has no room left', async () => {
    const id = await shortSearch('mona', 100, { validEmails: 3, plan: 'free' });
    await used('mona', 49);
    expect(await maybeFinishSearch(db.sql, id)).toBe(true);
    expect(await row(id)).toMatchObject({ status: 'done', stage: 'paused', stage_note: 'Found 3 verified emails. This month’s allowance is used up' });
    expect(replans).toBe(0);

    // A held search whose allowance ran out meanwhile ends without asking Claude.
    const held = await shortSearch('mona', 100, { validEmails: 3, plan: 'free' });
    await db.sql`update searches set stage = ${STAGES.hold} where id = ${held}`;
    await runOngoing(deps(), { daily: false });
    expect(await row(held)).toMatchObject({ status: 'done', stage: 'paused' });
    expect(replans).toBe(0);
    expect(await findJobs(held)).toBe(0);
  });

  it('does not hold early when the open addresses fill what the allowance can take', async () => {
    // Free plan, 30 of 50 used: room for 10 more. 10 found and 20 open aim past that, so no round.
    const id = await shortSearch('nina', 100, { validEmails: 10, plan: 'free' });
    await used('nina', 30);
    const [c] = await db.sql<{ id: string }[]>`select id from companies where search_id = ${id} limit 1`;
    for (let i = 0; i < 20; i++) {
      await db.sql`
        insert into emails (company_id, search_id, clerk_user_id, address, kind) values (${c!.id}, ${id}, 'nina', ${`open${i}@co0.test`}, 'personal')`;
    }
    expect(await markShortSearches(db.sql)).toBe(0);
    // On the top plan the same search is short of 100 and is held.
    await db.sql`update accounts set plan = ${TOP_PLAN} where clerk_user_id = 'nina'`;
    await db.sql`update searches set plan = plan - 'earlyCheckedAt' where id = ${id}`;
    expect(await markShortSearches(db.sql)).toBe(1);
  });

  it('asks the planner for no more than the allowance can take', async () => {
    let prompt = '';
    const spy: Ai = { ready: ai.ready, structured: (req) => ((prompt = req.prompt), ai.structured(req)) };
    const id = await shortSearch('olga', 100, { validEmails: 3, plan: 'free' });
    await used('olga', 20);
    await maybeFinishSearch(db.sql, id);
    await runOngoing(deps({ ai: spy }), { daily: false });
    // 30 of 50 left is 10 icp emails: 3 found, aiming for 13.
    expect(prompt).toContain('3 verified email addresses, aiming for 13');
    expect((await row(id)).stage).toBe(STAGES.round);
  });

  it('sends a held search back to running when checks were queued after the hold', async () => {
    const id = await shortSearch('pia', 100, { validEmails: 3 });
    await db.sql`update searches set stage = ${STAGES.hold} where id = ${id}`;
    await verifyJob(id);
    await runOngoing(deps(), { daily: false });
    expect(replans).toBe(0);
    expect(await row(id)).toMatchObject({ status: 'running', stage: STAGES.round, stage_note: 'Found 3 verified so far. Checking 1 address before looking further' });
    // The last check finishing judges again, and holds it for the next round.
    await db.sql`delete from jobs where search_id = ${id}`;
    expect(await maybeFinishSearch(db.sql, id)).toBe(false);
    expect((await row(id)).stage).toBe(STAGES.hold);
  });
});
