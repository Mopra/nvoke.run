-- Named only campaigns: write.ts skips a lead it cannot greet by first name
-- (skip_reason 'no_name') instead of writing a nameless opener.
alter table campaigns add column named_only boolean not null default false;
