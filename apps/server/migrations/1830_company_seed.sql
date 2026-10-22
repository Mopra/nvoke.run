-- The company seed (docs/research/company-seed.md). Company domains from a
-- free list wait here until the worker's seed tick crawls their homepage, a
-- few a minute up to SEED_DAILY_DOMAINS a day, so the company index
-- (domain_pages, 1720_company_index) knows them before a Sonar search pays
-- for web search. Only domain names: no page text, no address.
create table seed_domains (
  domain     text primary key,
  -- The list it came from (seed/sources.ts), and its rank there.
  source     text not null,
  rank       integer,
  status     text not null default 'queued' check (status in ('queued', 'running', 'done', 'skipped')),
  -- done: the crawl's outcome (done, failed, blocked, refused, js_only, error).
  -- skipped: suppressed, or a search crawled it first.
  outcome    text,
  added_at   timestamptz not null default now(),
  claimed_at timestamptz,
  crawled_at timestamptz
);

-- The next domains to crawl, best rank first.
create index seed_domains_queue_idx on seed_domains (rank, domain) where status = 'queued';
-- The daily cap counts the last 24 hours' crawls.
create index seed_domains_crawled_idx on seed_domains (crawled_at) where crawled_at is not null;

alter table seed_domains enable row level security;
