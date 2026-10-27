-- SPF, DKIM and DMARC of a mailbox's domain, read on every mailbox check
-- (the same DNS checker as POST /v1/tools/email-auth). Shown, never blocking.
alter table mailboxes
  add column email_auth jsonb,
  add column email_auth_at timestamptz;
