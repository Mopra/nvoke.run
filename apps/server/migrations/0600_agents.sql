-- API keys and agent sign-up (docs/SPEC.md, "API and agents").
--
-- RLS on with no policies, like every other table: only the server reads them.

-- Who made the account. An agent can create one with POST /v1/agents/signup;
-- the human behind the email claims it later. Human accounts count as claimed
-- from the start.
alter table accounts add column created_by text not null default 'human' check (created_by in ('human', 'agent'));
alter table accounts add column agent_name text;
-- Defaults to now() so ensureAccount() makes claimed human accounts; agent
-- sign-up inserts null.
alter table accounts add column claimed_at timestamptz default now();
update accounts set claimed_at = created_at;
alter table accounts add constraint accounts_claimed_check check (created_by = 'agent' or claimed_at is not null);
create index accounts_unclaimed_idx on accounts (created_at) where claimed_at is null;

-- API keys. key_hash is the sha256 of the key; the key itself is never stored.
create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  name          text not null check (length(name) between 1 and 60),
  key_hash      text not null unique,
  prefix        text not null,
  origin        text not null default 'user' check (origin in ('user', 'agent_signup')),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index api_keys_user_idx on api_keys (clerk_user_id) where revoked_at is null;

alter table api_keys enable row level security;

-- One row per agent sign-up, for the rate limits. ip_hash is a sha256 of the
-- caller's IP, never the IP. Purged after 30 days.
create table agent_signups (
  id            bigint generated always as identity primary key,
  ip_hash       text not null,
  email_domain  text not null,
  clerk_user_id text,
  created_at    timestamptz not null default now()
);

create index agent_signups_created_idx on agent_signups (created_at);
create index agent_signups_ip_idx on agent_signups (ip_hash, created_at);
create index agent_signups_domain_idx on agent_signups (email_domain, created_at);

alter table agent_signups enable row level security;
