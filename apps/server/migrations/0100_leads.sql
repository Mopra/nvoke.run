-- Lead pipeline: accounts, searches, companies, emails, the verification
-- cache, monthly usage, the job queue and the crawl opt-out list.
--
-- Every table has RLS enabled with no policies. The server connects as the
-- table owner and bypasses RLS; the anon and authenticated Supabase roles see
-- nothing. Auth tables (device_sessions, desktop_auth_codes) live in their own
-- migration.

create table accounts (
  clerk_user_id text primary key,
  plan          text not null default 'free' check (plan in ('free', 'pro', 'business')),
  created_at    timestamptz not null default now()
);

create table searches (
  id                uuid primary key default gen_random_uuid(),
  clerk_user_id     text not null references accounts (clerk_user_id) on delete cascade,
  kind              text not null check (kind in ('local', 'web', 'launches')),
  params            jsonb not null default '{}'::jsonb,
  "limit"           integer not null check ("limit" > 0),
  status            text not null default 'queued'
                    check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  error             text,
  companies_found   integer not null default 0,
  companies_crawled integer not null default 0,
  emails_found      integer not null default 0,
  emails_valid      integer not null default 0,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz
);

create index searches_user_created_idx on searches (clerk_user_id, created_at desc);

create table companies (
  id            uuid primary key default gen_random_uuid(),
  search_id     uuid not null references searches (id) on delete cascade,
  clerk_user_id text not null,
  name          text not null,
  domain        text not null,
  website       text not null,
  source        text not null,
  source_ref    text,
  location      text,
  phone         text,
  category      text,
  crawl_status  text not null default 'pending'
                check (crawl_status in ('pending', 'done', 'failed', 'blocked')),
  crawled_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (search_id, domain)
);

-- Keyset pagination of a search's companies.
create index companies_search_page_idx on companies (search_id, created_at, id);

create table emails (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies (id) on delete cascade,
  search_id     uuid not null references searches (id) on delete cascade,
  clerk_user_id text not null,
  address       text not null check (address = lower(address)),
  kind          text not null check (kind in ('generic', 'personal')),
  source_url    text,
  -- Null until the verify job has run.
  verification  text check (verification in ('valid', 'invalid', 'risky', 'catch_all', 'unknown')),
  checked_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (company_id, address)
);

create index emails_search_idx on emails (search_id);
create index emails_address_idx on emails (address);

-- Verification results per address, reused for 30 days.
create table email_checks (
  address      text primary key check (address = lower(address)),
  verification text not null check (verification in ('valid', 'invalid', 'risky', 'catch_all', 'unknown')),
  mx_host      text,
  reason       text,
  checked_at   timestamptz not null default now()
);

create table usage (
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  period        text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  emails_found  integer not null default 0 check (emails_found >= 0),
  primary key (clerk_user_id, period)
);

-- The work queue. Claimed with FOR UPDATE SKIP LOCKED, see src/worker/queue.ts.
create table jobs (
  id           bigint generated always as identity primary key,
  type         text not null check (type in ('find', 'crawl', 'verify')),
  payload      jsonb not null default '{}'::jsonb,
  search_id    uuid references searches (id) on delete cascade,
  status       text not null default 'queued'
               check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  attempts     integer not null default 0,
  max_attempts integer not null default 3,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index jobs_claim_idx on jobs (run_after, id) where status = 'queued';
create index jobs_search_status_idx on jobs (search_id, status);
create index jobs_running_idx on jobs (locked_at) where status = 'running';

-- Domains whose owners asked us not to crawl them (fed from nvoke.run/bot).
create table crawl_optouts (
  domain     text primary key check (domain = lower(domain)),
  reason     text,
  created_at timestamptz not null default now()
);

alter table accounts      enable row level security;
alter table searches      enable row level security;
alter table companies     enable row level security;
alter table emails        enable row level security;
alter table email_checks  enable row level security;
alter table usage         enable row level security;
alter table jobs          enable row level security;
alter table crawl_optouts enable row level security;
