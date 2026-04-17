ALTER TABLE functions
  ADD COLUMN dependencies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN bundled_code text,
  ADD COLUMN build_status text,
  ADD COLUMN build_error  text,
  ADD COLUMN built_at     timestamptz;
