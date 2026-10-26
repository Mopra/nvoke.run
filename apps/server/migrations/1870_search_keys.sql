-- Your own search key (docs/SPEC.md, "Your own search key"). An account may
-- run its paid web searches on its own Serper or Brave key. The key is sealed
-- with SECRETS_KEY (src/crypto/secrets.ts) and never leaves the server again.

create table search_keys (
  clerk_user_id text primary key references accounts (clerk_user_id) on delete cascade,
  provider      text not null check (provider in ('serper', 'brave')),
  sealed_key    text not null,
  key_last4     text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table search_keys enable row level security;
