-- Local development-only canonical schema for the legacy DB binding.
-- Do not apply this file to remote D1.  Production keeps its existing
-- migration history under migrations/**.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  public_code TEXT NOT NULL UNIQUE,
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  posting_enabled INTEGER NOT NULL DEFAULT 1,
  comments_visible INTEGER NOT NULL DEFAULT 1,
  comment_display_seconds INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  ended_at TEXT,
  comment_display_mode TEXT NOT NULL DEFAULT 'stack3',
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id TEXT NOT NULL,
  session_id TEXT,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_accounts (
  id TEXT PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS teacher_sessions (
  id TEXT PRIMARY KEY,
  teacher_account_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (teacher_account_id) REFERENCES teacher_accounts(id)
);

CREATE TABLE IF NOT EXISTS master_sessions (
  id TEXT PRIMARY KEY,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_public_code ON sessions(public_code);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_session ON admin_audit_logs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_teacher_sessions_account ON teacher_sessions(teacher_account_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_master_sessions_expires ON master_sessions(expires_at);
