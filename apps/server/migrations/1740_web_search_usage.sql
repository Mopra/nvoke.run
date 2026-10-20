-- Paid web search requests per provider and month (docs/SPEC.md, "Source
-- costs"). With two paid web searches (WEB_SEARCH_PROVIDER and
-- WEB_SEARCH_FALLBACK, src/leads/sources/paid-search.ts) each has its own
-- price and monthly budget, so its requests are counted here, one row per
-- provider and UTC month, an atomic add per paid page.
-- searches.source_requests still counts every paid request of a search.
create table web_search_usage (
  provider text not null,
  -- The first day of the UTC month.
  month    date not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (provider, month)
);

alter table web_search_usage enable row level security;
