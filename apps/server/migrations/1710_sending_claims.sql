-- A send is claimed before it goes out (sending/sender.ts): the lead gets
-- claimed_at and loses next_send_at, its messages row is written with the
-- Message-ID, and only then does SMTP run, outside any transaction. The
-- confirm clears claimed_at. A claim still open after 10 minutes may or may
-- not have gone out, so it is never sent again: the lead turns 'failed' with
-- skip_reason 'unconfirmed' for the user to look at.
alter table campaign_leads add column claimed_at timestamptz;

create index campaign_leads_claimed_idx on campaign_leads (claimed_at) where claimed_at is not null;
