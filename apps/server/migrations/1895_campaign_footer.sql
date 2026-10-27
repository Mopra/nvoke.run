-- A campaign's own footer line, in place of nvoke's "why you" and opt-out
-- lines (footer.ts). Null: nvoke's lines, in the language of the email.
alter table campaigns add column footer text;
