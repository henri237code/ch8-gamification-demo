BEGIN;
-- A permanent appreciation follows a team across its shifts and scenarios.
CREATE TABLE team_weather (
 team_id INTEGER PRIMARY KEY REFERENCES teams(id),
 mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
 fatigue INTEGER NOT NULL CHECK(fatigue BETWEEN 1 AND 5),
 note TEXT NOT NULL DEFAULT '',
 source TEXT NOT NULL DEFAULT 'demo_default' CHECK(source IN ('demo_default','manager')),
 updated_at TEXT NOT NULL
);
-- Preserve the last supervisor appreciation when a previous program identified a team.
INSERT INTO team_weather(team_id,mood,fatigue,note,source,updated_at)
SELECT t.id,COALESCE(w.mood,3),COALESCE(w.fatigue,3),COALESCE(w.note,''),
 CASE WHEN w.id IS NULL THEN 'demo_default' ELSE 'manager' END,
 COALESCE(w.updated_at,'1970-01-01T00:00:00.000Z')
FROM teams t LEFT JOIN weather_programs w ON w.id=(
 SELECT p.id FROM weather_programs p JOIN team_schedule s ON s.starts_at=p.shift_starts_at
 WHERE s.team_id=t.id AND p.cancelled_at IS NULL ORDER BY p.updated_at DESC,p.id DESC LIMIT 1
);
COMMIT;
