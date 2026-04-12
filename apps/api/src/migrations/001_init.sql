CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id   text UNIQUE NOT NULL,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE functions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  code       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX functions_user_id_idx ON functions(user_id);

CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  prefix       text NOT NULL,
  key_hash     text UNIQUE NOT NULL,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_user_id_idx ON api_keys(user_id);

CREATE TABLE invocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id   uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source        text NOT NULL CHECK (source IN ('ui','api')),
  input         jsonb NOT NULL,
  output        jsonb,
  logs          text[],
  status        text NOT NULL CHECK (status IN ('success','error','timeout')),
  duration_ms   integer NOT NULL,
  error_message text,
  started_at    timestamptz NOT NULL,
  completed_at  timestamptz
);
CREATE INDEX invocations_function_id_started_at_idx
  ON invocations(function_id, started_at DESC);
