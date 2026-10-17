-- Jobs of one type run highest priority first, then oldest first. Checks of
-- named decision makers go before role inboxes, so a search's first hour
-- of SMTP sessions is spent on the leads people buy nvoke for.
alter table jobs add column priority smallint not null default 0;

create index jobs_claim_priority_idx on jobs (type, priority desc, run_after, id) where status = 'queued';
