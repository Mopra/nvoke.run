-- A second look at settled unknowns (apps/server/src/leads/verify/recheck.ts).
-- An address that ended unknown was already paid for (found, crawled,
-- scored), so a worker tick asks it again hours later, a few times at most.
-- unknown_rechecks counts those looks, rechecked_at is the last one; a look
-- that reaches a verdict also sets verification and checked_at as usual.

alter table emails
  add column unknown_rechecks smallint not null default 0,
  add column rechecked_at timestamptz;

create index emails_unknown_recheck_idx on emails (created_at) where verification = 'unknown';
