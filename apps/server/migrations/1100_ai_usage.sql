-- Claude calls (docs/SPEC.md, "Claude"). One row per call to the Anthropic
-- API, with the tokens and what they cost, so spend can be logged per user
-- and capped per account each calendar month (src/ai/usage.ts). Holds no
-- prompt or response text.

create table ai_usage (
  id                 bigserial primary key,
  clerk_user_id      text not null references accounts (clerk_user_id) on delete cascade,
  -- What the call was for, for example "site-profile" or "opener".
  task               text not null,
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(12, 6) not null,
  created_at         timestamptz not null default now()
);

create index ai_usage_user_created_idx on ai_usage (clerk_user_id, created_at);

alter table ai_usage enable row level security;
