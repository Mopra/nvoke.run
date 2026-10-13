-- Webhooks (docs/SPEC.md, "Webhooks").
--
-- A webhook is a user's URL that gets lead.ready and search.finished events.
-- Each event becomes one row in webhook_deliveries per matching webhook,
-- written in the same transaction as the change that caused it. The worker
-- sends due rows and retries on a schedule.
--
-- A delivery holds ids only. The payload is built from the current data at
-- send time, so a deleted search or an opt-out also stops what is queued, and
-- no address is ever copied here. Deliveries go 30 days after created_at.

create table webhooks (
  id              uuid primary key default gen_random_uuid(),
  clerk_user_id   text not null references accounts (clerk_user_id) on delete cascade,
  url             text not null,
  -- whsec_ plus base64. Kept as is: we need it to sign every request.
  secret          text not null,
  events          text[] not null,
  -- all | drops
  scope           text not null default 'all' check (scope in ('all', 'drops')),
  -- Narrowed to one drop. Deleting the drop deletes the webhook, so it never widens on its own.
  drop_id         uuid references drops (id) on delete cascade,
  enabled         boolean not null default true,
  -- failing: we turned it off. Null while enabled or paused by the user.
  disabled_reason text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);

create index webhooks_user_idx on webhooks (clerk_user_id, created_at desc);

create table webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references webhooks (id) on delete cascade,
  -- lead.ready | search.finished
  event           text not null,
  search_id       uuid not null references searches (id) on delete cascade,
  -- lead.ready only.
  company_id      uuid references companies (id) on delete cascade,
  -- pending | delivered | failed | skipped
  status          text not null default 'pending'
                  check (status in ('pending', 'delivered', 'failed', 'skipped')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  -- A sender holds the row until then; a crashed sender's rows come back.
  locked_until    timestamptz,
  last_status     integer,
  last_error      text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  unique nulls not distinct (webhook_id, event, search_id, company_id)
);

create index webhook_deliveries_due_idx on webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_webhook_idx on webhook_deliveries (webhook_id, created_at desc);
create index webhook_deliveries_created_idx on webhook_deliveries (created_at);
create index webhook_deliveries_company_idx on webhook_deliveries (company_id) where company_id is not null;
create index webhook_deliveries_search_idx on webhook_deliveries (search_id);

alter table webhooks           enable row level security;
alter table webhook_deliveries enable row level security;
