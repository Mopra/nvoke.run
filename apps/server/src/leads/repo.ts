// Read and write queries behind the /v1 lead routes. Every query is scoped
// by clerk_user_id, so one user can never see another user's rows.

import type { Sql } from 'postgres';
import type {
  Company,
  CompaniesPage,
  CompaniesQuery,
  CreateSearchRequest,
  CrawlStatus,
  LocalCrawlStatus,
  EmailKind,
  Opener,
  OpenerStatus,
  LeadFilters,
  FoundVia,
  Search,
  SearchKind,
  SearchStatus,
  Seniority,
  Verification,
} from '@nvoke/shared';
import { cancelSearchJobs, enqueue } from '../worker/queue.js';
import type { CsvRow } from './csv.js';
import { domainSuppressedSql, suppressedSql } from './suppression.js';

interface SearchRow {
  id: string;
  kind: SearchKind;
  params: Record<string, unknown>;
  limit: number;
  /** Left out by readers that do not need it, such as the webhook payload. */
  runs?: { params: unknown; limit: number; foundBefore: number; createdAt: string }[];
  status: SearchStatus;
  error: string | null;
  companies_found: number;
  companies_crawled: number;
  emails_found: number;
  emails_valid: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  /** Left out by readers that do not need them, such as the webhook payload. */
  stage?: string | null;
  stage_note?: string | null;
  ongoing?: boolean;
}

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

export function toSearch(r: SearchRow): Search {
  return {
    id: r.id,
    kind: r.kind,
    params: r.params,
    limit: r.limit,
    ...(r.runs && r.runs.length > 0 ? { runs: r.runs.map((run) => ({ ...run, createdAt: iso(run.createdAt)! })) } : {}),
    status: r.status,
    error: r.error,
    companiesFound: r.companies_found,
    companiesCrawled: r.companies_crawled,
    emailsFound: r.emails_found,
    emailsValid: r.emails_valid,
    createdAt: iso(r.created_at)!,
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
    stage: r.stage ?? null,
    stageNote: r.stage_note ?? null,
    ongoing: r.ongoing ?? null,
  } as Search;
}

const SEARCH_COLUMNS = `id, kind, params, "limit", runs, status, error, companies_found, companies_crawled,
  emails_found, emails_valid, created_at, started_at, finished_at, stage, stage_note, ongoing`;

/** Inserts the search and its find job in one transaction. */
export async function createSearch(
  sql: Sql,
  userId: string,
  req: CreateSearchRequest,
  limit: number,
): Promise<Search> {
  return sql.begin(async (tx) => {
    const run = { params: req.params, limit, foundBefore: 0, createdAt: new Date().toISOString() };
    const [row] = await tx<SearchRow[]>`
      insert into searches (clerk_user_id, kind, params, "limit", runs)
      values (${userId}, ${req.kind}, ${tx.json(req.params)}, ${limit}, ${tx.json([run])})
      returning ${tx.unsafe(SEARCH_COLUMNS)}
    `;
    if (!row) throw new Error('insert into searches returned nothing');
    await enqueue(tx, { type: 'find', payload: { searchId: row.id }, searchId: row.id });
    return toSearch(row);
  });
}

export async function listSearches(sql: Sql, userId: string, max = 200): Promise<Search[]> {
  const rows = await sql<SearchRow[]>`
    select ${sql.unsafe(SEARCH_COLUMNS)} from searches
    where clerk_user_id = ${userId}
    order by created_at desc, id desc
    limit ${max}
  `;
  return rows.map(toSearch);
}

export async function getSearch(sql: Sql, userId: string, id: string): Promise<Search | null> {
  const [row] = await sql<SearchRow[]>`
    select ${sql.unsafe(SEARCH_COLUMNS)} from searches where id = ${id} and clerk_user_id = ${userId}
  `;
  return row ? toSearch(row) : null;
}

/**
 * Starts another run in a finished search: the new params become the
 * search's, it may hold `limit` more companies than it does now, and a find
 * job goes in the queue. The unique `(search_id, domain)` keeps companies it
 * already holds out. Null when the search does not exist, `running` while
 * it has not ended, `kind` when the request is of another kind.
 */
