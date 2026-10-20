-- migrate: no transaction
--
-- Fills the company index vectors of the rows kept before 1720_company_index
-- and builds its GIN indexes, without a long lock on the live tables. The
-- runner (src/db/migrations.ts) runs this file statement by statement outside
-- a transaction: each backfill commits every 500 rows, so a batch holds its
-- row locks for a moment only, and the indexes are built concurrently. New
-- rows get their vector from the trigger meanwhile.
--
-- Production ran the first version of 1720, where `search` is a generated
-- column that fills itself; there both backfills are skipped.
--
-- Safe to run again after a failure: the backfill skips rows that have a
-- vector, and an index a failed concurrent build left invalid is dropped and
-- built again.

set lock_timeout = '5s';

do $$
declare
  last_domain text := '';
  last_url text := '';
begin
  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'domain_pages'
               and column_name = 'search' and is_generated = 'ALWAYS') then
    return;
  end if;
  loop
    with batch as (
      select domain, url from domain_pages
      where (domain, url) > (last_domain, last_url)
      order by domain, url
      limit 500
    ), filled as (
      update domain_pages p set search = domain_pages_vector(p.title, p.description, p.text)
      from batch b
      where p.domain = b.domain and p.url = b.url and p.search is null
    )
    select domain, url into last_domain, last_url from batch order by domain desc, url desc limit 1;
    exit when not found;
    commit;
  end loop;
end
$$;

do $$
declare
  last_id bigint := 0;
  next_id bigint;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'feed_items'
               and column_name = 'search' and is_generated = 'ALWAYS') then
    return;
  end if;
  loop
    select max(id) into next_id from (select id from feed_items where id > last_id order by id limit 500) b;
    exit when next_id is null;
    update feed_items set search = feed_items_vector(name, search_text)
    where id > last_id and id <= next_id and search is null;
    last_id := next_id;
    commit;
  end loop;
end
$$;

drop index concurrently if exists domain_pages_search_idx;
create index concurrently domain_pages_search_idx on domain_pages using gin (search);

drop index concurrently if exists feed_items_search_idx;
create index concurrently feed_items_search_idx on feed_items using gin (search);
