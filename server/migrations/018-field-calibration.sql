BEGIN;
CREATE TABLE production_calibrations (
 id INTEGER PRIMARY KEY,
 effective_from TEXT NOT NULL,
 created_at TEXT NOT NULL,
 nominal_bph INTEGER NOT NULL CHECK(nominal_bph>0),
 base_target INTEGER NOT NULL CHECK(base_target>0),
 yellow REAL NOT NULL, green REAL NOT NULL, blue REAL NOT NULL,
 formula TEXT NOT NULL, provisional INTEGER NOT NULL DEFAULT 1,
 CHECK(yellow>0 AND yellow<green AND green<blue AND blue<=1)
);
ALTER TABLE simulation_runs ADD COLUMN calibration_id INTEGER REFERENCES production_calibrations(id);
ALTER TABLE shifts ADD COLUMN calibration_id INTEGER REFERENCES production_calibrations(id);
ALTER TABLE shifts ADD COLUMN calibrated_from TEXT;
ALTER TABLE shifts ADD COLUMN score_divisor INTEGER NOT NULL DEFAULT 1 CHECK(score_divisor IN (1,100));
COMMIT;
