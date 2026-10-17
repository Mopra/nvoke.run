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
  Search,
  SearchKind,
  SearchStatus,
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
  status: SearchStatus;
  error: string | null;
  companies_found: number;
  companies_crawled: number;
  emails_found: number;
  emails_valid: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

export function toSearch(r: SearchRow): Search {
  return {
    id: r.id,
    kind: r.kind,
    params: r.params,
    limit: r.limit,
    status: r.status,
    error: r.error,
    companiesFound: r.companies_found,
    companiesCrawled: r.companies_crawled,
    emailsFound: r.emails_found,
    emailsValid: r.emails_valid,
    createdAt: iso(r.created_at)!,
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
  } as Search;
}

const SEARCH_COLUMNS = `id, kind, params, "limit", status, error, companies_found, companies_crawled,
  emails_found, emails_valid, created_at, started_at, finished_at`;

/** Inserts the search and its find job in one transaction. */
export async function createSearch(
  sql: Sql,
  userId: string,
  req: CreateSearchRequest,
  limit: number,
): Promise<Search> {
  return sql.begin(async (tx) => {
    const [row] = await tx<SearchRow[]>`
      insert into searches (clerk_user_id, kind, params, "limit")
      values (${userId}, ${req.kind}, ${tx.json(req.params)}, ${limit})
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

/** Cancels a queued or running search. Null when it does not exist, false when it already ended. */
export async function cancelSearch(sql: Sql, userId: string, id: string): Promise<Search | null | false> {
  const [row] = await sql<SearchRow[]>`
    update searches set status = 'canceled', finished_at = now()
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
}

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
  const emailFiltered = Boolean(query.verification || query.kind);
  const like = query.q ? likePattern(query.q) : null;

  const rows = await sql<CompanyRow[]>`
    select c.id, c.name, c.domain, c.website, c.source, c.source_ref, c.location, c.phone, c.category,
           c.crawl_status, c.crawled_at, c.local_crawl, c.created_at::text as created_at_text,
           c.opener_status, c.opener, c.opener_source_url, c.opener_quote, c.opener_at,
           coalesce(
             json_agg(json_build_object(
               'id', e.id, 'address', e.address, 'kind', e.kind, 'source_url', e.source_url,
               'verification', e.verification, 'checked_at', e.checked_at
             ) order by e.kind, e.address) filter (where e.id is not null),
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
    })),
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
      kind: string;
      verification: string | null;
      source_url: string | null;
      location: string | null;
      phone: string | null;
      opener: string | null;
    }[]
  >`
    select c.name, c.domain, c.website, e.address, e.kind, e.verification, e.source_url, c.location, c.phone,
           case when c.opener_status = 'done' then c.opener end as opener
    from emails e
    join companies c on c.id = e.company_id
    where e.search_id = ${searchId} and e.clerk_user_id = ${userId}
      and not ${domainSuppressedSql(sql, 'c.domain')}
      ${emailFilter(sql, f)}
      ${like ? sql`and (c.name ilike ${like} or c.domain ilike ${like} or e.address ilike ${like})` : sql``}
    order by c.created_at, c.id, e.kind, e.address
  `;
  return rows.map((r) => ({
    company: r.name,
    domain: r.domain,
    website: r.website,
    email: r.address,
    kind: r.kind,
    verification: r.verification,
    source_url: r.source_url,
    location: r.location,
    phone: r.phone,
    opener: r.opener,
  }));
}
