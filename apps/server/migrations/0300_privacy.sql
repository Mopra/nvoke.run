-- Privacy and the shared domain cache (docs/SPEC.md, "Privacy" and "Domain cache").
--
-- suppressions replaces crawl_optouts. It holds sha256 hashes only, so the
-- list of people who opted out is not itself a list of addresses.
-- domains and domain_emails cache crawls across users. domain_emails holds
-- generic role addresses only (info@, kontakt@); personal addresses stay in
-- the per-search emails table of the user whose search found them.

create table suppressions (
  -- sha256 hex of the lowercased address, or of 'domain:' || registrable domain.
  hash       text primary key check (hash ~ '^[0-9a-f]{64}$'),
  kind       text not null check (kind in ('address', 'domain')),
  -- Where the request came from: 'opt_out_page', 'email', 'bot_page', 'admin'.
  source     text not null default 'admin',
  created_at timestamptz not null default now()
);

insert into suppressions (hash, kind, source, created_at)
select encode(sha256(convert_to('domain:' || domain, 'UTF8')), 'hex'), 'domain', 'bot_page', created_at
from crawl_optouts
on conflict do nothing;

drop table crawl_optouts;

create table domains (
  domain       text primary key check (domain = lower(domain)),
  crawl_status text not null check (crawl_status in ('done', 'failed', 'blocked')),
  crawled_at   timestamptz not null,
  -- Whether the last crawl found personal addresses. They are not cached, so
  -- a search that finds such a domain crawls it again to get them.
  has_personal boolean not null default false,
  -- After this the next search that finds the domain crawls it again.
  recheck_at   timestamptz not null
);

create table domain_emails (
  domain     text not null references domains (domain) on delete cascade,
  address    text not null check (address = lower(address)),
  source_url text,
  -- Fixed at first collection. Updates never move it, and the retention job
  -- deletes the row 12 months after it.
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (domain, address)
);

create index domain_emails_address_idx on domain_emails (address);
create index domain_emails_first_seen_idx on domain_emails (first_seen);
create index searches_created_idx on searches (created_at);

alter table suppressions  enable row level security;
alter table domains       enable row level security;
alter table domain_emails enable row level security;
