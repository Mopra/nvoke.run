-- When a company or email of the search was last edited or deleted through
-- the API, so clients that keep a copy (the desktop app) fetch it again.
alter table searches add column edited_at timestamptz;
