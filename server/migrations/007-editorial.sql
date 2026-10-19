BEGIN;
ALTER TABLE recognitions ADD COLUMN revoked_at TEXT;
DROP INDEX manager_safety_badge_period;
CREATE UNIQUE INDEX manager_safety_badge_period ON recognitions(badge_code,team_id,starts_at) WHERE kind='safety_badge' AND origin='manager' AND person_id IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX operator_month_period ON recognitions(starts_at) WHERE kind='operator_month' AND origin='manager' AND revoked_at IS NULL;
CREATE UNIQUE INDEX personal_badge_period ON recognitions(badge_code,person_id,starts_at) WHERE kind='safety_badge' AND origin='manager' AND person_id IS NOT NULL AND revoked_at IS NULL;
COMMIT;
