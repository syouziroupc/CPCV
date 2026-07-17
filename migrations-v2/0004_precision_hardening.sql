CREATE TABLE auth_session_csrf_tokens (
  id TEXT NOT NULL PRIMARY KEY,
  auth_session_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (auth_session_id) REFERENCES auth_sessions(id) ON DELETE CASCADE,
  CHECK (expires_at > created_at)
);

CREATE INDEX idx_auth_session_csrf_tokens_session_created
  ON auth_session_csrf_tokens(auth_session_id, created_at DESC, id DESC);

CREATE INDEX idx_auth_session_csrf_tokens_expiry
  ON auth_session_csrf_tokens(expires_at, id);

PRAGMA optimize;
