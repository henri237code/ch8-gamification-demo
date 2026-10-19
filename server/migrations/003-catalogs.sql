BEGIN;
CREATE TABLE badge_definitions (
 code TEXT PRIMARY KEY, month INTEGER NOT NULL UNIQUE CHECK(month BETWEEN 1 AND 12),
 title TEXT NOT NULL, description TEXT NOT NULL, icon_code TEXT NOT NULL, color TEXT NOT NULL
);
CREATE TABLE message_templates (
 code TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL
);
CREATE TABLE manager_quote_preference (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 mode TEXT NOT NULL CHECK(mode IN ('manual','each_shift')),
 content_id INTEGER REFERENCES editorial_contents(id),
 selected_by_team_id INTEGER REFERENCES teams(id),
 updated_at TEXT NOT NULL,
 CHECK(mode='each_shift' OR content_id IS NOT NULL)
);
ALTER TABLE recognitions ADD COLUMN shift_template_id INTEGER REFERENCES shift_templates(id);
CREATE UNIQUE INDEX manager_safety_badge_period ON recognitions(badge_code,team_id,starts_at)
 WHERE kind='safety_badge' AND origin='manager';
COMMIT;
