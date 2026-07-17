CREATE TABLE organizations (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (
    (status = 'deleted' AND deleted_at IS NOT NULL)
    OR
    (status IN ('active', 'suspended') AND deleted_at IS NULL)
  )
);

CREATE TABLE users (
  id TEXT NOT NULL PRIMARY KEY,
  login_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  password_scheme TEXT NOT NULL CHECK (length(password_scheme) BETWEEN 1 AND 64),
  password_hash TEXT NOT NULL CHECK (length(password_hash) BETWEEN 16 AND 512),
  password_salt TEXT NOT NULL CHECK (length(password_salt) BETWEEN 8 AND 256),
  password_changed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (length(login_id) BETWEEN 1 AND 64),
  CHECK (login_id = lower(trim(login_id))),
  CHECK (login_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (password_changed_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (
    (status = 'deleted' AND deleted_at IS NOT NULL)
    OR
    (status IN ('active', 'suspended') AND deleted_at IS NULL)
  )
);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'teacher')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT,
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at),
  CHECK (removed_at IS NULL OR removed_at >= created_at),
  CHECK (
    (status = 'removed' AND removed_at IS NOT NULL)
    OR
    (status IN ('active', 'suspended') AND removed_at IS NULL)
  )
);

CREATE TABLE auth_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (organization_id, user_id)
    REFERENCES organization_members(organization_id, user_id)
    ON DELETE RESTRICT,
  CHECK (last_seen_at >= created_at),
  CHECK (idle_expires_at > last_seen_at),
  CHECK (absolute_expires_at > created_at),
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE password_reset_tokens (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at),
  CHECK (used_at IS NULL OR used_at <= expires_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE TABLE live_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  public_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  posting_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (posting_enabled IN (0, 1)),
  comments_visible INTEGER NOT NULL DEFAULT 1
    CHECK (comments_visible IN (0, 1)),
  comment_display_seconds INTEGER NOT NULL DEFAULT 60
    CHECK (comment_display_seconds BETWEEN 10 AND 300),
  comment_display_mode TEXT NOT NULL DEFAULT 'stack3'
    CHECK (comment_display_mode IN ('stack3', 'stack5', 'stack7', 'scroll')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES organization_members(organization_id, user_id)
    ON DELETE RESTRICT,
  CHECK (length(public_code) = 6),
  CHECK (public_code = upper(public_code)),
  CHECK (public_code NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'),
  CHECK (updated_at >= created_at),
  CHECK (started_at >= created_at),
  CHECK (expires_at > started_at),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (deleted_at IS NULL OR deleted_at >= ended_at),
  CHECK (
    (status = 'active' AND ended_at IS NULL AND deleted_at IS NULL)
    OR
    (status = 'ended' AND ended_at IS NOT NULL AND deleted_at IS NULL)
    OR
    (status = 'deleted' AND ended_at IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CHECK (
    status = 'active'
    OR (posting_enabled = 0 AND comments_visible = 0)
  )
);

CREATE TABLE audit_logs (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system')),
  actor_user_id TEXT,
  actor_role TEXT CHECK (actor_role IS NULL OR actor_role IN ('owner', 'admin', 'teacher')),
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 100),
  target_type TEXT CHECK (target_type IS NULL OR length(trim(target_type)) BETWEEN 1 AND 64),
  target_id TEXT CHECK (target_id IS NULL OR length(target_id) BETWEEN 1 AND 128),
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (
    (actor_type = 'system' AND actor_user_id IS NULL AND actor_role IS NULL)
    OR
    (actor_type = 'user' AND actor_user_id IS NOT NULL)
  )
);

CREATE INDEX idx_organizations_status
  ON organizations(status, created_at);

CREATE INDEX idx_users_status
  ON users(status, created_at);

CREATE INDEX idx_organization_members_user_status
  ON organization_members(user_id, status, organization_id);

CREATE INDEX idx_organization_members_org_role_status
  ON organization_members(organization_id, role, status);

CREATE INDEX idx_auth_sessions_user_org_expiry
  ON auth_sessions(user_id, organization_id, absolute_expires_at);

CREATE INDEX idx_auth_sessions_org_expiry
  ON auth_sessions(organization_id, absolute_expires_at);

CREATE INDEX idx_auth_sessions_idle_expiry
  ON auth_sessions(idle_expires_at);

CREATE INDEX idx_auth_sessions_absolute_expiry
  ON auth_sessions(absolute_expires_at);

CREATE INDEX idx_password_reset_tokens_user_expires
  ON password_reset_tokens(user_id, expires_at);

CREATE INDEX idx_password_reset_tokens_expires
  ON password_reset_tokens(expires_at);

CREATE INDEX idx_live_sessions_org_status_created
  ON live_sessions(organization_id, status, created_at DESC);

CREATE INDEX idx_live_sessions_creator_status_created
  ON live_sessions(created_by_user_id, status, created_at DESC);

CREATE INDEX idx_live_sessions_expires
  ON live_sessions(expires_at);

CREATE INDEX idx_audit_logs_org_created
  ON audit_logs(organization_id, created_at DESC);

CREATE INDEX idx_audit_logs_actor_created
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX idx_audit_logs_target_created
  ON audit_logs(target_type, target_id, created_at DESC);

PRAGMA optimize;
