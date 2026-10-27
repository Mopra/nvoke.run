-- Why Claude did not write a lead ('failed' with skip_reason 'write_failed'
-- or 'too_similar'), shown on the lead and the campaign. Cleared on retry.
alter table campaign_leads add column write_error text;
