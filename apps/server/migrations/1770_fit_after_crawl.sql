-- Fit after the crawl (docs/SPEC.md, "Describe your customer"). A plain
-- words company passes a first look from its search result ('gate'), is
-- crawled, and when the crawl found anything that could be checked it waits
-- for the fit job ('pending'): no check or people job runs before it is
-- kept ('kept'). One turned down is deleted, like a candidate the first look
-- turns down is never stored. Null: other kinds, and rows from before.

alter table companies
  add column fit_state text check (fit_state in ('gate', 'pending', 'kept'));

create index companies_fit_pending on companies (search_id) where fit_state = 'pending';

alter table jobs drop constraint jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('find', 'crawl', 'verify', 'opener', 'people', 'write', 'fit'));
