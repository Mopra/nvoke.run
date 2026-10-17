-- People, not inboxes (docs/lead-quality). A crawl now reads the people a
-- company names on its own pages (team, about, imprint), and nvoke builds
-- their addresses from the domain's pattern. Every column is additive and
-- nullable, so the old API and worker keep running on this schema.

-- The people found for a company, with or without an address yet.
create table people (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies (id) on delete cascade,
  search_id   uuid not null references searches (id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  title       text,
  -- founder: founder, owner, CEO, managing director, partner.
  -- executive: other C level, VP. director: head of, director.
  seniority   text check (seniority in ('founder', 'executive', 'director', 'manager', 'staff')),
  -- Where the name came from: a page of the company's site, a business
  -- registry, a search engine snippet of a public profile.
  source      text not null check (source in ('page', 'registry', 'search')),
  source_url  text,
  created_at  timestamptz not null default now()
);

create unique index people_company_name_idx on people (company_id, lower(first_name), lower(last_name));
create index people_search_idx on people (search_id);

-- The person behind an address, copied onto the row so lists and exports
-- read one table. found_via: page (printed on the site), pattern (built
-- from the domain's address pattern and confirmed by the mail server).
-- confidence: 0 to 100, how sure nvoke is the address reaches that person.
alter table emails
  add column person_id  uuid references people (id) on delete set null,
  add column first_name text,
  add column last_name  text,
  add column title      text,
  add column seniority  text check (seniority in ('founder', 'executive', 'director', 'manager', 'staff')),
  add column found_via  text check (found_via in ('page', 'pattern', 'cache')),
  add column confidence smallint check (confidence between 0 and 100);

-- How well a company fits what the user asked for, 0 to 100, judged from
-- its own words. Null when it was not scored.
alter table companies
  add column fit        smallint check (fit between 0 and 100),
  add column fit_reason text;

-- Plain words searches ("describe your customer"): nvoke plans the queries.
-- stage and stage_note are the live progress line ("Looking in 12 more
-- cities"); ongoing searches keep finding new companies after they finish.
alter table searches drop constraint searches_kind_check;
alter table searches add constraint searches_kind_check
  check (kind in ('local', 'web', 'launches', 'domains', 'drop', 'icp'));
alter table searches
  add column stage      text,
  add column stage_note text,
  add column ongoing    boolean not null default false,
  add column plan       jsonb;

alter table jobs drop constraint jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('find', 'crawl', 'verify', 'opener', 'people'));

alter table people enable row level security;
