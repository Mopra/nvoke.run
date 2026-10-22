-- Domains the company index learnt from a free archive rather than a crawl of
-- ours (docs/research/common-crawl-index.md). `cli cc load` writes a domains
-- row (due for a recrawl at once), the homepage's title, description and the
-- start of its text in domain_pages, and a row here naming where they came
-- from, so `cli stats` can count the companies those rows served and a load
-- can be undone. Goes with the domain row: retention and erasure drop both.
create table index_imports (
  domain    text primary key references domains (domain) on delete cascade,
  -- 'common_crawl'.
  source    text not null,
  -- The archive's own name for the snapshot: CC-MAIN-2026-43.
  crawl     text not null,
  loaded_at timestamptz not null default now()
);

create index index_imports_source_idx on index_imports (source, crawl);

alter table index_imports enable row level security;
