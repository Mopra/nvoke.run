-- migrate: no transaction
--
-- A second look at settled unknowns (apps/server/src/leads/verify/recheck.ts).
-- An address that ended unknown was already paid for (found, crawled,
-- scored), so a worker tick asks it again hours later, a few times at most.
-- unknown_rechecks counts those looks, rechecked_at is the last one; a look
-- that reaches a verdict also sets verification and checked_at as usual.
--
-- emails is live and large, so the runner (src/db/migrations.ts) runs this
-- file statement by statement outside a transaction and the index is built
-- concurrently, like 1721_company_index_backfill. Safe to run again: the
-- columns are added only when missing, and an index a failed concurrent
-- build left invalid is dropped and built again.

set lock_timeout = '5s';

alter table emails
  add column if not exists unknown_rechecks smallint not null default 0,
  add column if not exists rechecked_at timestamptz;

drop index concurrently if exists emails_unknown_recheck_idx;
create index concurrently emails_unknown_recheck_idx on emails (created_at) where verification = 'unknown';
