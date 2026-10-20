// Never short, and ongoing (docs/SPEC.md, "Describe your customer"). A plain
// words (`icp`) search that runs out of planned work with fewer verified
// emails than it aims for does not end: the last job holds it
// (holdForEscalation, called from maybeFinishSearch), or a tick spots it once
// only checks are left (markShortSearches). The tick then asks the planner for
// a fresh round (planner.ts replan) and starts another run into the same list,
// at most MAX_ESCALATIONS_PER_DAY in 24 hours. An ongoing search gets one
// round a day at its own time of day, within a daily Brave budget per search
// and one for all ongoing searches together (reserved in `ongoing_budget`),
// and pauses while the account's allowance is used up. A round never buys
// what the allowance cannot take: the verified target is capped at what the
// account's allowance still has room for (an icp email counts as
// ICP_EMAIL_WEIGHT), and no round starts while the search still has checks
// queued or deferred, its companies waiting for fit after the crawl counted
// among them. Every step says what it does in stage_note, with counts from
// the database.

import type { Logger } from 'pino';
import type { Sql, TransactionSql } from 'postgres';
import { ICP_EMAIL_WEIGHT, IcpSearchParams } from '@nvoke/shared';
import type { Ai } from '../ai/client.js';
import { searchFinished } from '../webhooks/events.js';
import { stillToCheck, type PolicyEmail } from './check-policy.js';
import { emailsPerMonth, maxSearchLimit, periodOf } from './plans.js';
import { IcpPlan, PLAN_CAPS, freshCountries, replan, savePlan } from './planner.js';
import { emailsVerified, planOf } from './quota.js';
import { startAutoRun } from './repo.js';
import { queuedChecks } from '../worker/queue.js';

type Db = Sql | TransactionSql;

/** Verified emails a search aims for: this share of the companies the user asked for, never below the floor. */
export const VERIFIED_TARGET = { share: 0.3, min: 100 } as const;
/** Fresh rounds one search may start on its own in 24 hours. */
export const MAX_ESCALATIONS_PER_DAY = 3;
/**
 * A claim this old without a find job was dropped (a worker stopped, an
 * unexpected error): claim it again, waiting twice as long each time, and end
 * the search after MAX_CLAIM_ATTEMPTS.
 */
export const REPLAN_STALE_MS = 10 * 60_000;
export const MAX_CLAIM_ATTEMPTS = 3;
/** A search judged early and left alone is not judged early again for this long. */
export const EARLY_RECHECK_MS = 2 * 60_000;
/** The smallest daily round worth planning, in paid Brave requests. */
export const MIN_ROUND_BUDGET = 4;
/** How often the worker looks for searches to push on. */
export const ONGOING_TICK_MS = 15_000;

/** Stages this module writes. */
export const STAGES = { hold: 'escalate', replan: 'replan', round: 'round', paused: 'paused', done: 'done', exhausted: 'exhausted' } as const;

export interface RunRecord {
  params: unknown;
  limit: number;
  foundBefore: number;
  createdAt: string;
  trigger?: 'escalate' | 'ongoing';
  /** Paid Brave requests an ongoing round reserved; the icp adapter holds the run to it. */
  braveBudget?: number;
}

export function verifiedTarget(userLimit: number): number {
  return Math.max(VERIFIED_TARGET.min, Math.ceil(VERIFIED_TARGET.share * userLimit));
}

/**
 * Verified emails of an icp search the account's allowance can still take
 * this month: what is left of it, each email counting ICP_EMAIL_WEIGHT. Zero
 * means no round may start: whatever it found could not be handed over.
 */
export async function allowanceRoom(db: Db, userId: string, now: Date = new Date()): Promise<number> {
  const left = emailsPerMonth(await planOf(db, userId)) - (await emailsVerified(db, userId, periodOf(now)));
  return Math.max(0, Math.floor(left / ICP_EMAIL_WEIGHT));
}

/** The limit of the latest run the user started (the first run or Search more). */
export function userLimit(runs: RunRecord[], fallback: number): number {
  return [...runs].reverse().find((r) => !r.trigger)?.limit ?? fallback;
}

/** Fresh rounds started on the search's own since `since`. */
export function escalationsSince(runs: RunRecord[], since: Date): number {
  return runs.filter((r) => r.trigger === 'escalate' && new Date(r.createdAt) >= since).length;
}

