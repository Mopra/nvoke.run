ALTER TABLE daily_quotas
  ADD COLUMN IF NOT EXISTS overage_count integer NOT NULL DEFAULT 0;
