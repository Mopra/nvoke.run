-- Role inboxes (info@, sales@) are not checked unless the search asks for
-- it: they stay unchecked, hidden and free (emails.skipped = 'role_inbox').
-- A later switch in the apps sets this and queues their checks again.
alter table searches
  add column check_inboxes boolean not null default false;