export async function searchMore(
  sql: Sql,
  userId: string,
  id: string,
  req: CreateSearchRequest,
  limit: number,
): Promise<Search | null | 'running' | 'kind'> {
  return sql.begin(async (tx) => {
    const [current] = await tx<{ kind: SearchKind; status: SearchStatus }[]>`
      select kind, status from searches where id = ${id} and clerk_user_id = ${userId} for update
    `;
    if (!current) return null;
    if (current.kind !== req.kind) return 'kind';
    if (current.status === 'queued' || current.status === 'running') return 'running';
    // A canceled search's find job stops only at its next status check: wait for it.
    const [finding] = await tx`select 1 from jobs where search_id = ${id} and type = 'find' and status = 'running' limit 1`;
    if (finding) return 'running';
    // No find job runs while the search is ended, so the count holds until the update.
    const [held] = await tx<{ n: number }[]>`select count(*)::int as n from companies where search_id = ${id}`;
    const foundBefore = held?.n ?? 0;
    const run = { params: req.params, limit, foundBefore, createdAt: new Date().toISOString() };
    const [row] = await tx<SearchRow[]>`
      update searches set
        params = ${tx.json(req.params)},
        "limit" = ${foundBefore + limit},
        runs = runs || ${tx.json([run])},
        status = 'queued', error = null, finished_at = null
      where id = ${id}
      returning ${tx.unsafe(SEARCH_COLUMNS)}
    `;
    if (!row) throw new Error('update of searches returned nothing');
    await enqueue(tx, { type: 'find', payload: { searchId: id }, searchId: id });
    // A cancel or a quota stop dropped the earlier runs' queued work: pick it up again.
    const crawls = await tx<{ id: string }[]>`
      select c.id from companies c
      where c.search_id = ${id} and c.crawl_status = 'pending'
        and not exists (
          select 1 from jobs j where j.search_id = ${id} and j.type = 'crawl' and j.status in ('queued', 'running')
            and j.payload->>'companyId' = c.id::text
        )
    `;
    const verifies = await tx<{ id: string }[]>`
      select e.id from emails e
      where e.search_id = ${id} and e.verification is null
        and not exists (
          select 1 from jobs j where j.search_id = ${id} and j.type = 'verify' and j.status in ('queued', 'running')
            and j.payload->>'emailId' = e.id::text
        )
    `;
    await enqueue(tx, [
      ...crawls.map((c) => ({ type: 'crawl' as const, payload: { companyId: c.id }, searchId: id })),
      ...verifies.map((e) => ({ type: 'verify' as const, payload: { emailId: e.id }, searchId: id })),
    ]);
    return toSearch(row);
  });
}

/**
 * Starts a run nvoke decided on itself (leads/ongoing.ts): a fresh round of a
 * plain words search that came up short, or an ongoing search's daily round.
 * Like searchMore, but the params stay, the search must be running (held by
 * the round) and the run records its trigger and any Brave budget it
 * reserved. False when the search is no longer running.
 */
