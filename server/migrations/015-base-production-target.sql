BEGIN;
-- Versioned defaults apply at shift boundaries; catch-up keeps each period's rule.
CREATE TABLE production_target_defaults (
  id INTEGER PRIMARY KEY,
  target INTEGER NOT NULL CHECK(target BETWEEN 1 AND 1000000),
  effective_from TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
INSERT INTO production_target_defaults(target,effective_from,created_at)
VALUES (15000,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z');
COMMIT;
