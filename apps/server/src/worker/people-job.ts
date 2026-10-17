// The people job: turns the people a crawl found on a company's site into
// personal addresses. It links addresses the site printed to their owners,
// infers the domain's address pattern from addresses whose owner is known,
// and asks the mail server about pattern candidates for up to three people
// without an address, in one SMTP session. An accepted address is stored
// like any found address and goes through the normal verify job, which the
// probe's cache entry answers (and which charges the user).

import { isDecisionMaker, type Seniority } from '@nvoke/shared';
import { candidates, inferPattern, matchPerson, type KnownPair, type PatternId } from '../leads/patterns.js';
import { quotaExhausted } from '../leads/quota.js';
import { PermanentError } from '../leads/sources/types.js';
import { isDomainSuppressed, suppressedAddresses } from '../leads/suppression.js';
import { isTempfail, type ProbeCandidate } from '../leads/verify/index.js';
import { leadSettled } from '../webhooks/events.js';
import { failSearch, GREYLIST_DELAY_MS, QUOTA_EXCEEDED, type PipelineDeps } from './pipeline.js';
import { enqueue, type Job } from './queue.js';

/** People asked about per company. */
export const PEOPLE_PER_COMPANY = 3;
/** Candidates per person without a known pattern; with one, candidates() gives at most two. */
const CANDIDATES_UNKNOWN_PATTERN = 5;
/** A probe that ended on greylisting or an unreachable server is tried once more. */
const PEOPLE_RETRIES = 1;

/** How sure nvoke is that a stored address reaches the person (emails.confidence). */
export const CONFIDENCE = {
  /** The mail server accepted it and refused a random address. */
  accepted: 95,
  /** Catch-all domain, built from a pattern seen on a real address of the domain. */
  catchAllKnownPattern: 70,
  /** Catch-all domain, no pattern known: the most common pattern for the top decision maker. */
  catchAllGuess: 35,
} as const;

interface CompanyRow {
  id: string;
  search_id: string;
  clerk_user_id: string;
  domain: string;
}

interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  seniority: Seniority | null;
  source_url: string | null;
}

interface EmailRow {
  id: string;
  address: string;
  person_id: string | null;
}

const RANK: Record<Seniority, number> = { founder: 0, executive: 1, director: 2, manager: 3, staff: 4 };

function person(p: PersonRow) {
  return { firstName: p.first_name, lastName: p.last_name };
}

/** Decision makers first (founders before executives before directors), then other people with a title. */
export function pickPeople(people: PersonRow[], max: number): PersonRow[] {
  return people
    .filter((p) => isDecisionMaker(p.seniority) || (p.title?.trim() ?? '') !== '')
    .sort((a, b) => (a.seniority ? RANK[a.seniority] : 5) - (b.seniority ? RANK[b.seniority] : 5))
    .slice(0, max);
}

export async function runPeople(deps: PipelineDeps, job: Job, signal: AbortSignal): Promise<void> {
  const { sql } = deps;
  const companyId = job.payload.companyId;
  if (typeof companyId !== 'string' || !companyId) throw new PermanentError('job payload is missing companyId');
  const retry = typeof job.payload.retry === 'number' ? job.payload.retry : 0;

  const [company] = await sql<CompanyRow[]>`
    select id, search_id, clerk_user_id, domain from companies where id = ${companyId}
  `;
  if (!company) return;
  if (!(await stillRunning(deps, company.search_id))) return;
  if (await quotaExhausted(sql, company.clerk_user_id, deps.now?.())) {
    await failSearch(sql, company.search_id, QUOTA_EXCEEDED);
    return;
  }
  if (await isDomainSuppressed(sql, company.domain)) return;

  const people = await sql<PersonRow[]>`
    select id, first_name, last_name, title, seniority, source_url from people
    where company_id = ${company.id}
    order by created_at, id
  `;
  if (people.length === 0) return;
  const emails = await sql<EmailRow[]>`select id, address, person_id from emails where company_id = ${company.id}`;

  // 1. Addresses the site printed, linked to the people they belong to.
  const linked = new Set(emails.flatMap((e) => (e.person_id ? [e.person_id] : [])));
  const named = people.map((row) => ({ ...person(row), row }));
  const pairs: KnownPair[] = [];
  for (const e of emails) {
    const [local, domain] = e.address.split('@');
    if (!local || domain !== company.domain) continue;
    const owner = e.person_id ? people.find((p) => p.id === e.person_id) : matchPerson(local, named)?.person.row;
    if (!owner) continue;
    pairs.push({ local, ...person(owner) });
    if (e.person_id) continue;
    linked.add(owner.id);
    await sql`
      update emails
      set person_id = ${owner.id}, first_name = ${owner.first_name}, last_name = ${owner.last_name},
          title = ${owner.title}, seniority = ${owner.seniority}
      where id = ${e.id} and person_id is null
    `;
  }

  // 2. The domain's pattern, from those and from named addresses other searches confirmed.
  const elsewhere = await sql<{ address: string; first_name: string; last_name: string }[]>`
    select distinct e.address, e.first_name, e.last_name
    from emails e join companies c on c.id = e.company_id
    where c.domain = ${company.domain} and e.company_id <> ${company.id}
      and e.first_name is not null and e.last_name is not null
      and (e.found_via is distinct from 'pattern' or e.verification = 'valid')
    limit 50
  `;
  for (const e of elsewhere) {
    const local = e.address.split('@')[0];
    if (local && e.address.endsWith(`@${company.domain}`)) pairs.push({ local, firstName: e.first_name, lastName: e.last_name });
  }
  const inferred = inferPattern(pairs);
  const pattern: PatternId | null = inferred?.pattern ?? null;

  // 3. Up to three people without an address, and their candidates.
  const targets = pickPeople(
    people.filter((p) => !linked.has(p.id)),
    PEOPLE_PER_COMPANY,
  );
  if (targets.length === 0) return;
  const max = pattern ? 2 : CANDIDATES_UNKNOWN_PATTERN;
  const groups: ProbeCandidate[][] = targets.map((p) =>
    candidates(person(p), pattern, max).map((c) => ({ address: `${c.local}@${company.domain}`, tag: c.pattern })),
  );
  const blocked = await suppressedAddresses(sql, groups.flat().map((c) => c.address));
  const allowed = groups.map((g) => g.filter((c) => !blocked.has(c.address)));
  if (allowed.every((g) => g.length === 0)) return;

  const probe = await deps.verifier.probeDomain(company.domain, allowed, { signal });
  const log = deps.log.child({ companyId: company.id, domain: company.domain });
  log.debug(
    { people: targets.length, pattern, catchAll: probe.catchAll, accepted: probe.accepted.filter(Boolean).length, reason: probe.reason },
    'people: probed',
  );

  // 4. What to store: accepted addresses, or best guesses on a catch-all domain.
  const found: Array<{ who: PersonRow; address: string; confidence: number }> = [];
  for (const [i, address] of probe.accepted.entries()) {
    if (address) found.push({ who: targets[i]!, address, confidence: CONFIDENCE.accepted });
  }
  if (probe.catchAll === true) {
    // The server takes any address, so nothing proves a guess. Store only what is likely to land.
    const makers = targets.filter((p) => isDecisionMaker(p.seniority));
    const guessed = pattern ? makers : makers.slice(0, 1);
    const confidence = pattern ? CONFIDENCE.catchAllKnownPattern : CONFIDENCE.catchAllGuess;
    for (const who of guessed) {
      const top = candidates(person(who), pattern, 1)[0];
      const address = top && `${top.local}@${company.domain}`;
      if (address && !blocked.has(address)) found.push({ who, address, confidence });
    }
  }
  if (found.length > 0 && (await stillRunning(deps, company.search_id))) await store(deps, company, found);

  if (probe.reason === 'smtp_paced') {
    // Over a session budget this minute: come back when a slot frees up, spread out. Not a retry.
    await requeue(deps, company, retry, Math.max(5_000, probe.retryAfterMs ?? 60_000) + Math.floor(Math.random() * 60_000));
  } else if (probe.reason && isTempfail({ reason: probe.reason }) && retry < PEOPLE_RETRIES && found.length < targets.length) {
    await requeue(deps, company, retry + 1, GREYLIST_DELAY_MS);
  }
}