export async function startAutoRun(
  sql: Sql,
  id: string,
  run: { limit: number; trigger: 'escalate' | 'ongoing'; braveBudget?: number; stage: string; note: string },
): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [current] = await tx<{ status: SearchStatus; params: unknown }[]>`
      select status, params from searches where id = ${id} for update
    `;
    if (!current || current.status !== 'running') return false;
    const [held] = await tx<{ n: number }[]>`select count(*)::int as n from companies where search_id = ${id}`;
    const foundBefore = held?.n ?? 0;
    const record = {
      params: current.params,
      limit: run.limit,
      foundBefore,
      createdAt: new Date().toISOString(),
      trigger: run.trigger,
      ...(run.braveBudget === undefined ? {} : { braveBudget: run.braveBudget }),
    };
    await tx`
      update searches set
        "limit" = ${foundBefore + run.limit},
        runs = coalesce(runs, '[]'::jsonb) || ${tx.json([record] as never)},
        stage = ${run.stage}, stage_note = ${run.note}
      where id = ${id}
    `;
    await enqueue(tx, { type: 'find', payload: { searchId: id }, searchId: id });
    // A quota stop dropped queued work: pick it up again.
    const crawls = await tx<{ id: string }[]>`
      select c.id from companies c
      where c.search_id = ${id} and c.crawl_status = 'pending'
        and not exists (
          select 1 from jobs j where j.search_id = ${id} and j.type = 'crawl' and j.status in ('queued', 'running')
            and j.payload->>'companyId' = c.id::text
        )
    `;
    const verifies = await tx<{ id: string }[]>`
      select e.id from emails e
      where e.search_id = ${id} and e.verification is null
        and not exists (
          select 1 from jobs j where j.search_id = ${id} and j.type = 'verify' and j.status in ('queued', 'running')
            and j.payload->>'emailId' = e.id::text
        )
    `;
    await enqueue(tx, [
      ...crawls.map((c) => ({ type: 'crawl' as const, payload: { companyId: c.id }, searchId: id })),
      ...verifies.map((e) => ({ type: 'verify' as const, payload: { emailId: e.id }, searchId: id })),
    ]);
    return true;
  });
}

/**
 * Switches ongoing on or off (`PATCH /v1/searches/:id`). Only plain words
 * (`icp`) searches can be ongoing: `kind` for the others, null when the
 * search does not exist. Switching off a search paused for the allowance
 * ends the pause note.
 */
export async function setSearchOngoing(sql: Sql, userId: string, id: string, ongoing: boolean): Promise<Search | null | 'kind'> {
  const [row] = await sql<SearchRow[]>`
    update searches set
      ongoing = ${ongoing},
      stage = case when ${!ongoing} and stage = 'paused' then 'done' else stage end,
      stage_note = case when ${!ongoing} and stage = 'paused' then 'Ongoing is off' else stage_note end
    where id = ${id} and clerk_user_id = ${userId} and kind = 'icp'
    returning ${sql.unsafe(SEARCH_COLUMNS)}
  `;
  if (row) return toSearch(row);
  return (await getSearch(sql, userId, id)) ? 'kind' : null;
}

/**
 * Cancels a queued or running search. Null when it does not exist, false
 * when it already ended. A cancel also switches ongoing off, and a search
 * with a live progress line (plain words) says it stopped instead of the step
 * it was on.
 */
export async function cancelSearch(sql: Sql, userId: string, id: string): Promise<Search | null | false> {
  const [row] = await sql<SearchRow[]>`
    update searches set status = 'canceled', finished_at = now(), ongoing = false,
      stage = case when stage is null then null else 'canceled' end,
      stage_note = case when stage is null then null else 'Stopped' end
    where id = ${id} and clerk_user_id = ${userId} and status in ('queued', 'running')
    returning ${sql.unsafe(SEARCH_COLUMNS)}
  `;
  if (!row) return (await getSearch(sql, userId, id)) ? false : null;
  await cancelSearchJobs(sql, id);
  return toSearch(row);
}

/** Deletes the search; companies, emails and jobs go with it (on delete cascade). */
export async function deleteSearch(sql: Sql, userId: string, id: string): Promise<boolean> {
  const rows = await sql`delete from searches where id = ${id} and clerk_user_id = ${userId} returning id`;
  return rows.length > 0;
}

// Companies

interface EmailJson {
  id: string;
  address: string;
  kind: EmailKind;
  source_url: string | null;
  verification: Verification | null;
  checked_at: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: Seniority | null;
  found_via: FoundVia | null;
  confidence: number | null;
}

/**
 * The order of a company's emails, as SQL over alias `e`: decision makers
 * (founders, then executives, then directors), other named people,
 * personal addresses, role inboxes.
 */
const EMAIL_ORDER = `case e.seniority when 'founder' then 0 when 'executive' then 1 when 'director' then 2
  else case when e.first_name is not null then 3 when e.kind = 'personal' then 4 else 5 end end, e.address`;

