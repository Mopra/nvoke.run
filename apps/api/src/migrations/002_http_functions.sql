ALTER TABLE functions
  ADD COLUMN slug text UNIQUE,
  ADD COLUMN access_mode text NOT NULL DEFAULT 'api_key'
    CHECK (access_mode IN ('public','api_key')),
  ADD COLUMN enabled boolean NOT NULL DEFAULT true;

CREATE TABLE function_http_methods (
  function_id uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  method      text NOT NULL,
  PRIMARY KEY (function_id, method),
  CHECK (method IN ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'))
);

INSERT INTO function_http_methods (function_id, method)
SELECT id, 'POST' FROM functions
ON CONFLICT DO NOTHING;

ALTER TABLE invocations
  ADD COLUMN trigger_kind text NOT NULL DEFAULT 'editor'
    CHECK (trigger_kind IN ('editor','http')),
  ADD COLUMN request_method       text,
  ADD COLUMN request_path         text,
  ADD COLUMN request_headers      jsonb,
  ADD COLUMN response_status      integer,
  ADD COLUMN response_headers     jsonb,
  ADD COLUMN response_body_preview text;
