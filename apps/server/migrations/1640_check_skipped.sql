-- Checks spent on the addresses people buy nvoke for (docs/SPEC.md,
-- pipeline step 4, leads/check-policy.ts). An address left unchecked on
-- purpose keeps verification null (hidden and never charged) and says why
-- here, so the search and the company's lead count it as settled:
-- role_inbox (info@, checked only when the search asks for it), off_target
-- (HR, support, bookkeeping and the like, once a decision maker or
-- commercial person is valid), unnamed (max@, once a named person is valid).
alter table emails
  add column skipped text check (skipped in ('role_inbox', 'off_target', 'unnamed'));
