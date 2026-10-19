BEGIN;
-- Existing shifts retain their original trajectory, including partial minutes.
ALTER TABLE shifts ADD COLUMN production_model_version INTEGER NOT NULL DEFAULT 1 CHECK(production_model_version IN (1,2));
COMMIT;
