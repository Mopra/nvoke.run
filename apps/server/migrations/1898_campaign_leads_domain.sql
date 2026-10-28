-- Enroll skips a company another campaign of the same sender wrote to
-- (sending/enroll.ts), looked up by the user and the company's domain.
create index if not exists campaign_leads_user_domain_idx on campaign_leads (clerk_user_id, domain);
