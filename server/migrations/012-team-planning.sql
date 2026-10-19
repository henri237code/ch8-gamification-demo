BEGIN;
CREATE TABLE team_schedule (
 id INTEGER PRIMARY KEY,
 line_id INTEGER NOT NULL REFERENCES lines(id),
 template_id INTEGER NOT NULL REFERENCES shift_templates(id),
 team_id INTEGER NOT NULL REFERENCES teams(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
 created_by INTEGER NOT NULL REFERENCES manager_accounts(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(line_id,starts_at)
);
CREATE TABLE scenario_shift_teams (
 run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 starts_at TEXT NOT NULL,team_id INTEGER NOT NULL REFERENCES teams(id),
 PRIMARY KEY(run_id,starts_at)
);
ALTER TABLE shifts ADD COLUMN assignment_source TEXT NOT NULL DEFAULT 'rotation' CHECK(assignment_source IN ('rotation','manager_planning','presenter'));
COMMIT;
