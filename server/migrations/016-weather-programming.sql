BEGIN;
CREATE TABLE weather_programs (
 id INTEGER PRIMARY KEY,
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, shift_starts_at TEXT NOT NULL,
 mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
 fatigue INTEGER CHECK(fatigue BETWEEN 1 AND 5),
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,updated_at TEXT NOT NULL,cancelled_at TEXT,
 CHECK(ends_at>starts_at)
);
CREATE INDEX weather_programs_period ON weather_programs(starts_at,ends_at);
COMMIT;
