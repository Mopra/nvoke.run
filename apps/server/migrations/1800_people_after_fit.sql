-- People's Claude read after fit (docs/SPEC.md, "Describe your customer").
-- A plain words company whose people pages name people the rules could not
-- read keeps those pages here while it waits for fit's second look; Claude
-- reads them only when fit keeps the company, and the column is cleared
-- then. Null: nothing to read, or read already.

alter table companies add column people_texts jsonb;
