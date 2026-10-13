import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Company, Search } from '@nvoke/shared';
import type { LocalCompaniesPage, LocalCompaniesQuery } from '../../ipc/contract';

export const LOCAL_PAGE_DEFAULT = 200;
export const LOCAL_PAGE_MAX = 500;

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
    -- ' verification:kind ' per email, for the email filters
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

export function isActiveSearch(search: Pick<Search, 'status'>): boolean {
  return search.status === 'queued' || search.status === 'running';
}

function haystackOf(company: Company): string {
  return [company.name, company.domain, ...company.emails.map((e) => e.address)].join('\n').toLowerCase();
}

function tagsOf(company: Company): string {
  return ` ${company.emails.map((e) => `${e.verification ?? 'none'}:${e.kind}`).join(' ')} `;
}

/** The substring a company's `tags` must contain for these email filters, or '' for none. */
function tagNeedle(query: LocalCompaniesQuery): string {
  if (query.verification && query.kind) return ` ${query.verification}:${query.kind} `;
  if (query.verification) return ` ${query.verification}:`;
  if (query.kind) return `:${query.kind} `;
  return '';
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
    const db = new DatabaseSync(this.file);
    db.exec('pragma journal_mode = wal; pragma synchronous = normal; pragma foreign_keys = on;');
    db.exec(SCHEMA);
    this.db = db;
    return db;
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
      let changed = removed.length > 0;
      for (const search of searches) {
        const json = JSON.stringify(search);
        if (existing.get(search.id) === json) continue;
        upsert.run(search.id, search.createdAt, json, fingerprintOf(search));
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
    const tag = tagNeedle(query);
    const params: Record<string, string | number> = { $search: searchId };
    const where = ['search_id = $search'];
    if (q) {
      where.push('instr(haystack, $q) > 0');
      params['$q'] = q;
    }
    if (tag) {
      where.push('instr(tags, $tag) > 0');
      params['$tag'] = tag;
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
      if (!query.verification && !query.kind) return company;
      return {
        ...company,
        emails: company.emails.filter(
          (e) => (!query.verification || e.verification === query.verification) && (!query.kind || e.kind === query.kind),
        ),
      };
    });
    return { companies, total, nextOffset: offset + rows.length < total ? offset + rows.length : null };
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
