CREATE TABLE function_secrets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  value_ct    bytea NOT NULL,
  preview     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (function_id, name)
);
CREATE INDEX function_secrets_function_id_idx ON function_secrets(function_id);