/** "1 country", "6 countries". */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const verifiedEmails = (n: number) => plural(n, 'verified email', 'verified emails');
const addresses = (n: number) => plural(n, 'address', 'addresses');

/** What a fresh round does, for the stage note: "Looking in 9 more countries and 6 new niches". */
export function roundNote(previous: IcpPlan, plan: IcpPlan): string {
  const fresh = freshCountries(previous, plan).length;
  const parts = [
    fresh ? plural(fresh, 'more country', 'more countries') : '',
    plan.adjacent.length ? plural(plan.adjacent.length, 'new niche', 'new niches') : '',
    plan.directories.length ? plural(plan.directories.length, 'more list page search', 'more list page searches') : '',
    !fresh && plan.wider.length ? plural(plan.wider.length, 'search in new cities', 'searches in new cities') : '',
    plan.local.length ? plural(plan.local.length, 'more place on the map', 'more places on the map') : '',
  ].filter(Boolean);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? 'new searches');
  return fresh ? `Looking in ${list}` : `Trying ${list}`;
}

interface Counts {
  companies: number;
  verified: number;
  /** Addresses found, not checked yet, and still to be checked. */
  unchecked: number;
  /** Addresses whose check came back, valid or not. */
  settled: number;
  /** People jobs of the search still to run, and companies with named people waiting for fit: each may add a personal address. */
  peoplePending: number;
}

/** Below this many settled checks the valid rate is unknown, and every unchecked address is counted as valid. */
export const MIN_SETTLED_FOR_RATE = 20;

/**
 * The verified count a search can still expect to reach: what it has, plus
 * the unchecked addresses at the share of checks that came back valid so far
 * (all of them while too few came back to tell), plus one per people job
 * still to run.
 */
export function projectVerified(c: Pick<Counts, 'verified' | 'unchecked' | 'settled' | 'peoplePending'>): number {
  const rate = c.settled >= MIN_SETTLED_FOR_RATE ? c.verified / c.settled : 1;
  return c.verified + Math.round(c.unchecked * rate) + c.peoplePending;
}

/** Counts from the database, so the notes match what the user sees. */
export async function searchCounts(db: Db, searchId: string, since?: Date): Promise<Counts & { verifiedSince: number }> {
  const [row] = await db<(Omit<Counts, 'unchecked'> & { verifiedSince: number; checkInboxes: boolean })[]>`
    select
      (select count(*)::int from companies where search_id = ${searchId}) as companies,
      count(*) filter (where verification = 'valid')::int as verified,
      count(*) filter (where verification is not null)::int as settled,
      (select count(*)::int from jobs where search_id = ${searchId} and type = 'people' and status in ('queued', 'running'))
        + (select count(*)::int from companies c where c.search_id = ${searchId} and c.fit_state = 'pending'
            and exists (select 1 from people p where p.company_id = c.id)) as "peoplePending",
      count(*) filter (where verification = 'valid' and checked_at >= ${(since ?? new Date(0)).toISOString()}::timestamptz)::int as "verifiedSince",
      coalesce((select (to_jsonb(s) ->> 'check_inboxes')::boolean from searches s where s.id = ${searchId}), false) as "checkInboxes"
    from emails where search_id = ${searchId}
  `;
  if (!row) return { companies: 0, verified: 0, unchecked: 0, settled: 0, peoplePending: 0, verifiedSince: 0 };
  // Unchecked addresses still to be checked: not one left out on purpose, nor one the
  // company's settled addresses already make unnecessary (check-policy.ts). Those of a
  // company waiting for fit after its crawl count too: most companies that get there are kept.
  const open = await db<(PolicyEmail & { company_id: string })[]>`
    select company_id, address, kind, first_name, last_name, seniority, title, verification, skipped from emails
    where search_id = ${searchId} and skipped is null
      and company_id in (select company_id from emails where search_id = ${searchId} and verification is null and skipped is null)
  `;
  const byCompany = new Map<string, PolicyEmail[]>();
  for (const e of open) byCompany.set(e.company_id, [...(byCompany.get(e.company_id) ?? []), e]);
  let unchecked = 0;
  for (const emails of byCompany.values()) {
    for (const [i, e] of emails.entries()) {
      if (e.verification !== null) continue;
      if (stillToCheck(e, emails.filter((_, j) => j !== i), row.checkInboxes)) unchecked++;
    }
  }
  const { checkInboxes: _, ...counts } = row;
  return { ...counts, unchecked };
}

