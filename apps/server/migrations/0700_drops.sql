-- Fresh leads: the feed and drops (docs/SPEC.md, "Drops").
--
-- The worker collects new launches from Show HN, Launch HN, Product Hunt and
-- Y Combinator around the clock into feed_items. Only what the source
-- publishes about a product goes in: its name, website, tagline, description,
-- tags and location. Nothing is crawled at collection time and no addresses
-- are stored here. purge() drops items RETENTION.feedItemDays after
-- discovery.
--
-- A drop is a user's saved filter over the feed. Once a day each enabled drop
-- with something new creates a search of kind 'drop' (searches.drop_id) that
-- runs through the normal find, crawl and verify pipeline. cursor is the
-- highest feed_items.id a run has already considered, so a run only sees
-- launches collected since the previous one.

create table feed_items (
  id            bigint generated always as identity primary key,
  -- show_hn | launch_hn | product_hunt | yc
  source        text not null,
  -- Stable id within the source: an HN item id, a Product Hunt post id, a YC slug.
  source_ref    text not null,
  name          text not null,
  website       text not null,
  -- Registrable domain of website, lowercase.
  domain        text not null check (domain = lower(domain)),
  tagline       text,
  description   text,
  tags          text[] not null default '{}',
  location      text,
  -- When the source says it launched, when it says.
  launched_at   timestamptz,
  discovered_at timestamptz not null default now(),
  -- Lowercased name, tagline, description and tags, for keyword filters.
  search_text   text not null,
  unique (source, source_ref)
);

create index feed_items_domain_idx on feed_items (domain);
create index feed_items_discovered_idx on feed_items (discovered_at);

-- One row per collector: when it last ran and how that went.
create table feed_sources (
  source      text primary key,
  last_run_at timestamptz not null,
  -- Last run that finished without an error. The next run reaches back to here.
  last_ok_at  timestamptz,
  last_error  text,
  last_found  integer not null default 0,
  last_added  integer not null default 0
);

create table drops (
  id            uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  name          text not null,
  keyword       text,
  sources       text[] not null,
  daily_limit   integer not null check (daily_limit between 1 and 1000),
  enabled       boolean not null default true,
  -- Highest feed_items.id already considered. 0 until the first run.
  cursor        bigint not null default 0,
  next_run_at   timestamptz not null default now(),
  -- Last run that created a search.
  last_delivered_at timestamptz,
  created_at    timestamptz not null default now()
);

create index drops_user_idx on drops (clerk_user_id, created_at desc);
create index drops_due_idx on drops (next_run_at) where enabled;

alter table searches drop constraint searches_kind_check;
alter table searches add constraint searches_kind_check check (kind in ('local', 'web', 'launches', 'drop'));
alter table searches add column drop_id uuid references drops (id) on delete set null;
create index searches_drop_idx on searches (drop_id) where drop_id is not null;

alter table feed_items   enable row level security;
alter table feed_sources enable row level security;
alter table drops        enable row level security;
