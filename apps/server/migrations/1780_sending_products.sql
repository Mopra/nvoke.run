-- Sending for the owner's other products (docs/sending/plan.md, "Own
-- products"): a campaign can sell Day3 or exit1 instead of the account's own
-- site, opt-outs hold per sender, and mailboxes that share one provider
-- organization share its daily limit.

-- CampaignProduct (packages/shared/src/sending.ts). Null: the account's own
-- site profile and, for nvoke, its plans.
alter table campaigns add column product jsonb;

-- The sender an opt-out holds for: a product's domain ("day3.app"), or ''
-- for every campaign of the account. Bounces and the opt-outs of campaigns
-- without a product are ''.
alter table send_suppressions add column sender text not null default '' check (sender = lower(sender));
alter table send_suppressions drop constraint send_suppressions_pkey;
alter table send_suppressions add primary key (clerk_user_id, sender, hash);

-- Mailboxes in one provider organization (one Zoho org) count against the
-- organization's daily limit as well as their own daily_cap.
create table send_pools (
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  name          text not null,
  daily_cap     integer not null check (daily_cap between 1 and 5000),
  primary key (clerk_user_id, name)
);

alter table mailboxes add column pool text;
alter table mailboxes add constraint mailboxes_pool_fkey
  foreign key (clerk_user_id, pool) references send_pools (clerk_user_id, name);

create index mailboxes_pool_idx on mailboxes (clerk_user_id, pool) where pool is not null;

alter table send_pools enable row level security;
