-- Search kind domains (docs/SPEC.md, "Search kinds"): a list of domains or
-- company names the user already has. Its params hold the list itself.

alter table searches drop constraint searches_kind_check;
alter table searches add constraint searches_kind_check check (kind in ('local', 'web', 'launches', 'domains', 'drop'));