interface SearchState {
  id: string;
  clerk_user_id: string;
  status: string;
  stage: string | null;
  ongoing: boolean;
  limit: number;
  runs: RunRecord[] | null;
}

export type Verdict = { escalate: true; note: string } | { escalate: false; stage: string; note: string };

/**
 * Whether a search that ran out of work pushes on. `projected` is the
 * verified count to judge by: the real one at the end, or that plus the
 * addresses still being checked when judging early. `room` is how many more
 * verified emails the allowance can take (allowanceRoom): the target never
 * asks for more than that, and with none left nothing pushes on. While
 * `checksQueued` is above zero it never pushes on either.
 */
export function decide(input: {
  runs: RunRecord[];
  limit: number;
  ongoing: boolean;
  verified: number;
  projected?: number;
  verifiedSince: number;
  room: number;
  checksQueued?: number;
  now: Date;
}): Verdict {
  const { runs, verified, ongoing } = input;
  const wanted = verifiedTarget(userLimit(runs, input.limit));
  const target = Math.min(wanted, verified + input.room);
  const last = runs.at(-1);
  if (input.room <= 0) {
    return {
      escalate: false,
      stage: STAGES.paused,
      note: `Found ${verifiedEmails(verified)}. ${ongoing ? 'Paused until your allowance renews' : 'This month’s allowance is used up'}`,
    };
  }
  if (last?.trigger === 'ongoing') {
    return {
      escalate: false,
      stage: STAGES.done,
      note: `Added ${verifiedEmails(input.verifiedSince)} in this daily round, ${verified} in all.${ongoing ? ' Next round tomorrow' : ''}`,
    };
  }
  if ((input.projected ?? verified) >= target) {
    const enough = target < wanted ? 'as many as this month’s allowance can take' : 'enough for this search';
    return { escalate: false, stage: STAGES.done, note: `Found ${verifiedEmails(verified)}, ${enough}.${ongoing ? ' Looking for new ones every day' : ''}` };
  }
  const checks = input.checksQueued ?? 0;
  if (checks > 0) {
    return { escalate: false, stage: STAGES.round, note: `Found ${verified} verified so far. Checking ${addresses(checks)} before looking further` };
  }
  const recent = escalationsSince(runs, new Date(input.now.getTime() - 24 * 3_600_000));
  if (recent >= MAX_ESCALATIONS_PER_DAY) {
    return {
      escalate: false,
      stage: STAGES.exhausted,
      note: `Found ${verifiedEmails(verified)}, short of ${target}. Looked further ${MAX_ESCALATIONS_PER_DAY} times in the last 24 hours.${
        ongoing ? ' Next daily round tomorrow' : ' Keep it ongoing to look again every day'
      }`,
    };
  }
  return { escalate: true, note: `Found ${verified} verified so far, short of ${target}. Working out where else to look` };
}

async function stateOf(db: Db, searchId: string): Promise<SearchState | null> {
  const [row] = await db<SearchState[]>`
    select id, clerk_user_id, status, stage, ongoing, "limit", runs from searches where id = ${searchId} and kind = 'icp' for update
  `;
  return row ?? null;
}

async function verdictFor(db: Db, s: SearchState, now: Date, early: boolean): Promise<Verdict> {
  const runs = s.runs ?? [];
  const last = runs.at(-1);
  const counts = await searchCounts(db, s.id, last ? new Date(last.createdAt) : undefined);
  return decide({
    runs,
    limit: s.limit,
    ongoing: s.ongoing,
    verified: counts.verified,
    projected: early ? projectVerified(counts) : undefined,
    verifiedSince: counts.verifiedSince,
    room: await allowanceRoom(db, s.clerk_user_id, now),
    checksQueued: (await queuedChecks(db, s.id)).queued,
    now,
  });
}

/**
 * The finish hook (maybeFinishSearch). A running icp search with no jobs
 * left that should push on is held running (true) with stage `escalate` for
 * the tick to replan; otherwise its final note is written and it may end
 * (false). Other searches are left alone.
 */