interface CompanyRow extends OpenerColumns {
  id: string;
  name: string;
  domain: string;
  website: string;
  source: string;
  source_ref: string | null;
  location: string | null;
  phone: string | null;
  category: string | null;
  fit: number | null;
  crawl_status: CrawlStatus;
  crawled_at: Date | null;
  local_crawl: LocalCrawlStatus | null;
  /** Full microsecond precision, for the cursor. */
  created_at_text: string;
  emails: EmailJson[];
}

/**
 * Opaque keyset cursor: the row's created_at as Postgres text (microseconds
 * intact) and id. It goes back in as text, cast in SQL: a parameter typed as
 * timestamptz would be serialized through a JS Date and lose the microseconds.
 */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const [ts, id] = raw.split('|');
  if (!ts || !id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}[ T][\d:.]+([+-]\d{2}(:?\d{2})?|Z)?$/.test(ts)) return null;
  return { createdAt: ts, id };
}

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Email-level filter, as a SQL fragment over alias `e`. An address is only
 * handed over once its check has run: a valid one is charged first, and one
 * that never got checked (the quota ran out) stays hidden, and so does one
 * suppressed after it was found.
 */
function emailFilter(sql: Sql, f: LeadFilters) {
  return sql`
    and e.verification is not null
    and not ${suppressedSql(sql, 'e.address')}
    ${f.verification ? sql`and e.verification = ${f.verification}` : sql``}
    ${f.kind ? sql`and e.kind = ${f.kind}` : sql``}
    ${f.people ? sql`and e.first_name is not null` : sql``}
    ${f.decisionMakers ? sql`and e.first_name is not null and e.seniority in ('founder', 'executive', 'director')` : sql``}
  `;
}

export async function listCompanies(
  sql: Sql,
  userId: string,
  searchId: string,
  query: CompaniesQuery,
): Promise<CompaniesPage | null> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) return null;
  const emailFiltered = Boolean(query.verification || query.kind || query.people || query.decisionMakers);
  const like = query.q ? likePattern(query.q) : null;

  const rows = await sql<CompanyRow[]>`
    select c.id, c.name, c.domain, c.website, c.source, c.source_ref, c.location, c.phone, c.category, c.fit,
           c.crawl_status, c.crawled_at, c.local_crawl, c.created_at::text as created_at_text,
           c.opener_status, c.opener, c.opener_source_url, c.opener_quote, c.opener_at,
           coalesce(
             json_agg(json_build_object(
               'id', e.id, 'address', e.address, 'kind', e.kind, 'source_url', e.source_url,
               'verification', e.verification, 'checked_at', e.checked_at,
               'first_name', e.first_name, 'last_name', e.last_name, 'title', e.title, 'seniority', e.seniority,
               'found_via', e.found_via, 'confidence', e.confidence
             ) order by ${sql.unsafe(EMAIL_ORDER)}) filter (where e.id is not null),
             '[]'::json
           ) as emails
    from companies c
    left join emails e on e.company_id = c.id ${emailFilter(sql, query)}
    where c.search_id = ${searchId} and c.clerk_user_id = ${userId}
      and not ${domainSuppressedSql(sql, 'c.domain')}
      ${cursor ? sql`and (c.created_at, c.id) > (${cursor.createdAt}::text::timestamptz, ${cursor.id}::uuid)` : sql``}
      ${
        like
          ? sql`and (c.name ilike ${like} or c.domain ilike ${like}
                 or exists (select 1 from emails e2 where e2.company_id = c.id and e2.verification is not null
                   and e2.address ilike ${like} and not ${suppressedSql(sql, 'e2.address')}))`
          : sql``
      }
    group by c.id
    ${emailFiltered ? sql`having count(e.id) > 0` : sql``}
    order by c.created_at, c.id
    limit ${query.limit + 1}
  `;

  // Same filters without the cursor, so the count covers every page.
  const [count] = await sql<{ total: number }[]>`
    select count(*)::int as total from (
      select c.id
      from companies c
      left join emails e on e.company_id = c.id ${emailFilter(sql, query)}
      where c.search_id = ${searchId} and c.clerk_user_id = ${userId}
      and not ${domainSuppressedSql(sql, 'c.domain')}
        ${
          like
            ? sql`and (c.name ilike ${like} or c.domain ilike ${like}
                   or exists (select 1 from emails e2 where e2.company_id = c.id and e2.verification is not null
                   and e2.address ilike ${like} and not ${suppressedSql(sql, 'e2.address')}))`
            : sql``
        }
      group by c.id
      ${emailFiltered ? sql`having count(e.id) > 0` : sql``}
    ) matched
  `;

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  const companies: Company[] = page.map((r) => ({
    id: r.id,
    name: r.name,
    domain: r.domain,
    website: r.website,
    source: r.source,
    sourceRef: r.source_ref,
    location: r.location,
    phone: r.phone,
    category: r.category,
    crawlStatus: r.crawl_status,
    crawledAt: iso(r.crawled_at),
    localCrawl: r.local_crawl,
    emails: r.emails.map((e) => ({
      id: e.id,
      address: e.address,
      kind: e.kind,
      sourceUrl: e.source_url,
      verification: e.verification,
      checkedAt: iso(e.checked_at),
      person: e.first_name ? { firstName: e.first_name, lastName: e.last_name ?? '', title: e.title, seniority: e.seniority } : null,
      foundVia: e.found_via,
      confidence: e.confidence,
    })),
    fit: r.fit,
    opener: toOpener(r),
  }));
  return {
    companies,
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.created_at_text, last.id) : null,
    total: count?.total ?? 0,
  };
}

