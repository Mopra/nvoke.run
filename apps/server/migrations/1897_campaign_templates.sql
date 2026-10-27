-- Template campaigns: every lead gets the steps' fixed text with merge
-- variables, no Claude call (writer 'template'). signed false leaves the
-- mailbox signature out from under the text; the footer lines stay.
alter table campaigns
  add column writer text not null default 'claude' check (writer in ('claude', 'template')),
  add column signed boolean not null default true;
