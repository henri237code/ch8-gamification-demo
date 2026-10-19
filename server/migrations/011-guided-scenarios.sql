BEGIN;
CREATE TABLE run_team_config (
 run_id INTEGER PRIMARY KEY REFERENCES simulation_runs(id),
 rotation_offset INTEGER NOT NULL CHECK(rotation_offset BETWEEN 0 AND 2),
 favored_team_id INTEGER NOT NULL REFERENCES teams(id)
);
CREATE TABLE guided_sessions (
 run_id INTEGER PRIMARY KEY REFERENCES simulation_runs(id),
 scenario_id INTEGER NOT NULL REFERENCES scenarios(id),
 initial_at TEXT NOT NULL,
 initial_shift_id INTEGER NOT NULL REFERENCES shifts(id),
 selected_team_id INTEGER NOT NULL REFERENCES teams(id),
 position INTEGER NOT NULL DEFAULT 0 CHECK(position>=0),
 contribution_id INTEGER REFERENCES contributions(id),
 updated_at TEXT NOT NULL
);
COMMIT;
