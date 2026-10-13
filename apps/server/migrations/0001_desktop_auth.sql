-- Desktop sign-in through the system browser. See "Desktop sign-in" in CLAUDE.md.
--
-- Both tables hold credentials, so only hashes are stored and RLS is enabled
-- with no policies: the Supabase REST API (anon and authenticated roles) can
-- read nothing, while the server connects as postgres and bypasses RLS.

-- One-time codes minted by POST /v1/desktop/authorize and redeemed once by
-- POST /v1/desktop/token. Short lived (5 minutes) and bound to the PKCE challenge.
create table public.desktop_auth_codes (
  id             bigint generated always as identity primary key,
  code_hash      text not null unique,
  clerk_user_id  text not null,
  code_challenge text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz
);

create index desktop_auth_codes_expires_at_idx on public.desktop_auth_codes (expires_at);

alter table public.desktop_auth_codes enable row level security;

-- Long lived device tokens held by the desktop app. token_hash is the sha256
-- of the opaque token; the token itself is never stored.
create table public.device_sessions (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  clerk_user_id text not null,
  device_name   text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  revoked_at    timestamptz
);

create index device_sessions_clerk_user_id_idx on public.device_sessions (clerk_user_id);

alter table public.device_sessions enable row level security;
