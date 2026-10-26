-- Your own Claude key (docs/SPEC.md, "Your own Claude key"). An account may
-- run its Claude calls on its own Anthropic API key. The key is sealed with
-- SECRETS_KEY (src/crypto/secrets.ts) and never leaves the server again.

create table ai_keys (
  clerk_user_id text primary key references accounts (clerk_user_id) on delete cascade,
  provider      text not null default 'anthropic' check (provider in ('anthropic')),
  sealed_key    text not null,
  key_last4     text not null,
  bulk_model    text not null,
  quality_model text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table ai_keys enable row level security;

-- Calls on the account's own key are billed by Anthropic, so they never count
-- against the monthly budget on ours (src/ai/usage.ts).
alter table ai_usage add column own_key boolean not null default false;
