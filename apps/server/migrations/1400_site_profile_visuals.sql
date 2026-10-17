-- Pictures on the site profile (docs/SPEC.md, "Site profile"): the site's
-- icon and share image, hotlinked, or a screenshot nvoke took when the site
-- has no share image.

alter table site_profiles
  add column icon_url  text,
  -- og:image, or the public URL of the account's site_shots row.
  add column image_url text;

-- Screenshots, served without auth at /site-shots/<token>.jpg: the token is
-- the only key, 32 random bytes, so the URL can sit in an <img>.
create table site_shots (
  token         text primary key,
  clerk_user_id text not null references accounts (clerk_user_id) on delete cascade,
  image         bytea not null,
  created_at    timestamptz not null default now()
);

create index site_shots_user_idx on site_shots (clerk_user_id);

alter table site_shots enable row level security;
