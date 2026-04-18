ALTER TABLE invocations DROP CONSTRAINT IF EXISTS invocations_trigger_kind_check;
ALTER TABLE invocations ADD CONSTRAINT invocations_trigger_kind_check
  CHECK (trigger_kind IN ('editor','http','scheduled'));

CREATE TABLE schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id       uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  cron_expression   text NOT NULL,
  timezone          text NOT NULL DEFAULT 'UTC',
  request_method    text NOT NULL DEFAULT 'POST'
    CHECK (request_method IN ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS')),
  request_headers   jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_body      text,
  enabled           boolean NOT NULL DEFAULT true,
  next_run_at       timestamptz,
  last_run_at       timestamptz,
  last_run_status   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX schedules_due_idx
  ON schedules (next_run_at)
  WHERE enabled = true;

CREATE INDEX schedules_function_idx
  ON schedules (function_id);

CREATE TABLE trigger_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id    uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id    uuid REFERENCES schedules(id) ON DELETE SET NULL,
  invocation_id  uuid REFERENCES invocations(id) ON DELETE SET NULL,
  kind           text NOT NULL
    CHECK (kind IN (
      'schedule_fired',
      'schedule_skipped',
      'schedule_error',
      'webhook_received',
      'webhook_rejected'
    )),
  outcome        text NOT NULL CHECK (outcome IN ('ok','error')),
  message        text,
  details        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trigger_events_function_idx
  ON trigger_events (function_id, created_at DESC);

ALTER TABLE functions
  ADD COLUMN webhook_verify_kind text NOT NULL DEFAULT 'none'
    CHECK (webhook_verify_kind IN ('none','stripe','github','hmac_sha256')),
  ADD COLUMN webhook_secret_ct bytea,
  ADD COLUMN webhook_secret_preview text,
  ADD COLUMN webhook_signature_header text;
