BEGIN;
CREATE TABLE admin_sessions (
 token_hash TEXT PRIMARY KEY,
 account_id INTEGER NOT NULL REFERENCES manager_accounts(id),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE login_attempts (
 client TEXT PRIMARY KEY,
 failures INTEGER NOT NULL,
 window_start TEXT NOT NULL
);
COMMIT;
