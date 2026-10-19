BEGIN;
ALTER TABLE challenge_instances ADD COLUMN resume_automatic INTEGER NOT NULL DEFAULT 0 CHECK(resume_automatic IN (0,1));
CREATE TABLE admin_programs (
 id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('target','challenge')),
 starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,shift_starts_at TEXT NOT NULL,
 payload_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,cancelled_at TEXT,
 CHECK(ends_at>starts_at)
);
CREATE INDEX admin_programs_period ON admin_programs(starts_at,ends_at);
CREATE TABLE admin_program_receipts (
 program_id INTEGER NOT NULL REFERENCES admin_programs(id),run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 started_at TEXT NOT NULL,finished_at TEXT,baseline_target INTEGER,instance_id INTEGER REFERENCES challenge_instances(id),
 PRIMARY KEY(program_id,run_id)
);
COMMIT;
