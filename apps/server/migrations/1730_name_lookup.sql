-- Company names looked up before a paid web search
-- (apps/server/src/leads/sources/resolve-name.ts): a name a past search
-- found is matched on lower(name), so the lookup reads an index instead of
-- every company row.
create index companies_name_lower_idx on companies (lower(name));
