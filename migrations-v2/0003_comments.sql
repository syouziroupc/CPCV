CREATE UNIQUE INDEX uq_live_sessions_organization_id
  ON live_sessions(organization_id, id);

CREATE TABLE participants (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deleted')),
  post_claim_id TEXT,
  next_post_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (organization_id, live_session_id, id),
  UNIQUE (live_session_id, token_hash),
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id)
    ON DELETE RESTRICT,
  CHECK (last_seen_at >= created_at),
  CHECK (next_post_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (
    (status = 'active' AND deleted_at IS NULL)
    OR
    (status = 'deleted' AND deleted_at IS NOT NULL)
  )
);

CREATE TABLE comments (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  message_length INTEGER NOT NULL,
  moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible', 'pending', 'hidden', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retained_until TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (live_session_id, idempotency_key),
  UNIQUE (organization_id, live_session_id, id),
  FOREIGN KEY (organization_id, live_session_id, participant_id)
    REFERENCES participants(organization_id, live_session_id, id)
    ON DELETE RESTRICT,
  CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  CHECK (idempotency_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
  CHECK (length(message) BETWEEN 1 AND 560),
  CHECK (message_length BETWEEN 1 AND 140),
  CHECK (length(nickname) <= 80),
  CHECK (updated_at >= created_at),
  CHECK (retained_until > created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (
    (moderation_state = 'deleted' AND deleted_at IS NOT NULL)
    OR
    (moderation_state IN ('visible', 'pending', 'hidden') AND deleted_at IS NULL)
  )
);

CREATE TABLE comment_events (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'hidden', 'restored', 'deleted', 'retention_deleted')),
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('participant', 'user', 'system')),
  actor_user_id TEXT,
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, live_session_id, comment_id)
    REFERENCES comments(organization_id, live_session_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (
    (actor_type = 'user' AND actor_user_id IS NOT NULL)
    OR
    (actor_type IN ('participant', 'system') AND actor_user_id IS NULL)
  )
);

CREATE INDEX idx_participants_session_last_seen
  ON participants(live_session_id, last_seen_at DESC);

CREATE INDEX idx_participants_retention_cleanup
  ON participants(status, last_seen_at);

CREATE INDEX idx_comments_session_created
  ON comments(live_session_id, created_at DESC, id DESC);

CREATE INDEX idx_comments_org_created
  ON comments(organization_id, created_at DESC, id DESC);

CREATE INDEX idx_comments_retention
  ON comments(retained_until, id);

CREATE INDEX idx_comments_moderation
  ON comments(live_session_id, moderation_state, created_at DESC);

CREATE INDEX idx_comment_events_comment_created
  ON comment_events(comment_id, created_at ASC);

CREATE INDEX idx_comment_events_session_created
  ON comment_events(live_session_id, created_at DESC);

PRAGMA optimize;
