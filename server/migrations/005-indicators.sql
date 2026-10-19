BEGIN;
CREATE INDEX manager_period_target ON manager_targets(run_scope,kind,valid_from,enabled);
CREATE INDEX contribution_review_time ON contribution_reviews(contribution_id,reviewed_at,status);
ALTER TABLE contributions ADD COLUMN submitted_shift_id INTEGER REFERENCES shifts(id);
ALTER TABLE contribution_reviews ADD COLUMN clock_domain TEXT NOT NULL DEFAULT 'real' CHECK(clock_domain IN ('real','simulation'));
ALTER TABLE contribution_reviews ADD COLUMN occurred_at TEXT;
UPDATE contribution_reviews SET occurred_at=reviewed_at WHERE occurred_at IS NULL;
COMMIT;
