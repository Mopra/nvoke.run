-- Paid source costs (docs/SPEC.md, "Source costs").
--
-- web_search_cache keeps Brave Search result pages for a few days, so the
-- same query and country is not paid for twice. It holds only what the find
-- job uses (company name, website, result URL), never the raw response, and
-- purge() deletes rows past RETENTION.webSearchCacheDays.
-- searches.source_requests and source_cache_hits count paid calls and pages
-- served from the cache, so cost per valid email can be measured.

create table web_search_cache (
  -- The Brave q parameter, trimmed, lowercased, single spaced.
  query      text not null,
  -- The Brave country parameter, or '' for none.
  country    text not null default '',
  page       integer not null check (page >= 0),
  companies  jsonb not null,
  -- Whether Brave said more pages exist after this one.
  more       boolean not null,
  fetched_at timestamptz not null default now(),
  primary key (query, country, page)
);

create index web_search_cache_fetched_idx on web_search_cache (fetched_at);

alter table web_search_cache enable row level security;

alter table searches
  add column source_requests   integer not null default 0,
  add column source_cache_hits integer not null default 0;
