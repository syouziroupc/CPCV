PRAGMA foreign_keys = ON;

CREATE TABLE realtime_session_state (
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL PRIMARY KEY,
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  last_clear_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_clear_sequence >= 0),
  last_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, live_session_id),
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id)
    ON DELETE CASCADE,
  CHECK (last_clear_sequence <= last_sequence),
  CHECK (updated_at >= created_at),
  CHECK (last_event_at IS NULL OR last_event_at >= created_at)
);

CREATE TABLE realtime_events (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'message:new', 'message:remove', 'message:restore',
      'message:clear', 'settings:update', 'room:closed'
    )
  ),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  source_comment_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (live_session_id, sequence),
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (source_comment_id)
    REFERENCES comments(id)
    ON DELETE CASCADE,
  CHECK (expires_at > created_at)
);

CREATE TABLE realtime_connection_tickets (
  id TEXT NOT NULL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  auth_session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'teacher')),
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,
  FOREIGN KEY (auth_session_id)
    REFERENCES auth_sessions(id)
    ON DELETE CASCADE,
  CHECK (expires_at > issued_at),
  CHECK (consumed_at IS NULL OR consumed_at >= issued_at)
);

CREATE INDEX idx_realtime_events_session_sequence
  ON realtime_events(live_session_id, sequence ASC);

CREATE INDEX idx_realtime_events_expiry
  ON realtime_events(expires_at, id);

CREATE INDEX idx_realtime_events_comment
  ON realtime_events(source_comment_id, sequence DESC);

CREATE INDEX idx_realtime_tickets_expiry
  ON realtime_connection_tickets(expires_at, consumed_at);

CREATE INDEX idx_realtime_tickets_session_user
  ON realtime_connection_tickets(live_session_id, user_id, issued_at DESC);

CREATE INDEX idx_realtime_tickets_auth_session
  ON realtime_connection_tickets(auth_session_id, issued_at DESC);

INSERT INTO realtime_session_state (
  organization_id, live_session_id, last_sequence, last_clear_sequence,
  last_event_at, created_at, updated_at
)
SELECT organization_id, id, 0, 0, NULL, created_at, updated_at
FROM live_sessions
WHERE 1
ON CONFLICT(live_session_id) DO NOTHING;

CREATE TRIGGER trg_realtime_comment_visible_insert
AFTER INSERT ON comments
WHEN NEW.moderation_state = 'visible'
BEGIN
  INSERT INTO realtime_session_state (
    organization_id, live_session_id, last_sequence, last_clear_sequence,
    last_event_at, created_at, updated_at
  ) VALUES (
    NEW.organization_id, NEW.live_session_id, 0, 0,
    NULL, NEW.created_at, NEW.created_at
  ) ON CONFLICT(live_session_id) DO NOTHING;

  UPDATE realtime_session_state
  SET last_sequence = last_sequence + 1,
      last_event_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE organization_id = NEW.organization_id
    AND live_session_id = NEW.live_session_id;

  INSERT INTO realtime_events (
    id, organization_id, live_session_id, sequence,
    event_type, payload_json, source_comment_id,
    created_at, expires_at
  ) VALUES (
    'rte_' || lower(hex(randomblob(16))),
    NEW.organization_id,
    NEW.live_session_id,
    (SELECT last_sequence FROM realtime_session_state WHERE live_session_id = NEW.live_session_id),
    'message:new',
    json_object(
      'type', 'message:new',
      'id', NEW.id,
      'nickname', NEW.nickname,
      'message', NEW.message,
      'messageLength', NEW.message_length,
      'moderationState', NEW.moderation_state,
      'createdAt', NEW.created_at,
      'updatedAt', NEW.updated_at,
      'retainedUntil', NEW.retained_until,
      'deletedAt', NEW.deleted_at
    ),
    NEW.id,
    NEW.created_at,
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at, '+24 hours')
  );
END;

CREATE TRIGGER trg_realtime_comment_moderation_update
AFTER UPDATE OF moderation_state, updated_at ON comments
WHEN OLD.moderation_state <> NEW.moderation_state
  AND (
    NEW.moderation_state = 'visible'
    OR OLD.moderation_state = 'visible'
  )
BEGIN
  INSERT INTO realtime_session_state (
    organization_id, live_session_id, last_sequence, last_clear_sequence,
    last_event_at, created_at, updated_at
  ) VALUES (
    NEW.organization_id, NEW.live_session_id, 0, 0,
    NULL, NEW.created_at, NEW.updated_at
  ) ON CONFLICT(live_session_id) DO NOTHING;

  UPDATE realtime_session_state
  SET last_sequence = last_sequence + 1,
      last_event_at = NEW.updated_at,
      updated_at = NEW.updated_at
  WHERE organization_id = NEW.organization_id
    AND live_session_id = NEW.live_session_id;

  INSERT INTO realtime_events (
    id, organization_id, live_session_id, sequence,
    event_type, payload_json, source_comment_id,
    created_at, expires_at
  ) VALUES (
    'rte_' || lower(hex(randomblob(16))),
    NEW.organization_id,
    NEW.live_session_id,
    (SELECT last_sequence FROM realtime_session_state WHERE live_session_id = NEW.live_session_id),
    CASE WHEN NEW.moderation_state = 'visible' THEN 'message:restore' ELSE 'message:remove' END,
    CASE
      WHEN NEW.moderation_state = 'visible' THEN json_object(
        'type', 'message:restore',
        'id', NEW.id,
        'nickname', NEW.nickname,
        'message', NEW.message,
        'messageLength', NEW.message_length,
        'moderationState', NEW.moderation_state,
        'createdAt', NEW.created_at,
        'updatedAt', NEW.updated_at,
        'retainedUntil', NEW.retained_until,
        'deletedAt', NEW.deleted_at
      )
      ELSE json_object(
        'type', 'message:remove',
        'commentId', NEW.id,
        'moderationState', NEW.moderation_state,
        'updatedAt', NEW.updated_at
      )
    END,
    NEW.id,
    NEW.updated_at,
    strftime('%Y-%m-%dT%H:%M:%fZ', NEW.updated_at, '+24 hours')
  );
END;

PRAGMA optimize;