export async function holdForEscalation(tx: TransactionSql, searchId: string, now: Date = new Date()): Promise<boolean> {
  const [busy] = await tx`select 1 from jobs where search_id = ${searchId} and status in ('queued', 'running') limit 1`;
  if (busy) return false;
  const s = await stateOf(tx, searchId);
  if (!s || s.status !== 'running') return false;
  if (s.stage === STAGES.hold || s.stage === STAGES.replan) return true;
  const verdict = await verdictFor(tx, s, now, false);
  await tx`
    update searches set stage = ${verdict.escalate ? STAGES.hold : verdict.stage}, stage_note = ${verdict.note} where id = ${searchId}
  `;
  return verdict.escalate;
}

/**
 * Holds running icp searches whose find, crawls, fit and checks are done while
 * people jobs are still left, when what those can still bring
 * (projectVerified) would leave them short: the next round starts within a
 * tick or two, without waiting for paced people probes. A search with checks
 * queued or deferred is never held (decide). The longest unjudged go first;
 * one judged and left alone waits EARLY_RECHECK_MS before the next look, as
 * only settling checks change the answer.
 */
export async function markShortSearches(sql: Sql, now: Date = new Date()): Promise<number> {
  const recheck = new Date(now.getTime() - EARLY_RECHECK_MS).toISOString();
  const rows = await sql<{ id: string }[]>`
    select s.id from searches s
    where s.kind = 'icp' and s.status = 'running' and s.stage is distinct from ${STAGES.hold} and s.stage is distinct from ${STAGES.replan}
      and coalesce((s.plan->>'earlyCheckedAt')::timestamptz, 'epoch') < ${recheck}::timestamptz
      and not exists (
        select 1 from jobs j where j.search_id = s.id and j.type in ('find', 'crawl', 'fit') and j.status in ('queued', 'running')
      )
    order by coalesce((s.plan->>'earlyCheckedAt')::timestamptz, 'epoch'), s.created_at
    limit 50
  `;
  let held = 0;
  for (const { id } of rows) {
    const marked = await sql.begin(async (tx) => {
      const s = await stateOf(tx, id);
      if (!s || s.status !== 'running' || s.stage === STAGES.hold || s.stage === STAGES.replan) return false;
      const verdict = await verdictFor(tx, s, now, true);
      if (!verdict.escalate) {
        await tx`
          update searches set plan = coalesce(plan, '{}'::jsonb) || jsonb_build_object('earlyCheckedAt', ${now.toISOString()}::text) where id = ${id}
        `;
        return false;
      }
      await tx`update searches set stage = ${STAGES.hold}, stage_note = ${verdict.note} where id = ${id}`;
      return true;
    });
    if (marked) held++;
  }
  return held;
}

export interface OngoingDeps {
  sql: Sql;
  /** Claude, for the fresh rounds. Without it a held search ends with a note. */
  ai?: Ai;
  log: Logger;
  now?: () => Date;
  /** Paid Brave requests one round may make (ICP_BRAVE_BUDGET; the icp adapter enforces it). */
  runBraveBudget: number;
  /** Paid Brave requests an ongoing search's daily round may make (ICP_DAILY_BRAVE_BUDGET). */
  dailyBraveBudget: number;
  /** Paid Brave requests all daily rounds together may reserve a UTC day (ONGOING_DAILY_BRAVE_BUDGET). */
  globalDailyBraveBudget: number;
}

interface Claimed {
  id: string;
  clerk_user_id: string;
  params: unknown;
  plan: unknown;
  runs: RunRecord[] | null;
  limit: number;
  ongoing: boolean;
  trigger: 'escalate' | 'ongoing';
  attempts: number;
  /** An ongoing round's reservation and the UTC day it counts against. */
  braveBudget: number | null;
  reservedDay: string | null;
}

/** The UTC day a reservation counts against, `yyyy-mm-dd`. */
export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Paid Brave requests daily rounds reserved on a UTC day. */
export async function ongoingReserved(sql: Db, day: string): Promise<number> {
  const [row] = await sql<{ reserved: number }[]>`select reserved from ongoing_budget where day = ${day}::date`;
  return row?.reserved ?? 0;
}

