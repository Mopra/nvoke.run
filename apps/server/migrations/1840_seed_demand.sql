-- The seed crawls what users search for first (docs/research/company-seed.md,
-- "Demand"). score is how well a queued domain's name and TLD match the
-- Sonar plans of the last 30 days (seed/demand.ts); 0 when nothing matches,
-- and the list's rank breaks ties as before.
alter table seed_domains add column score real not null default 0;

drop index seed_domains_queue_idx;
create index seed_domains_queue_idx on seed_domains (score desc, rank, domain) where status = 'queued';
