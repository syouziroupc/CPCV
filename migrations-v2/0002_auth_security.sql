ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0
  CHECK (failed_login_count BETWEEN 0 AND 1000000);

ALTER TABLE users ADD COLUMN locked_until TEXT;

ALTER TABLE users ADD COLUMN require_password_change INTEGER NOT NULL DEFAULT 0
  CHECK (require_password_change IN (0, 1));

CREATE INDEX idx_users_lock_state
  ON users(status, locked_until);

PRAGMA optimize;