/** Reserves `amount` on `day` when it fits under `cap`, atomically across workers. */
async function reserve(sql: Sql, day: string, amount: number, cap: number): Promise<boolean> {
  if (amount > cap) return false;
  const rows = await sql`
    insert into ongoing_budget (day, reserved) values (${day}::date, ${amount})
    on conflict (day) do update set reserved = ongoing_budget.reserved + excluded.reserved
      where ongoing_budget.reserved + excluded.reserved <= ${cap}
    returning reserved
  `;
  return rows.length > 0;
}

/** Gives back the reservation of a daily round that did not start. */
async function release(sql: Sql, c: Claimed): Promise<void> {
  if (c.trigger !== 'ongoing' || !c.braveBudget || !c.reservedDay) return;
  await sql`update ongoing_budget set reserved = greatest(0, reserved - ${c.braveBudget}) where day = ${c.reservedDay}::date`;
}

/** Ends a held search with a plain note, giving back what it reserved. */
async function finishHeld(sql: Sql, c: Claimed, stage: string, note: string): Promise<void> {
  await release(sql, c);
  await sql.begin(async (tx) => {
    const rows = await tx`
      update searches set status = 'done', finished_at = now(), stage = ${stage}, stage_note = ${note}
      where id = ${c.id} and status = 'running'
      returning id
    `;
    if (rows.length > 0) await searchFinished(tx, c.id);
  });
}

/** Plans and starts the fresh round of a claimed search, or ends it saying why not. */
async function startRound(deps: OngoingDeps, c: Claimed): Promise<void> {
  const { sql, log } = deps;
  const now = deps.now?.() ?? new Date();
  const ongoing = c.trigger === 'ongoing';
  const counts = await searchCounts(sql, c.id);
  const verified = verifiedEmails(counts.verified);
  const later = ongoing ? 'Trying again at the next daily round' : 'Search more to try again later';
  if (c.attempts > MAX_CLAIM_ATTEMPTS) {
    log.warn({ searchId: c.id, attempts: c.attempts }, 'ongoing: round kept failing, ending');
    await finishHeld(sql, c, STAGES.exhausted, `Found ${verified}. Planning more searches failed ${MAX_CLAIM_ATTEMPTS} times. ${later}`);
    return;
  }
  const params = IcpSearchParams.safeParse(c.params);
  const previous = IcpPlan.safeParse(c.plan);
  if (!params.success || !previous.success) {
    log.warn({ searchId: c.id }, 'ongoing: no usable plan, ending');
    await finishHeld(sql, c, STAGES.exhausted, `Found ${verified}. Could not plan more searches for this one`);
    return;
  }
  const room = await allowanceRoom(sql, c.clerk_user_id, now);
  if (room <= 0) {
    await finishHeld(sql, c, STAGES.paused, `Found ${verified}. ${c.ongoing ? 'Paused until your allowance renews' : 'This month’s allowance is used up'}`);
    return;
  }
  // Checks queued since the hold (a people job's addresses): back to running, and the
  // last job's finish (holdForEscalation) judges again once they settle.
  const checks = ongoing ? 0 : (await queuedChecks(sql, c.id)).queued;
  if (checks > 0) {
    await sql`
      update searches set stage = ${STAGES.round}, stage_note = ${`Found ${counts.verified} verified so far. Checking ${addresses(checks)} before looking further`}
      where id = ${c.id} and status = 'running' and stage = ${STAGES.replan}
    `;
    return;
  }
  if (!deps.ai || !(await deps.ai.ready(c.clerk_user_id))) {
    await finishHeld(sql, c, STAGES.exhausted, `Found ${verified}. Claude is out of reach for this account, so nvoke cannot plan more searches now. ${later}`);
    return;
  }
  const runs = c.runs ?? [];
  // Never aim past what the allowance can still take.
  const target = Math.min(verifiedTarget(userLimit(runs, c.limit)), counts.verified + room);
  const budget = ongoing ? (c.braveBudget ?? 0) : deps.runBraveBudget;
  const maxQueries = Math.min(PLAN_CAPS.directories + PLAN_CAPS.adjacent + PLAN_CAPS.wider, budget);
  let plan: IcpPlan | null;
  try {
    plan = (await replan(deps.ai, c.clerk_user_id, params.data, previous.data, { companies: counts.companies, verified: counts.verified, target, maxQueries })).plan;
  } catch (err) {
    log.warn({ err, searchId: c.id }, 'ongoing: replan failed');
    await finishHeld(sql, c, STAGES.exhausted, `Found ${verified}. Planning more searches failed. ${later}`);
    return;
  }
  if (!plan) {
    await finishHeld(
      sql,
      c,
      STAGES.exhausted,
      ongoing
        ? `Found ${verified}. Nothing new to search for in this daily round. Trying again at the next one`
        : `Found ${verified}. nvoke has run every search it could think of for this customer. Describe your customer more broadly or add countries to find more`,
    );
    return;
  }
  // The icp adapter holds the run to the reservation.
  if (ongoing) plan = { ...plan, braveBudget: budget };
  const note = `${ongoing ? 'Daily round. ' : ''}Found ${counts.verified} verified so far. ${roundNote(previous.data, plan)}`;
  await savePlan(sql, c.id, plan);
  const started = await startAutoRun(sql, c.id, {
    limit: Math.min(userLimit(runs, c.limit), maxSearchLimit(await planOf(sql, c.clerk_user_id))),
    trigger: c.trigger,
    braveBudget: ongoing ? budget : undefined,
    stage: STAGES.round,
    note,
  });
  // Canceled while Claude planned: nothing runs, so nothing is spent.
  if (!started) await release(sql, c);
  log.info({ searchId: c.id, trigger: c.trigger, round: plan.round, started, maxQueries }, 'ongoing: fresh round');
}

