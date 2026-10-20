-- Company index (docs/research/cost.md, lever 1). Every crawled domain keeps
-- the text of up to 3 pages in domain_pages for 12 months, and the feed
-- collectors keep launches in feed_items. Both get a full text vector, so a
-- "Describe your customer" search finds companies nvoke already knows before
-- it pays Brave (src/leads/company-index.ts).
--
-- The market is international, so every text is indexed twice: with
-- 'simple' (exact words in any language: "Kaltakquise", "Agentur") and with
-- 'english' (stemmed: "agencies" finds "agency"). A query asks both.
-- Only company data goes in: anything shaped like an email address is cut
-- out of the text before it is indexed, so the index never holds an address,
-- personal or not.
--
-- Both tables are live, so nothing here rewrites them: the vector is a plain
-- nullable column (a catalog change only) that a trigger fills on every
-- insert and on every change to the text. The rows already there are filled
-- in batches and the GIN indexes built concurrently by
-- 1721_company_index_backfill, which runs outside a transaction.

set local lock_timeout = '5s';

create function company_index_vector(body text, weight "char") returns tsvector
language sql immutable parallel safe
as $$
  select setweight(
    to_tsvector('simple'::regconfig, regexp_replace(coalesce(body, ''), '[^\s@<>()"'',;:]+@[^\s@<>()"'',;:]+', ' ', 'g'))
      || to_tsvector('english'::regconfig, regexp_replace(coalesce(body, ''), '[^\s@<>()"'',;:]+@[^\s@<>()"'',;:]+', ' ', 'g')),
    weight
  )
$$;

-- Title first, then the meta description, then the visible text.
create function domain_pages_vector(title text, description text, body text) returns tsvector
language sql immutable parallel safe
as $$
  select company_index_vector(title, 'A') || company_index_vector(description, 'B') || company_index_vector(body, 'C')
$$;

-- The launch's name first, then its tagline, description and tags (search_text holds them all).
create function feed_items_vector(name text, search_text text) returns tsvector
language sql immutable parallel safe
as $$
  select company_index_vector(name, 'A') || company_index_vector(search_text, 'B')
$$;

alter table domain_pages add column search tsvector;
alter table feed_items add column search tsvector;

create function domain_pages_search() returns trigger
language plpgsql
as $$
begin
  new.search := domain_pages_vector(new.title, new.description, new.text);
  return new;
end
$$;

create trigger domain_pages_search
before insert or update of title, description, text on domain_pages
for each row execute function domain_pages_search();

create function feed_items_search() returns trigger
language plpgsql
as $$
begin
  new.search := feed_items_vector(new.name, new.search_text);
  return new;
end
$$;

create trigger feed_items_search
before insert or update of name, search_text on feed_items
for each row execute function feed_items_search();
