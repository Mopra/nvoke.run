CREATE TABLE function_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id    uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  code           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (function_id, version_number)
);
CREATE INDEX function_versions_function_id_idx
  ON function_versions(function_id, version_number DESC);

ALTER TABLE functions
  ADD COLUMN current_version_id uuid REFERENCES function_versions(id);

ALTER TABLE invocations
  ADD COLUMN function_version_id uuid REFERENCES function_versions(id) ON DELETE SET NULL;

INSERT INTO function_versions (function_id, version_number, code, created_at)
SELECT id, 1, code, created_at FROM functions;

UPDATE functions f
   SET current_version_id = v.id
  FROM function_versions v
 WHERE v.function_id = f.id AND v.version_number = 1;