const CLAIMED_COLUMNS = `s.id, s.clerk_user_id, s.params, s.plan, s.runs, s."limit", s.ongoing,
  coalesce(s.plan->>'claimedFor', 'escalate') as trigger, coalesce((s.plan->>'claimAttempts')::int, 1) as attempts,
  (s.plan->>'braveBudget')::int as "braveBudget", s.plan->>'reservedDay' as "reservedDay"`;

/**
 * Claims held searches for replanning, and rounds whose claim was dropped
 * (REPLAN_STALE_MS, doubling with every attempt). A dropped daily round keeps
 * its reservation, which still counts against the day it was made on.
 */
async function claimHeld(sql: Sql, now: Date, max: number): Promise<Claimed[]> {
  return sql<Claimed[]>`
    update searches s set
      stage = ${STAGES.replan},
      plan = coalesce(s.plan, '{}'::jsonb) || jsonb_build_object(
        'claimedAt', ${now.toISOString()}::text,
        'claimedFor', case when s.stage = ${STAGES.hold} then 'escalate' else coalesce(s.plan->>'claimedFor', 'escalate') end,
        'claimAttempts', case when s.stage = ${STAGES.hold} then 1 else coalesce((s.plan->>'claimAttempts')::int, 1) + 1 end
      )
    where s.id in (
      select id from searches
      where kind = 'icp' and status = 'running'
        and (stage = ${STAGES.hold} or (
          stage = ${STAGES.replan}
          and coalesce((plan->>'claimedAt')::timestamptz, 'epoch')
            < ${now.toISOString()}::timestamptz - make_interval(secs => ${REPLAN_STALE_MS / 1000} * power(2, coalesce((plan->>'claimAttempts')::int, 1) - 1))
        ))
        and not exists (select 1 from jobs j where j.search_id = searches.id and j.type = 'find' and j.status in ('queued', 'running'))
      order by created_at
      limit ${max}
      for update skip locked
    )
    returning ${sql.unsafe(CLAIMED_COLUMNS)}
  `;
}

/**
 * The last time of day this search's daily round was due: the time of day
 * (UTC) it was created, today or yesterday. Fixed per search, so rounds do
 * not drift later with every run.
 */
const DUE_SQL = `(
  date_trunc('day', $NOW at time zone 'UTC')
  + ((created_at at time zone 'UTC') - date_trunc('day', created_at at time zone 'UTC'))
  - case when date_trunc('day', $NOW at time zone 'UTC') + ((created_at at time zone 'UTC') - date_trunc('day', created_at at time zone 'UTC')) > ($NOW at time zone 'UTC')
      then interval '1 day' else interval '0' end
)`;

/**
 * Claims the next ongoing search whose daily round is due: it ended (done,
 * failed, or canceled and switched back on) before its daily time came
 * round. Searches waiting longest go first. One whose account's allowance is
 * used up is noted as paused and looked at again on later ticks, so it
 * resumes once the allowance renews. The round's Brave budget is reserved in
 * `ongoing_budget` before Claude is asked, so concurrent claims never pass the
 * global cap.
 */
