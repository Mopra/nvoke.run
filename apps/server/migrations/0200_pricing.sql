-- One plan for everyone, priced by verified emails (docs/SPEC.md, "Plans").
--
-- Plan keys are the Clerk Billing plan slugs from packages/shared/src/plans.ts.
-- The meter counts addresses whose check came back valid, once per user and
-- address for all time: billed_emails remembers every address a user has been
-- charged for, so finding it again is free.

alter table accounts drop constraint accounts_plan_check;
update accounts set plan = case plan
  when 'pro' then 'emails_2500'
  when 'business' then 'emails_20000'
  else 'free'
end;
alter table accounts alter column plan set default 'free';
alter table accounts add constraint accounts_plan_check check (plan in (
  'free', 'emails_1000', 'emails_2500', 'emails_7500', 'emails_20000', 'emails_50000', 'emails_100000'
));
-- When the plan was last read from Clerk Billing. Null means never.
alter table accounts add column plan_synced_at timestamptz;

-- The old meter counted every stored address. Start the new one from zero.
alter table usage rename column emails_found to emails_verified;
update usage set emails_verified = 0;

create table billed_emails (
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  address       text not null check (address = lower(address)),
  period        text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  billed_at     timestamptz not null default now(),
  primary key (clerk_user_id, address)
);

alter table billed_emails enable row level security;
