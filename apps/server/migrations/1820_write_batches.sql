-- Full write batches (docs/sending/plan.md, "Writing"): an enrolled lead
-- waits in 'writing' until its campaign has WRITE_BATCH of them or the
-- oldest has waited WRITE_WAIT_MS, and is then queued in one write job.
-- write_queued_at says it is in a job; null, it is still waiting.
alter table campaign_leads add column write_queued_at timestamptz;

-- Leads writing now were queued when they were enrolled.
update campaign_leads set write_queued_at = created_at where status = 'writing';

create index campaign_leads_write_wait_idx on campaign_leads (created_at)
  where status = 'writing' and write_queued_at is null;
