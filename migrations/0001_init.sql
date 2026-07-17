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
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id TEXT NOT NULL,
  session_id TEXT,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_public_code ON sessions(public_code);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_session ON admin_audit_logs(session_id, created_at);
