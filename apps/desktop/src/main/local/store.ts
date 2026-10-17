import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isDecisionMaker, type Company, type Email, type Search } from '@nvoke/shared';
import type { LocalCompaniesPage, LocalCompaniesQuery, LocalFindQuery, LocalFindResult } from '../../ipc/contract';

export const LOCAL_PAGE_DEFAULT = 200;
export const LOCAL_PAGE_MAX = 500;
export const LOCAL_FIND_DEFAULT = 8;
export const LOCAL_FIND_MAX = 50;

const SCHEMA = `
  create table if not exists searches (
    id text primary key,
    created_at text not null,
    json text not null,
    -- status, counters and finish time: when it changes, the companies are fetched again
    fingerprint text not null,
    -- the fingerprint the stored companies were fetched for, null until they were
    synced_fingerprint text,
    synced_at integer
  );
  -- Only what the filters read, so a scan stays narrow. The JSON is in company_bodies.
  create table if not exists companies (
    row integer primary key,
    search_id text not null references searches(id) on delete cascade,
    id text not null,
    ord integer not null,
    -- lowercased name, domain and addresses, for the text filter
    haystack text not null,
    -- ' verification:kind:role ' per email (role dm or na), for the email filters
    tags text not null,
    email_count integer not null,
    unique (search_id, id)
  );
  create table if not exists company_bodies (
    row integer primary key references companies(row) on delete cascade,
    json text not null
  );
  create index if not exists companies_order on companies(search_id, ord);
`;

/** What makes a search's companies worth fetching again. */
export function fingerprintOf(search: Search): string {
  return [
    search.status,
    search.companiesFound,
    search.companiesCrawled,
    search.emailsFound,
    search.emailsValid,
    search.finishedAt ?? '',
  ].join('|');
}

function runCount(search: Search): number {
  return search.kind === 'drop' ? 0 : (search.runs?.length ?? 0);
}

export function isActiveSearch(search: Pick<Search, 'status'>): boolean {
  return search.status === 'queued' || search.status === 'running';
}

function haystackOf(company: Company): string {
  return [company.name, company.domain, ...company.emails.map((e) => e.address)].join('\n').toLowerCase();
}

/**
 * Leads every `tags` value, naming its format. Rows without it were written
 * by an older app (before or after a downgrade): their tags are in another
 * format and their JSON lacks fields zod stripped then (people, fit), so
 * `open()` drops them and the next sync fetches them again.
 */
const TAGS_MARK = ' t3';

const isDecisionMakerEmail = (e: Email): boolean => isDecisionMaker(e.person?.seniority ?? null);

/** dm: a named decision maker. pp: another named person. na: no name (role inboxes, bare addresses). */
function roleOf(e: Email): 'dm' | 'pp' | 'na' {
  if (isDecisionMakerEmail(e)) return 'dm';
  return e.person ? 'pp' : 'na';
}

function tagsOf(company: Company): string {
  return `${TAGS_MARK} ${company.emails.map((e) => `${e.verification ?? 'none'}:${e.kind}:${roleOf(e)}`).join(' ')} `;
}

/** Substrings of which a company's `tags` must contain one for these email filters. Empty for none. */
function tagNeedles(query: LocalCompaniesQuery): string[] {
  const { verification: v, kind: k } = query;
  const roles = query.decisionMakers ? ['dm'] : query.people ? ['dm', 'pp'] : null;
  if (!roles) {
    if (v && k) return [` ${v}:${k}:`];
    if (v) return [` ${v}:`];
    if (k) return [`:${k}:`];
    return [];
  }
  return roles.flatMap((r) => {
    if (v && k) return [` ${v}:${k}:${r} `];
    if (v) return [` ${v}:generic:${r} `, ` ${v}:personal:${r} `];
    if (k) return [`:${k}:${r} `];
    return [`:${r} `];
  });
}

function emailMatches(e: Email, query: LocalCompaniesQuery): boolean {
  return (
    (!query.verification || e.verification === query.verification) &&
    (!query.kind || e.kind === query.kind) &&
    (!query.decisionMakers || isDecisionMakerEmail(e)) &&
    (!query.people || e.person != null)
  );
}

/**
 * Forgets the companies of every search that holds rows an older app wrote
 * (no `TAGS_MARK`), and marks those searches unsynced so the next pass
 * fetches them whole. One indexed delete, no JSON parsing, so it stays fast.
 */
