-- Operator alerts and paused sources (docs/SPEC.md, "Source costs").
--
-- alerts_sent remembers when each alert key last went out, so an alert is
-- emailed at most once per its interval however many workers hit it.
-- source_pauses marks a paid source as refusing us (spend limit, billing,
-- revoked key). New searches of that kind are refused until `until`, then the
-- next search tries the source again.

create table alerts_sent (
  key     text primary key,
  sent_at timestamptz not null
);

create table source_pauses (
  source    text primary key,
  reason    text not null,
  paused_at timestamptz not null default now(),
  until     timestamptz not null
);

alter table alerts_sent   enable row level security;
alter table source_pauses enable row level security;
