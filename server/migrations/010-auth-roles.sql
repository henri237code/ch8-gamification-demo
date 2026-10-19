BEGIN;
ALTER TABLE admin_sessions RENAME TO auth_sessions;
COMMIT;
