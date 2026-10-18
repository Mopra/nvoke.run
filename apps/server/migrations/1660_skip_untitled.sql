-- A named person with no title is checked only when the company has no
-- valid decision maker or commercial person, and skipped otherwise
-- (apps/server/src/leads/check-policy.ts).
alter table emails drop constraint emails_skipped_check;
alter table emails add constraint emails_skipped_check
  check (skipped in ('role_inbox', 'off_target', 'unnamed', 'untitled'));
