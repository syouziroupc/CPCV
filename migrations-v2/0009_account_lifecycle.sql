-- CPCV Stage 6.5-B/C: invitations, email enrollment/change, organization quotas.
-- Append-only migration. Do not edit migrations 0001-0008.

CREATE TABLE email_enrollment_requests (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  new_email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (length(new_email) BETWEEN 3 AND 254),
  CHECK (new_email = lower(trim(new_email))),
  CHECK (expires_at > created_at),
  CHECK (confirmed_at IS NULL OR confirmed_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (confirmed_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX idx_email_enrollment_active_user
  ON email_enrollment_requests(user_id)
  WHERE confirmed_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX idx_email_enrollment_active_email
  ON email_enrollment_requests(new_email)
  WHERE confirmed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_email_enrollment_expiry
  ON email_enrollment_requests(expires_at, id);

CREATE UNIQUE INDEX idx_email_change_requests_active_email
  ON email_change_requests(new_email)
  WHERE confirmed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE email_delivery_attempts ADD COLUMN organization_id TEXT
  REFERENCES organizations(id) ON DELETE RESTRICT;

CREATE INDEX idx_email_delivery_attempts_org_created
  ON email_delivery_attempts(organization_id, created_at, id);

CREATE TABLE organization_email_events (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('organization_invitation')),
  day_key TEXT NOT NULL CHECK (length(day_key) = 10),
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
);

CREATE INDEX idx_organization_email_events_quota
  ON organization_email_events(organization_id, kind, day_key, created_at, id);

INSERT OR IGNORE INTO organization_quotas (
  organization_id, active_member_limit, pending_invitation_limit,
  invitation_email_daily_limit, created_at, updated_at
)
SELECT id, 25, 25, 50, created_at, created_at
FROM organizations;

CREATE TRIGGER trg_organization_members_active_limit_insert
BEFORE INSERT ON organization_members
WHEN NEW.status = 'active'
  AND EXISTS (SELECT 1 FROM organization_quotas q WHERE q.organization_id = NEW.organization_id)
  AND (
    SELECT COUNT(*) FROM organization_members m
    WHERE m.organization_id = NEW.organization_id AND m.status = 'active'
  ) >= (
    SELECT q.active_member_limit FROM organization_quotas q
    WHERE q.organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'MEMBER_LIMIT_REACHED');
END;

CREATE TRIGGER trg_organization_members_active_limit_update
BEFORE UPDATE OF status ON organization_members
WHEN OLD.status <> 'active' AND NEW.status = 'active'
  AND EXISTS (SELECT 1 FROM organization_quotas q WHERE q.organization_id = NEW.organization_id)
  AND (
    SELECT COUNT(*) FROM organization_members m
    WHERE m.organization_id = NEW.organization_id AND m.status = 'active'
  ) >= (
    SELECT q.active_member_limit FROM organization_quotas q
    WHERE q.organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'MEMBER_LIMIT_REACHED');
END;

CREATE TRIGGER trg_organization_invitations_pending_limit
BEFORE INSERT ON organization_invitations
WHEN (
    SELECT COUNT(*) FROM organization_invitations i
    WHERE i.organization_id = NEW.organization_id
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND i.expires_at > NEW.created_at
  ) >= (
    SELECT q.pending_invitation_limit FROM organization_quotas q
    WHERE q.organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'INVITATION_LIMIT_REACHED');
END;

CREATE TRIGGER trg_organization_invitation_daily_email_limit
BEFORE INSERT ON organization_email_events
WHEN NEW.kind = 'organization_invitation'
  AND (
    SELECT COUNT(*) FROM organization_email_events e
    WHERE e.organization_id = NEW.organization_id
      AND e.kind = NEW.kind AND e.day_key = NEW.day_key
  ) >= (
    SELECT q.invitation_email_daily_limit FROM organization_quotas q
    WHERE q.organization_id = NEW.organization_id
  )
BEGIN
  SELECT RAISE(ABORT, 'INVITATION_EMAIL_DAILY_LIMIT_REACHED');
END;

PRAGMA optimize;
