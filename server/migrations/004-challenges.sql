BEGIN;
ALTER TABLE manager_challenge_assignments ADD COLUMN run_scope INTEGER REFERENCES simulation_runs(id);
ALTER TABLE challenge_instances ADD COLUMN source TEXT NOT NULL DEFAULT 'automatic' CHECK(source IN ('automatic','manager'));
ALTER TABLE challenge_instances ADD COLUMN achieved_at TEXT;
ALTER TABLE challenge_instances ADD COLUMN held_reason TEXT;
CREATE UNIQUE INDEX challenge_instance_identity ON challenge_instances(run_id,shift_id,definition_id,starts_at);
CREATE TABLE challenge_reviews (
 instance_id INTEGER PRIMARY KEY REFERENCES challenge_instances(id),
 approved INTEGER NOT NULL CHECK(approved IN (0,1)),
 note TEXT NOT NULL, reviewed_by INTEGER NOT NULL REFERENCES manager_accounts(id), reviewed_at TEXT NOT NULL
);
CREATE INDEX challenge_shift ON challenge_instances(run_id,shift_id,ends_at);
CREATE INDEX challenge_shift_lookup ON challenge_instances(shift_id);
COMMIT;
