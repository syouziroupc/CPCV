-- CPCV Stage 6.5-A: verified email registration and recovery.
-- Append-only migration. Do not edit migrations 0001-0007.

ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN email_updated_at TEXT;

CREATE UNIQUE INDEX idx_users_email_unique
  ON users(email)
  WHERE email IS NOT NULL;

CREATE INDEX idx_users_email_verification
  ON users(email_verified_at, status, id)
  WHERE email IS NOT NULL;

CREATE TABLE pending_registrations (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  organization_name TEXT NOT NULL CHECK (length(trim(organization_name)) BETWEEN 1 AND 120),
  password_scheme TEXT NOT NULL CHECK (length(password_scheme) BETWEEN 1 AND 64),
  password_hash TEXT NOT NULL CHECK (length(password_hash) BETWEEN 16 AND 512),
  password_salt TEXT NOT NULL CHECK (length(password_salt) BETWEEN 8 AND 256),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  revoked_at TEXT,
  last_sent_at TEXT NOT NULL,
  resend_count INTEGER NOT NULL DEFAULT 0 CHECK (resend_count BETWEEN 0 AND 1000000),
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (email = lower(trim(email))),
  CHECK (expires_at > created_at),
  CHECK (last_sent_at >= created_at),
  CHECK (verified_at IS NULL OR verified_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (verified_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX idx_pending_registrations_active_email
  ON pending_registrations(email)
  WHERE verified_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_pending_registrations_expiry
  ON pending_registrations(expires_at, id);

CREATE TABLE organization_origins (
  organization_id TEXT NOT NULL PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('bootstrap', 'self_signup', 'system')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_organization_origins_self_signup_user
  ON organization_origins(created_by_user_id)
  WHERE source = 'self_signup' AND created_by_user_id IS NOT NULL;

CREATE TABLE organization_quotas (
  organization_id TEXT NOT NULL PRIMARY KEY,
  active_member_limit INTEGER NOT NULL DEFAULT 25
    CHECK (active_member_limit BETWEEN 1 AND 100000),
  pending_invitation_limit INTEGER NOT NULL DEFAULT 25
    CHECK (pending_invitation_limit BETWEEN 0 AND 100000),
  invitation_email_daily_limit INTEGER NOT NULL DEFAULT 50
    CHECK (invitation_email_daily_limit BETWEEN 0 AND 1000000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at)
);

CREATE TABLE organization_invitations (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'teacher')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_user_id TEXT,
  revoked_at TEXT,
  last_sent_at TEXT NOT NULL,
  resend_count INTEGER NOT NULL DEFAULT 0 CHECK (resend_count BETWEEN 0 AND 1000000),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, invited_by_user_id)
    REFERENCES organization_members(organization_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (accepted_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (email = lower(trim(email))),
  CHECK (expires_at > created_at),
  CHECK (last_sent_at >= created_at),
  CHECK (accepted_at IS NULL OR accepted_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (accepted_at IS NULL OR accepted_user_id IS NOT NULL),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX idx_organization_invitations_active
  ON organization_invitations(organization_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_organization_invitations_expiry
  ON organization_invitations(expires_at, id);

CREATE TABLE email_change_requests (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  old_email TEXT NOT NULL COLLATE NOCASE,
  new_email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (length(old_email) BETWEEN 3 AND 254),
  CHECK (length(new_email) BETWEEN 3 AND 254),
  CHECK (old_email = lower(trim(old_email))),
  CHECK (new_email = lower(trim(new_email))),
  CHECK (old_email <> new_email),
  CHECK (expires_at > created_at),
  CHECK (confirmed_at IS NULL OR confirmed_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (confirmed_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX idx_email_change_requests_active_user
  ON email_change_requests(user_id)
  WHERE confirmed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_email_change_requests_expiry
  ON email_change_requests(expires_at, id);

CREATE TABLE email_delivery_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'verify_registration',
      'password_reset',
      'organization_invitation',
      'email_change_confirmation',
      'email_changed_notice'
    )
  ),
  recipient_hash TEXT NOT NULL,
  recipient_mask TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  provider_message_id TEXT,
  provider_error_code TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK (completed_at IS NULL OR completed_at >= created_at),
  CHECK (
    (status = 'pending' AND completed_at IS NULL)
    OR
    (status IN ('sent', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_email_delivery_attempts_created
  ON email_delivery_attempts(created_at, id);

CREATE TABLE auth_public_counters (
  scope TEXT NOT NULL CHECK (scope IN ('recipient_email', 'request_ip')),
  key_hash TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count BETWEEN 0 AND 1000000000),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
);

CREATE INDEX idx_auth_public_counters_updated
  ON auth_public_counters(updated_at, scope);

ALTER TABLE password_reset_tokens ADD COLUMN email_snapshot TEXT COLLATE NOCASE;
ALTER TABLE password_reset_tokens ADD COLUMN delivery_requested_at TEXT;

CREATE INDEX idx_password_reset_tokens_expiry_v2
  ON password_reset_tokens(expires_at, id);

PRAGMA optimize;