function dropStaleCompanies(db: DatabaseSync): void {
  const stale = db
    .prepare(`select distinct search_id as id from companies where substr(tags, 1, ${TAGS_MARK.length + 1}) <> '${TAGS_MARK} '`)
    .all() as { id: string }[];
  if (stale.length === 0) return;
  db.exec('begin');
  try {
    const drop = db.prepare('delete from companies where search_id = ?');
    const unsync = db.prepare('update searches set synced_fingerprint = null, synced_at = null where id = ?');
    for (const { id } of stale) {
      drop.run(id);
      unsync.run(id);
    }
    db.exec('commit');
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}

export interface StoredSearch {
  search: Search;
  fingerprint: string;
  syncedFingerprint: string | null;
  syncedAt: number | null;
}

/**
 * The local copy of the signed-in user's leads, in SQLite (node:sqlite, which
 * Electron ships, so nothing native is bundled). One table of searches as the
 * API returned them, one of their companies with only the columns the filters
 * read, and one with each company as JSON, emails inline. Filtering 50k
 * companies scans the narrow table and takes milliseconds.
 *
 * The file opens on first use and `wipe()` deletes it.
 */
export class LocalStore {
  private db: DatabaseSync | null = null;

  constructor(private readonly file: string) {}

  private open(): DatabaseSync {
    if (this.db) return this.db;
    if (this.file !== ':memory:') mkdirSync(dirname(this.file), { recursive: true });
    try {
      this.db = LocalStore.prepare(new DatabaseSync(this.file));
    } catch (err) {
      // A copy we cannot read or upgrade is only a cache: start over and let sync refill it.
      if (this.file === ':memory:') throw err;
      for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(`${this.file}${suffix}`, { force: true });
      this.db = LocalStore.prepare(new DatabaseSync(this.file));
    }
    return this.db;
  }

  private static prepare(db: DatabaseSync): DatabaseSync {
    try {
      db.exec('pragma journal_mode = wal; pragma synchronous = normal; pragma foreign_keys = on;');
      db.exec(SCHEMA);
      dropStaleCompanies(db);
      return db;
    } catch (err) {
      db.close();
      throw err;
    }
  }

  private tx<T>(fn: (db: DatabaseSync) => T): T {
    const db = this.open();
    db.exec('begin');
    try {
      const result = fn(db);
      db.exec('commit');
      return result;
    } catch (err) {
      db.exec('rollback');
      throw err;
    }
  }

  /**
   * Makes the stored searches exactly `searches`: new ones are added, changed
   * ones updated, and any the API no longer returns are deleted with their
   * companies. Returns whether anything changed and which searches were removed.
   */
  replaceSearches(searches: Search[]): { changed: boolean; removed: string[] } {
    return this.tx((db) => {
      const existing = new Map(
        (db.prepare('select id, json from searches').all() as { id: string; json: string }[]).map((r) => [r.id, r.json]),
      );
      const keep = new Set(searches.map((s) => s.id));
      const removed = [...existing.keys()].filter((id) => !keep.has(id));
      const del = db.prepare('delete from searches where id = ?');
      for (const id of removed) del.run(id);

      const upsert = db.prepare(`
        insert into searches (id, created_at, json, fingerprint) values (?, ?, ?, ?)
        on conflict (id) do update set json = excluded.json, fingerprint = excluded.fingerprint
      `);
      // A search that runs again (POST /v1/searches/:id/more) holds companies the copy
      // never fetched: forget the copy's, so the API serves them until the next fetch.
      const unsync = db.prepare('update searches set synced_fingerprint = null where id = ?');
      let changed = removed.length > 0;
      for (const search of searches) {
        const json = JSON.stringify(search);
        const before = existing.get(search.id);
        if (before === json) continue;
        upsert.run(search.id, search.createdAt, json, fingerprintOf(search));
        if (before !== undefined && (isActiveSearch(search) || runCount(JSON.parse(before) as Search) !== runCount(search))) {
          unsync.run(search.id);
        }
        changed = true;
      }
      return { changed, removed };
    });
  }

  /** Deletes one search and its companies. Returns true when it was there. */
  deleteSearch(id: string): boolean {
    return Number(this.open().prepare('delete from searches where id = ?').run(id).changes) > 0;
  }

  /**
   * Replaces a search's companies with what the API returned, so an address
   * or company the server dropped (opt-out, retention) is gone here too.
   * `fingerprint` is the search's fingerprint when the fetch started.
   */
  replaceCompanies(searchId: string, companies: Company[], fingerprint: string, syncedAt: number): boolean {
    return this.tx((db) => {
      const found = db.prepare('select 1 from searches where id = ?').get(searchId);
      if (!found) return false;
      db.prepare('delete from companies where search_id = ?').run(searchId);
      const insert = db.prepare(
        'insert or ignore into companies (search_id, id, ord, haystack, tags, email_count) values (?, ?, ?, ?, ?, ?)',
      );
      const body = db.prepare('insert into company_bodies (row, json) values (?, ?)');
      companies.forEach((c, i) => {
        const { changes, lastInsertRowid } = insert.run(searchId, c.id, i, haystackOf(c), tagsOf(c), c.emails.length);
        if (Number(changes) > 0) body.run(lastInsertRowid, JSON.stringify(c));
      });
      db.prepare('update searches set synced_fingerprint = ?, synced_at = ? where id = ?').run(fingerprint, syncedAt, searchId);
      return true;
    });
  }

  listStored(): StoredSearch[] {
    const rows = this.open()
      .prepare('select json, fingerprint, synced_fingerprint, synced_at from searches order by created_at desc, id desc')
      .all() as { json: string; fingerprint: string; synced_fingerprint: string | null; synced_at: number | null }[];
    return rows.map((r) => ({
      search: JSON.parse(r.json) as Search,
      fingerprint: r.fingerprint,
      syncedFingerprint: r.synced_fingerprint,
      syncedAt: r.synced_at,
    }));
  }

  listSearches(): Search[] {
    return this.listStored().map((s) => s.search);
  }

  getSearch(id: string): Search | null {
    const row = this.open().prepare('select json from searches where id = ?').get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Search) : null;
  }

  /**
   * One page of a search's companies under `LeadFilters`, like the API: `q`
   * matches name, domain or address, and with `verification` or `kind` set
   * only companies with a matching email come back, with only those emails.
   * Null while the search runs or before its companies were fetched.
   */
  queryCompanies(searchId: string, query: LocalCompaniesQuery): LocalCompaniesPage | null {
    const db = this.open();
    const row = db.prepare('select json, synced_fingerprint from searches where id = ?').get(searchId) as
      | { json: string; synced_fingerprint: string | null }
      | undefined;
    if (!row || row.synced_fingerprint === null || isActiveSearch(JSON.parse(row.json) as Search)) return null;

    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = Math.min(LOCAL_PAGE_MAX, Math.max(1, Math.floor(query.limit ?? LOCAL_PAGE_DEFAULT)));
    const q = query.q?.trim().toLowerCase() ?? '';
    const needles = tagNeedles(query);
    const params: Record<string, string | number> = { $search: searchId };
    const where = ['search_id = $search'];
    if (q) {
      where.push('instr(haystack, $q) > 0');
      params['$q'] = q;
    }
    if (needles.length > 0) {
      where.push(`(${needles.map((_, i) => `instr(tags, $tag${i}) > 0`).join(' or ')})`);
      needles.forEach((needle, i) => (params[`$tag${i}`] = needle));
    }
    const filter = where.join(' and ');

    const { n: total } = db.prepare(`select count(*) as n from companies where ${filter}`).get(params) as { n: number };
    const rows = db
      .prepare(
        `select b.json from (select row, ord from companies where ${filter} order by ord limit $limit offset $offset) c
         join company_bodies b on b.row = c.row order by c.ord`,
      )
      .all({ ...params, $limit: limit, $offset: offset }) as { json: string }[];

    const companies = rows.map((r) => {
      const company = JSON.parse(r.json) as Company;
      if (needles.length === 0) return company;
      return { ...company, emails: company.emails.filter((e) => emailMatches(e, query)) };
    });
    return { companies, total, nextOffset: offset + rows.length < total ? offset + rows.length : null };
  }

  /**
   * Companies across every search whose name, domain or an address contains
   * `q`, newest search first and in API order within a search. Only searches
   * whose companies were fetched take part. Emails are left whole.
   */
  findCompanies(query: LocalFindQuery): LocalFindResult {
    const q = query.q.trim().toLowerCase();
    if (!q) return { hits: [], total: 0 };
    const limit = Math.min(LOCAL_FIND_MAX, Math.max(1, Math.floor(query.limit ?? LOCAL_FIND_DEFAULT)));
    const db = this.open();
    const { n: total } = db.prepare('select count(*) as n from companies where instr(haystack, $q) > 0').get({ $q: q }) as {
      n: number;
    };
    if (total === 0) return { hits: [], total: 0 };
    const rows = db
      .prepare(
        `select s.json as search, b.json as company from companies c
         join searches s on s.id = c.search_id
         join company_bodies b on b.row = c.row
         where instr(c.haystack, $q) > 0
         order by s.created_at desc, s.id desc, c.ord
         limit $limit`,
      )
      .all({ $q: q, $limit: limit }) as { search: string; company: string }[];
    const searches = new Map<string, Search>();
    const hits = rows.map((r) => {
      let search = searches.get(r.search);
      if (!search) searches.set(r.search, (search = JSON.parse(r.search) as Search));
      return { search, company: JSON.parse(r.company) as Company };
    });
    return { hits, total };
  }

  counts(): { searches: number; companies: number; emails: number } {
    const row = this.open()
      .prepare(
        `select (select count(*) from searches) as searches, count(*) as companies,
                coalesce(sum(email_count), 0) as emails from companies`,
      )
      .get() as { searches: number; companies: number; emails: number };
    return { searches: row.searches, companies: row.companies, emails: row.emails };
  }

  /** Closes the database and deletes the file. The next call starts empty. */
  wipe(): void {
    this.db?.close();
    this.db = null;
    if (this.file === ':memory:') return;
    for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(`${this.file}${suffix}`, { force: true });
  }
}