export async function claimOngoing(deps: OngoingDeps, now: Date): Promise<Claimed | null> {
  const { sql } = deps;
  const at = `'${now.toISOString()}'::timestamptz`;
  const due = DUE_SQL.replaceAll('$NOW', at);
  const rows = await sql<{ id: string; clerk_user_id: string; stage: string | null }[]>`
    select id, clerk_user_id, stage from searches
    where kind = 'icp' and ongoing and status in ('done', 'failed', 'canceled')
      and (finished_at at time zone 'UTC') < ${sql.unsafe(due)}
    order by stage is not distinct from ${STAGES.paused}, finished_at
    limit 25
  `;
  const day = utcDay(now);
  for (const row of rows) {
    if ((await allowanceRoom(sql, row.clerk_user_id, now)) <= 0) {
      if (row.stage !== STAGES.paused) {
        const { verified } = await searchCounts(sql, row.id);
        await sql`
          update searches set stage = ${STAGES.paused}, stage_note = ${`Found ${verifiedEmails(verified)}. Paused until your allowance renews`}
          where id = ${row.id}
        `;
      }
      continue;
    }
    const budget = Math.min(deps.dailyBraveBudget, deps.globalDailyBraveBudget - (await ongoingReserved(sql, day)));
    if (budget < MIN_ROUND_BUDGET || !(await reserve(sql, day, budget, deps.globalDailyBraveBudget))) {
      deps.log.info({ day, budget }, 'ongoing: daily Brave budget spent, the rest wait for tomorrow');
      return null;
    }
    const [c] = await sql<Claimed[]>`
      update searches s set
        status = 'running', error = null, finished_at = null, stage = ${STAGES.replan},
        stage_note = 'Daily round. Working out where to look next',
        plan = coalesce(s.plan, '{}'::jsonb) || jsonb_build_object(
          'claimedAt', ${now.toISOString()}::text, 'claimedFor', 'ongoing', 'claimAttempts', 1,
          'braveBudget', ${budget}::int, 'reservedDay', ${day}::text
        )
      where s.id = ${row.id} and s.ongoing and s.status in ('done', 'failed', 'canceled')
      returning ${sql.unsafe(CLAIMED_COLUMNS)}
    `;
    if (c) return c;
    // Switched off or claimed elsewhere meanwhile: give the reservation back.
    await sql`update ongoing_budget set reserved = greatest(0, reserved - ${budget}) where day = ${day}::date`;
  }
  return null;
}

/**
 * One tick: hold short searches, start their fresh rounds, and (unless
 * `daily` is false) start the daily rounds of ongoing searches, one at a time.
 */
export async function runOngoing(deps: OngoingDeps, opts: { daily?: boolean } = {}): Promise<{ held: number; rounds: number; daily: number }> {
  const now = deps.now?.() ?? new Date();
  const held = await markShortSearches(deps.sql, now);
  const rounds = await claimHeld(deps.sql, now, 5);
  for (const c of rounds) await startRound(deps, c).catch((err: unknown) => deps.log.error({ err, searchId: c.id }, 'ongoing: round failed'));
  let daily = 0;
  if (opts.daily !== false) {
    for (let c = await claimOngoing(deps, now); c; c = await claimOngoing(deps, now)) {
      daily++;
      const claimed = c;
      await startRound(deps, claimed).catch((err: unknown) => deps.log.error({ err, searchId: claimed.id }, 'ongoing: daily round failed'));
    }
  }
  return { held, rounds: rounds.length, daily };
}

/** Runs runOngoing every ONGOING_TICK_MS (the worker, the CLI, the eval). Returns a stop function. */
export function startOngoingLoop(deps: OngoingDeps, everyMs: number = ONGOING_TICK_MS): () => void {
  let busy = false;
  let stopped = false;
  let ticks = 0;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      // Daily rounds about once a minute; held searches every tick.
      await runOngoing(deps, { daily: ticks++ % Math.max(1, Math.round(60_000 / everyMs)) === 0 });
    } catch (err) {
      deps.log.error({ err }, 'ongoing tick failed');
    } finally {
      busy = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), everyMs);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
