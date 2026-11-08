-- Fulfilment: what nvoke does by itself when a lead says yes to the
-- campaign's offer (sending/fulfil.ts). `buyer_list`: a search for the
-- market the first email named, then a reply in the thread with the list as
-- a CSV. Null: a reply only ends the sequence.
alter table campaigns add column fulfil text check (fulfil in ('buyer_list'));

-- One per campaign lead, so a yes is fulfilled once however often the
-- poller or the job runs. state: pending (a reply waits for Claude to read
-- it), declined (not a yes; a later reply makes it pending again),
-- searching, sending (the reply is claimed: never sent twice), sent, failed
-- (error says why).
create table fulfilments (
  id               uuid primary key default gen_random_uuid(),
  campaign_lead_id uuid not null unique references campaign_leads (id) on delete cascade,
  campaign_id      uuid not null references campaigns (id) on delete cascade,
  clerk_user_id    text not null references accounts (clerk_user_id) on delete cascade,
  kind             text not null default 'buyer_list' check (kind in ('buyer_list')),
  state            text not null default 'pending'
                   check (state in ('pending', 'declined', 'searching', 'sending', 'sent', 'failed')),
  -- The reply that asked for it.
  reply_id         uuid references messages (id) on delete set null,
  -- The search Claude worked out from the thread (a CreateSearchRequest), and the one it started.
  params           jsonb,
  search_id        uuid references searches (id) on delete set null,
  -- Who the list is of, in plain words, as the reply email names them.
  market           text,
  -- People in the list that went out.
  people           integer,
  -- The reply nvoke sent.
  message_id       uuid references messages (id) on delete set null,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index fulfilments_campaign_idx on fulfilments (campaign_id);

alter table jobs drop constraint jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('find', 'crawl', 'verify', 'opener', 'people', 'write', 'fit', 'fulfil'));
