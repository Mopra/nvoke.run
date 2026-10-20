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
alter table domain_pages add column search tsvector generated always as (
  company_index_vector(title, 'A') || company_index_vector(description, 'B') || company_index_vector(text, 'C')
) stored;

create index domain_pages_search_idx on domain_pages using gin (search);

-- The launch's name first, then its tagline, description and tags (search_text holds them all).
alter table feed_items add column search tsvector generated always as (
  company_index_vector(name, 'A') || company_index_vector(search_text, 'B')
) stored;

create index feed_items_search_idx on feed_items using gin (search);
