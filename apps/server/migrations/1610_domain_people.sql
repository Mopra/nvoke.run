-- The people a domain's own pages name, next to the shared crawl cache
-- (docs/lead-quality), so a search served from the cache still gets them.
-- Names and titles only, never an address. Replaced on every real crawl,
-- deleted with the domain (retention, opt-out, erasure).
create table domain_people (
  domain     text not null references domains (domain) on delete cascade,
  first_name text not null,
  last_name  text not null,
  title      text,
  seniority  text check (seniority in ('founder', 'executive', 'director', 'manager', 'staff')),
  source_url text,
  -- The crawl's order: decision makers first.
  position   smallint not null default 0,
  fetched_at timestamptz not null default now()
);

create unique index domain_people_name_idx on domain_people (domain, lower(first_name), lower(last_name));

alter table domain_people enable row level security;

-- When Claude last read the domain's people pages (src/leads/people-llm.ts).
-- A crawl within 90 days of it uses domain_people instead of asking again.
alter table domains add column people_read_at timestamptz;
