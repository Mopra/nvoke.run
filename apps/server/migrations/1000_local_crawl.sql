-- Local render crawl (docs/SPEC.md, "Local render crawl").
--
-- The server crawl now tells two more outcomes apart: `refused` (the site
-- refuses our servers: 401, 403, 429, 503 or a bot challenge) and `js_only`
-- (nothing found, and the homepage is a JavaScript app shell). The desktop
-- app can claim such companies from the user's own searches, read them in a
-- hidden browser window on the user's computer and send back the addresses.
-- The claim is a lease; results never touch the shared cache.

alter table companies drop constraint companies_crawl_status_check;
alter table companies add constraint companies_crawl_status_check
  check (crawl_status in ('pending', 'done', 'failed', 'blocked', 'refused', 'js_only'));

alter table domains drop constraint domains_crawl_status_check;
alter table domains add constraint domains_crawl_status_check
  check (crawl_status in ('done', 'failed', 'blocked', 'refused', 'js_only'));

alter table companies
  -- null until the desktop claims it, then claimed, done, failed or blocked.
  add column local_crawl text check (local_crawl in ('claimed', 'done', 'failed', 'blocked')),
  -- A claim is held until then; after it the company may be claimed again.
  add column local_claimed_until timestamptz,
  add column local_attempts int not null default 0,
  add column local_crawled_at timestamptz;

-- Claims look for a user's refused and JS-only companies without a local result.
create index companies_local_crawl_idx on companies (clerk_user_id, created_at desc)
  where crawl_status in ('refused', 'js_only') and (local_crawl is null or local_crawl = 'claimed');
