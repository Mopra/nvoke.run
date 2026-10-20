-- New ladder (packages/shared/src/plans.ts): 1,000 for $9 up to 60,000 for
-- $199. Removed plans move to the nearest new one at or above them.

alter table accounts drop constraint accounts_plan_check;
update accounts set plan = case plan
  when 'emails_7500' then 'emails_10000'
  when 'emails_20000' then 'emails_25000'
  when 'emails_50000' then 'emails_60000'
  when 'emails_100000' then 'emails_60000'
  else plan
end;
alter table accounts add constraint accounts_plan_check check (plan in (
  'free', 'emails_1000', 'emails_2500', 'emails_10000', 'emails_25000', 'emails_60000'
));
