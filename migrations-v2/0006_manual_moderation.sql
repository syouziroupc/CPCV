CREATE TABLE session_moderation_settings (
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  moderation_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (moderation_mode IN ('off', 'pre')),
  updated_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, live_session_id),
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at)
);

CREATE TABLE comment_moderation_actions (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'admin', 'teacher')),
  action TEXT NOT NULL CHECK (action IN ('approve', 'hide', 'delete', 'restore')),
  from_state TEXT NOT NULL CHECK (from_state IN ('visible', 'pending', 'hidden', 'deleted')),
  to_state TEXT NOT NULL CHECK (to_state IN ('visible', 'pending', 'hidden', 'deleted')),
  reason TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 200),
  expected_updated_at TEXT NOT NULL,
  result_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, live_session_id, comment_id)
    REFERENCES comments(organization_id, live_session_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (comment_id, result_updated_at),
  CHECK (result_updated_at > expected_updated_at),
  CHECK (created_at = result_updated_at),
  CHECK (
    (action = 'approve' AND from_state = 'pending' AND to_state = 'visible')
    OR
    (action = 'hide' AND from_state IN ('visible', 'pending') AND to_state = 'hidden')
    OR
    (action = 'delete' AND from_state IN ('visible', 'pending', 'hidden') AND to_state = 'deleted')
    OR
    (action = 'restore' AND from_state = 'hidden' AND to_state = 'visible')
    OR
    (action = 'restore' AND from_state = 'deleted' AND to_state = 'hidden')
  )
);

CREATE INDEX idx_session_moderation_mode
  ON session_moderation_settings(organization_id, moderation_mode, live_session_id);

CREATE INDEX idx_comment_moderation_actions_comment_created
  ON comment_moderation_actions(comment_id, created_at DESC, id DESC);

CREATE INDEX idx_comment_moderation_actions_session_created
  ON comment_moderation_actions(live_session_id, created_at DESC, id DESC);

CREATE INDEX idx_comment_moderation_actions_actor_created
  ON comment_moderation_actions(actor_user_id, created_at DESC, id DESC);

CREATE TRIGGER trg_comments_moderation_transition
BEFORE UPDATE OF moderation_state ON comments
WHEN OLD.moderation_state <> NEW.moderation_state
  AND NOT (
    (OLD.moderation_state = 'pending' AND NEW.moderation_state IN ('visible', 'hidden', 'deleted'))
    OR
    (OLD.moderation_state = 'visible' AND NEW.moderation_state IN ('hidden', 'deleted'))
    OR
    (OLD.moderation_state = 'hidden' AND NEW.moderation_state IN ('visible', 'deleted'))
    OR
    (OLD.moderation_state = 'deleted' AND NEW.moderation_state = 'hidden')
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid moderation transition');
END;

CREATE TRIGGER trg_comments_moderation_timestamp
BEFORE UPDATE OF moderation_state ON comments
WHEN OLD.moderation_state <> NEW.moderation_state
  AND NEW.updated_at <= OLD.updated_at
BEGIN
  SELECT RAISE(ABORT, 'moderation timestamp must advance');
END;

PRAGMA optimize;