/** The opener columns of a company row as the API shows them. */
export interface OpenerColumns {
  opener_status: OpenerStatus | null;
  opener: string | null;
  opener_source_url: string | null;
  opener_quote: string | null;
  opener_at: Date | null;
}

export function toOpener(r: OpenerColumns): Opener | null {
  if (!r.opener_status) return null;
  return {
    status: r.opener_status,
    line: r.opener,
    sourceUrl: r.opener_source_url,
    quote: r.opener_quote,
    draftedAt: iso(r.opener_at),
  };
}

/** One row per email, in the CSV column order. */
export async function exportRows(sql: Sql, userId: string, searchId: string, f: LeadFilters): Promise<CsvRow[]> {
  const like = f.q ? likePattern(f.q) : null;
  const rows = await sql<
    {
      name: string;
      domain: string;
      website: string;
      address: string;
      first_name: string | null;
      last_name: string | null;
      title: string | null;
      seniority: string | null;
      kind: string;
      verification: string | null;
      source_url: string | null;
      found_via: string | null;
      confidence: number | null;
      location: string | null;
      phone: string | null;
      opener: string | null;
    }[]
  >`
    select c.name, c.domain, c.website, e.address, e.first_name, e.last_name, e.title, e.seniority, e.kind, e.verification,
           e.source_url, e.found_via, e.confidence, c.location, c.phone,
           case when c.opener_status = 'done' then c.opener end as opener
    from emails e
    join companies c on c.id = e.company_id
    where e.search_id = ${searchId} and e.clerk_user_id = ${userId}
      and not ${domainSuppressedSql(sql, 'c.domain')}
      ${emailFilter(sql, f)}
      ${like ? sql`and (c.name ilike ${like} or c.domain ilike ${like} or e.address ilike ${like})` : sql``}
    order by c.created_at, c.id, ${sql.unsafe(EMAIL_ORDER)}
  `;
  return rows.map((r) => ({
    company: r.name,
    domain: r.domain,
    website: r.website,
    email: r.address,
    first_name: r.first_name,
    last_name: r.last_name,
    title: r.title,
    seniority: r.seniority,
    kind: r.kind,
    verification: r.verification,
    source_url: r.source_url,
    found_via: r.found_via,
    confidence: r.confidence === null ? null : String(r.confidence),
    location: r.location,
    phone: r.phone,
    opener: r.opener,
  }));
}
