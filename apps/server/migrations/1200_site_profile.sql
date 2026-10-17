-- Start from your website (docs/SPEC.md, "Site profile"). One profile per
-- account: what the user's own site says they sell and to whom, and the
-- searches Claude suggested from it. The profile is editable; openers read it.

create table site_profiles (
  clerk_user_id text primary key references accounts (clerk_user_id) on delete cascade,
  -- The URL as read, after redirects, and its registrable domain.
  website       text not null,
  domain        text not null,
  -- SiteProfileFields (packages/shared/src/site-profile.ts).
  profile       jsonb not null,
  -- SuggestedSearch[]: { why, search } with a POST /v1/searches body.
  suggestions   jsonb not null default '[]',
  -- The page URLs that were read.
  pages         jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Every build attempt, read or not, for the per account daily limit.
create table site_profile_runs (
  id            bigserial primary key,
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  domain        text not null,
  created_at    timestamptz not null default now()
);

create index site_profile_runs_user_created_idx on site_profile_runs (clerk_user_id, created_at);

alter table site_profiles enable row level security;
alter table site_profile_runs enable row level security;
