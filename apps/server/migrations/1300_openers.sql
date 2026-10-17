-- Openers per company (docs/SPEC.md, "Openers"). The crawl keeps the visible
-- text of a few pages per domain, capped, next to the shared crawl cache, so
-- Claude can draft a first line from what the site says. The opener itself is
-- stored on the user's company row.

-- The text of the pages the last real crawl read: the homepage and up to two
-- pages that describe the business. Replaced on every crawl, deleted with the
-- domain (retention, opt-out, erasure).
create table domain_pages (
  domain      text not null references domains (domain) on delete cascade,
  url         text not null,
  title       text not null default '',
  description text not null default '',
  text        text not null,
  fetched_at  timestamptz not null default now(),
  primary key (domain, url)
);

alter table companies
  -- null until asked for, then queued, done (with a line), none (no fact to
  -- build on) or failed (Claude could not answer).
  add column opener_status text check (opener_status in ('queued', 'done', 'none', 'failed')),
  add column opener text,
  -- The page the line's fact is on, and the words on it, verbatim.
  add column opener_source_url text,
  add column opener_quote text,
  add column opener_at timestamptz;

alter table jobs drop constraint jobs_type_check;
alter table jobs add constraint jobs_type_check check (type in ('find', 'crawl', 'verify', 'opener'));

alter table domain_pages enable row level security;
