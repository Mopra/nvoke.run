-- Ongoing searches (docs/SPEC.md, "Describe your customer"): the paid Brave
-- requests their daily rounds reserved per UTC day, so the global daily cap
-- is one row read and an atomic add, never a scan of every search's runs.
-- A round that does not start gives its reservation back.
create table ongoing_budget (
  day      date primary key,
  reserved integer not null default 0 check (reserved >= 0)
);

alter table ongoing_budget enable row level security;
