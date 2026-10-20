-- Sending (docs/sending/plan.md): mailboxes the user connects, campaigns
-- with written sequences, the messages sent and received, and per sender
-- opt-outs. Mail leaves through the mailbox provider's own submission
-- server, never from our IPs. Secrets (passwords, tokens) are sealed with
-- SECRETS_KEY (src/crypto/secrets.ts) before they reach this table.

create table mailboxes (
  id              uuid primary key default gen_random_uuid(),
  clerk_user_id   text not null references accounts (clerk_user_id) on delete cascade,
  address         text not null check (address = lower(address)),
  display_name    text not null,
  provider        text not null check (provider in ('smtp', 'google', 'microsoft')),
  source          text not null default 'connected' check (source in ('connected', 'provided')),
  smtp_host       text not null,
  smtp_port       integer not null check (smtp_port between 1 and 65535),
  -- true: TLS from the first byte (465). false: STARTTLS, required (587).
  smtp_secure     boolean not null,
  imap_host       text not null,
  imap_port       integer not null check (imap_port between 1 and 65535),
  username        text not null,
  -- Sealed password, or sealed OAuth tokens from step 2.
  secret          text not null,
  daily_cap       smallint not null default 30 check (daily_cap between 1 and 50),
  -- false: new or cold, sends ramp up from 5 a day (capacityToday).
  warm            boolean not null default false,
  ramp_started_at timestamptz not null default now(),
  status          text not null default 'checking'
                  check (status in ('checking', 'active', 'paused', 'error', 'disconnected')),
  -- Plain words the user can act on, shown next to the status.
  status_reason   text,
  signature       text not null default '',
  last_send_at    timestamptz,
  last_poll_at    timestamptz,
  -- IMAP position per folder: { "INBOX": { "uidValidity": 1, "lastUid": 42 } }.
  poll_state      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (clerk_user_id, address)
);

create table campaigns (
  id            uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  name          text not null,
  status        text not null default 'draft'
                check (status in ('draft', 'writing', 'review', 'scheduled', 'sending', 'paused', 'done', 'canceled')),
  -- list: the leads given at create. search: every new valid address an
  -- (ongoing) search adds. drop: every search the drop makes.
  source        text not null default 'list' check (source in ('list', 'search', 'drop')),
  search_id     uuid references searches (id) on delete set null,
  drop_id       uuid references drops (id) on delete set null,
  -- Autopilot (plan.md, "Autopilot"): new leads from the source are
  -- enrolled, written and scheduled after the one start.
  autopilot     boolean not null default false,
  people_only   boolean not null default true,
  allow_catch_all boolean not null default false,
  per_company   smallint not null default 1 check (per_company between 1 and 5),
  daily_new     integer not null default 30 check (daily_new between 1 and 500),
  hold_hours    smallint not null default 2 check (hold_hours between 0 and 72),
  -- [{ "waitDays": 0, "brief": "..." }, ...], 1 to 4 steps.
  steps         jsonb not null,
  -- { "days": [1,2,3,4,5], "startHour": 9, "endHour": 17 }, recipient local time.
  schedule      jsonb not null,
  review_until  timestamptz,
  leads         integer not null default 0,
  sent          integer not null default 0,
  replied       integer not null default 0,
  bounced       integer not null default 0,
  opted_out     integer not null default 0,
  -- When the enroll tick last looked at the source.
  enrolled_at   timestamptz,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  check (source <> 'search' or search_id is not null or status in ('done', 'canceled')),
  check (source <> 'drop' or drop_id is not null or status in ('done', 'canceled'))
);

create index campaigns_user_idx on campaigns (clerk_user_id, created_at desc);
create index campaigns_autopilot_idx on campaigns (enrolled_at) where autopilot and status in ('scheduled', 'sending');

create table campaign_mailboxes (
  campaign_id uuid not null references campaigns (id) on delete cascade,
  mailbox_id  uuid not null references mailboxes (id) on delete cascade,
  primary key (campaign_id, mailbox_id)
);

