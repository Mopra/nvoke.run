import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { applyMigrations, NO_TRANSACTION, readMigrations, splitStatements } from './migrations.js';

describe('splitStatements', () => {
  it('splits at semicolons outside quotes, comments and dollar quoted bodies', () => {
    const text = `-- a comment; not a statement
set lock_timeout = '5s';
select 'it''s; fine', "odd;name" from t; /* a; b */
do $$ begin perform 1; commit; end $$;
create function f() returns int language sql as $body$ select 1; $body$;
-- trailing comment only`;
    expect(splitStatements(text)).toEqual([
      "-- a comment; not a statement\nset lock_timeout = '5s'",
      `select 'it''s; fine', "odd;name" from t`,
      '/* a; b */\ndo $$ begin perform 1; commit; end $$',
      'create function f() returns int language sql as $body$ select 1; $body$',
    ]);
  });
});

describe('applyMigrations', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db.drop();
  });

  it('runs a no transaction file statement by statement: batches commit and indexes build concurrently', async () => {
    const all = [
      { id: '9000_t', sql: 'create table mig_t (id int primary key, v int);\ninsert into mig_t select g, null from generate_series(1, 25) g;' },
      {
        id: '9001_t',
        sql: `${NO_TRANSACTION}
set lock_timeout = '5s';
do $$
declare last_id int := 0;
begin
  loop
    update mig_t set v = id * 2 where id > last_id and id <= last_id + 10;
    exit when not found;
    last_id := last_id + 10;
    commit;
  end loop;
end
$$;
create index concurrently mig_t_v_idx on mig_t (v);`,
      },
    ];
    expect(await applyMigrations(db.sql, undefined, all)).toEqual(['9000_t', '9001_t']);
    expect((await db.sql`select count(*)::int as n from mig_t where v = id * 2`)[0]!.n).toBe(25);
    const [idx] = await db.sql`select i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'mig_t_v_idx'`;
    expect(idx?.indisvalid).toBe(true);
    // The session's settings go back to the pool clean.
    const [lt] = await db.sql`show lock_timeout`;
    expect(lt?.lock_timeout).toBe('0');
    expect(await applyMigrations(db.sql, undefined, all)).toEqual([]);
  });

  it('runs the company index backfill again: fills the vectors still missing, without addresses, and rebuilds the indexes', async () => {
    await db.sql`insert into domains (domain, crawl_status, crawled_at, recheck_at) values ('acme.com', 'done', now(), now())`;
    await db.sql`insert into domain_pages (domain, url, title, text) values ('acme.com', 'https://acme.com/', 'Acme agency', 'Write to jane@acme.com')`;
    await db.sql`insert into feed_items (source, source_ref, name, website, domain, search_text) values ('show_hn', '1', 'Acme', 'https://acme.com', 'acme.com', 'acme cold email')`;
    // The trigger fills new rows.
    const [page] = await db.sql<{ v: string }[]>`select search::text as v from domain_pages`;
    expect(page?.v).toContain("'agenc'");
    // Rows kept before the trigger have none: the backfill fills them.
    await db.sql`update domain_pages set search = null`;
    await db.sql`update feed_items set search = null`;
    await db.sql`delete from _migrations where id = '1721_company_index_backfill'`;
    expect(await applyMigrations(db.sql)).toEqual(['1721_company_index_backfill']);
    const pages = await db.sql<{ v: string | null }[]>`select search::text as v from domain_pages`;
    expect(pages[0]?.v).toContain("'agenc'");
    expect(pages[0]?.v).not.toMatch(/@|jane/);
    const [feed] = await db.sql<{ v: string | null }[]>`select search::text as v from feed_items`;
    expect(feed?.v).toContain("'cold'");
    const valid = await db.sql<{ relname: string; indisvalid: boolean }[]>`
      select c.relname, i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid
      where c.relname in ('domain_pages_search_idx', 'feed_items_search_idx') order by c.relname
    `;
    expect(valid).toEqual([
      { relname: 'domain_pages_search_idx', indisvalid: true },
      { relname: 'feed_items_search_idx', indisvalid: true },
    ]);
    expect(readMigrations().map((m) => m.id)).toContain('1721_company_index_backfill');
  });
});
