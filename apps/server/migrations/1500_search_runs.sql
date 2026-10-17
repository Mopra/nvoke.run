-- A search grows over several runs (docs/SPEC.md, "Pipeline per search"):
-- a finished search runs again with new params of its kind and adds the
-- companies it does not hold yet. `params` and `limit` stay the latest
-- run's, which the find job reads; `runs` keeps every run in order as
-- { params, limit, foundBefore, createdAt }. A drop's searches keep none.
alter table searches add column runs jsonb not null default '[]'::jsonb;

update searches
set runs = jsonb_build_array(jsonb_build_object(
  'params', params, 'limit', "limit", 'foundBefore', 0, 'createdAt', created_at
))
where kind <> 'drop';