create table campaign_leads (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns (id) on delete cascade,
  clerk_user_id     text not null references accounts (clerk_user_id) on delete cascade,
  -- The lead's emails row. Set null when retention drops the search; the
  -- address, names and company stay copied here for the thread.
  email_id          uuid references emails (id) on delete set null,
  company_id        uuid references companies (id) on delete set null,
  address           text not null check (address = lower(address)),
  first_name        text,
  last_name         text,
  title             text,
  company_name      text not null,
  domain            text not null,
  -- ISO 3166 alpha-2 when known (gate.ts), for the gate and the timezone.
  country           text,
  -- IANA zone the schedule runs in.
  timezone          text not null default 'UTC',
  -- Sticky at enroll, so the whole thread leaves one mailbox.
  mailbox_id        uuid references mailboxes (id) on delete set null,
  status            text not null default 'queued'
                    check (status in ('writing', 'queued', 'active', 'replied', 'bounced', 'opted_out', 'failed', 'done', 'skipped', 'stopped')),
  skip_reason       text,
  -- 1-based step that goes out next.
  next_step         smallint not null default 1,
  next_send_at      timestamptz,
  thread_message_id text,
  written_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (campaign_id, address)
);

create index campaign_leads_due_idx on campaign_leads (next_send_at) where status in ('queued', 'active');
create index campaign_leads_user_address_idx on campaign_leads (clerk_user_id, address);
create index campaign_leads_email_idx on campaign_leads (email_id);

-- The emails Claude wrote, one row per lead per step, editable until sent.
create table campaign_steps_written (
  campaign_lead_id uuid not null references campaign_leads (id) on delete cascade,
  step             smallint not null check (step between 1 and 4),
  subject          text not null,
  body             text not null,
  edited           boolean not null default false,
  created_at       timestamptz not null default now(),
  primary key (campaign_lead_id, step)
);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  clerk_user_id    text not null references accounts (clerk_user_id) on delete cascade,
  mailbox_id       uuid references mailboxes (id) on delete set null,
  campaign_id      uuid references campaigns (id) on delete set null,
  campaign_lead_id uuid references campaign_leads (id) on delete set null,
  direction        text not null check (direction in ('out', 'in')),
  kind             text not null check (kind in ('step', 'reply', 'auto_reply', 'bounce', 'other')),
  message_id       text,
  in_reply_to      text,
  subject          text not null default '',
  from_address     text not null,
  to_address       text not null,
  -- Replies only; outgoing bodies live in campaign_steps_written.
  body_text        text,
  step             smallint,
  smtp_response    text,
  -- in: 'unread' until the user opens it in Replies.
  read_at          timestamptz,
  at               timestamptz not null default now()
);

create index messages_message_id_idx on messages (message_id);
create index messages_user_in_idx on messages (clerk_user_id, at desc) where direction = 'in';
create index messages_mailbox_out_idx on messages (mailbox_id, at) where direction = 'out';

-- Per sender opt-outs. An objection to one sender does not erase the lead
-- from other users (suppress() in src/leads/suppression.ts does that, for
-- the global opt-out page).
create table send_suppressions (
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  -- sha256 of the lowercase address, as in suppression.ts.
  hash          text not null,
  reason        text not null check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  created_at    timestamptz not null default now(),
  primary key (clerk_user_id, hash)
);

-- Sends a month, the meter for the send allowance.
create table send_usage (
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  period        text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  sent          integer not null default 0 check (sent >= 0),
  primary key (clerk_user_id, period)
);

alter table jobs drop constraint jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('find', 'crawl', 'verify', 'opener', 'people', 'write'));

alter table mailboxes enable row level security;
alter table campaigns enable row level security;
alter table campaign_mailboxes enable row level security;
alter table campaign_leads enable row level security;
alter table campaign_steps_written enable row level security;
alter table messages enable row level security;
alter table send_suppressions enable row level security;
alter table send_usage enable row level security;
