BEGIN;
CREATE TABLE run_runtime (
 run_id INTEGER PRIMARY KEY REFERENCES simulation_runs(id),
 wall_anchor TEXT NOT NULL, simulated_anchor TEXT NOT NULL
);
ALTER TABLE manager_targets ADD COLUMN run_scope INTEGER REFERENCES simulation_runs(id);
CREATE UNIQUE INDEX record_identity ON records(run_id,kind,comparability_key);
CREATE INDEX interval_time ON production_intervals(starts_at,ends_at);
CREATE INDEX stop_run_time ON stoppages(run_id,starts_at,ends_at);
COMMIT;