async function stillRunning(deps: PipelineDeps, searchId: string): Promise<boolean> {
  const rows = await deps.sql<{ status: string }[]>`select status from searches where id = ${searchId}`;
  return rows[0]?.status === 'running';
}

async function requeue(deps: PipelineDeps, company: CompanyRow, retry: number, delayMs: number): Promise<void> {
  const now = deps.now?.() ?? new Date();
  await enqueue(deps.sql, {
    type: 'people',
    payload: { companyId: company.id, retry },
    searchId: company.search_id,
    runAfter: new Date(now.getTime() + delayMs),
  });
}

/** Stores the addresses with their owners and queues the normal check for each. */
async function store(
  deps: PipelineDeps,
  company: CompanyRow,
  found: Array<{ who: PersonRow; address: string; confidence: number }>,
): Promise<void> {
  await deps.sql.begin(async (tx) => {
    const rows = found.map(({ who, address, confidence }) => ({
      company_id: company.id,
      search_id: company.search_id,
      clerk_user_id: company.clerk_user_id,
      address,
      kind: 'personal',
      source_url: who.source_url,
      person_id: who.id,
      first_name: who.first_name,
      last_name: who.last_name,
      title: who.title,
      seniority: who.seniority,
      found_via: 'pattern',
      confidence,
    }));
    const inserted = await tx<{ id: string }[]>`
      insert into emails ${tx(
        rows,
        'company_id',
        'search_id',
        'clerk_user_id',
        'address',
        'kind',
        'source_url',
        'person_id',
        'first_name',
        'last_name',
        'title',
        'seniority',
        'found_via',
        'confidence',
      )}
      on conflict (company_id, address) do nothing
      returning id
    `;
    if (inserted.length === 0) return;
    await enqueue(
      tx,
      inserted.map((r) => ({ type: 'verify' as const, payload: { emailId: r.id }, searchId: company.search_id })),
    );
    await tx`update searches set emails_found = emails_found + ${inserted.length} where id = ${company.search_id}`;
  });
}

/**
 * Settles the company's lead after its people job is off the queue. leadSettled
 * waits while a people job is pending, so a company whose addresses all settled
 * while that job was queued needs one more attempt once it is done. New
 * personal addresses, if any, wait for their own verify jobs instead.
 */
export async function settleCompanyLead(deps: PipelineDeps, companyId: string): Promise<void> {
  await deps.sql.begin(async (tx) => {
    const [company] = await tx<{ id: string }[]>`select id from companies where id = ${companyId} for update`;
    if (company) await leadSettled(tx, companyId);
  });
}

/** A people job that ran out of attempts leaves its people without addresses; settle anyway. */
export async function onPeopleGaveUp(deps: PipelineDeps, job: Job): Promise<void> {
  deps.log.warn({ companyId: job.payload.companyId }, 'people: gave up');
  if (typeof job.payload.companyId === 'string') await settleCompanyLead(deps, job.payload.companyId);
}
