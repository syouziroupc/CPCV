PRAGMA foreign_keys = ON;

ALTER TABLE comments ADD COLUMN display_message TEXT;
ALTER TABLE comments ADD COLUMN filter_action TEXT NOT NULL DEFAULT 'allow'
  CHECK (filter_action IN ('allow', 'mask', 'review'));
ALTER TABLE comments ADD COLUMN filter_ai_required INTEGER NOT NULL DEFAULT 0
  CHECK (filter_ai_required IN (0, 1));
ALTER TABLE comments ADD COLUMN filter_version INTEGER NOT NULL DEFAULT 0
  CHECK (filter_version >= 0);

CREATE TABLE content_filter_terms (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  compact_term TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'sexual', 'profanity', 'harassment', 'discrimination', 'violence',
    'political', 'personal_info', 'spam', 'illegal', 'custom'
  )),
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  match_mode TEXT NOT NULL DEFAULT 'normalized'
    CHECK (match_mode IN ('strict', 'normalized')),
  fuzzy_enabled INTEGER NOT NULL DEFAULT 1 CHECK (fuzzy_enabled IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (length(term) BETWEEN 1 AND 80),
  CHECK (length(normalized_term) BETWEEN 1 AND 160),
  CHECK (length(compact_term) BETWEEN 1 AND 160),
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE UNIQUE INDEX idx_content_filter_terms_active_unique
  ON content_filter_terms(organization_id, compact_term, category)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_content_filter_terms_org_active
  ON content_filter_terms(organization_id, active, category, severity DESC, id);

CREATE TABLE organization_content_filter_policies (
  organization_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'sexual', 'profanity', 'harassment', 'discrimination', 'violence',
    'political', 'personal_info', 'spam', 'illegal', 'custom'
  )),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  review_min_severity INTEGER CHECK (review_min_severity BETWEEN 1 AND 5),
  mask_min_severity INTEGER CHECK (mask_min_severity BETWEEN 1 AND 5),
  reject_min_severity INTEGER CHECK (reject_min_severity BETWEEN 1 AND 5),
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, category),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at),
  CHECK (
    reject_min_severity IS NULL OR mask_min_severity IS NULL
    OR reject_min_severity >= mask_min_severity
  ),
  CHECK (
    mask_min_severity IS NULL OR review_min_severity IS NULL
    OR mask_min_severity >= review_min_severity
  )
);

CREATE TABLE session_content_filter_settings (
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  ai_routing_mode TEXT NOT NULL DEFAULT 'ambiguous'
    CHECK (ai_routing_mode IN ('off', 'ambiguous', 'all')),
  mask_character TEXT NOT NULL DEFAULT '＊',
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, live_session_id),
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (length(mask_character) BETWEEN 1 AND 4),
  CHECK (updated_at >= created_at)
);

CREATE TABLE comment_filter_matches (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  term_id TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'sexual', 'profanity', 'harassment', 'discrimination', 'violence',
    'political', 'personal_info', 'spam', 'illegal', 'custom'
  )),
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  match_kind TEXT NOT NULL CHECK (match_kind IN ('strict', 'compact', 'confusable', 'fuzzy')),
  confidence_milli INTEGER NOT NULL CHECK (confidence_milli BETWEEN 0 AND 1000),
  obfuscation_score INTEGER NOT NULL CHECK (obfuscation_score BETWEEN 0 AND 100),
  span_start INTEGER NOT NULL CHECK (span_start >= 0),
  span_end INTEGER NOT NULL CHECK (span_end > span_start),
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, live_session_id, comment_id)
    REFERENCES comments(organization_id, live_session_id, id) ON DELETE CASCADE,
  FOREIGN KEY (term_id) REFERENCES content_filter_terms(id) ON DELETE SET NULL
);

CREATE INDEX idx_comment_filter_matches_comment
  ON comment_filter_matches(comment_id, severity DESC, category, id);
CREATE INDEX idx_comment_filter_matches_term
  ON comment_filter_matches(term_id, created_at DESC, id);

CREATE TRIGGER trg_content_filter_policy_org_insert
AFTER INSERT ON organizations
BEGIN
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'sexual', 0, 2, 3, 5, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'profanity', 0, 2, 3, 5, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'harassment', 0, 3, 4, 5, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'discrimination', 0, 2, 4, 5, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'violence', 0, 3, 4, 5, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'political', 0, 3, NULL, NULL, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'personal_info', 0, 1, 2, 5, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'spam', 0, 2, 3, 5, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'illegal', 0, 3, 4, 5, NULL, NEW.created_at, NEW.created_at);
  INSERT OR IGNORE INTO organization_content_filter_policies VALUES
    (NEW.id, 'custom', 0, 3, 4, 5, NULL, NEW.created_at, NEW.created_at);
END;

CREATE TRIGGER trg_content_filter_session_insert
AFTER INSERT ON live_sessions
BEGIN
  INSERT OR IGNORE INTO session_content_filter_settings (
    organization_id, live_session_id, enabled, ai_routing_mode,
    mask_character, updated_by_user_id, created_at, updated_at
  ) VALUES (
    NEW.organization_id, NEW.id, 0, 'ambiguous', '＊',
    NEW.created_by_user_id, NEW.created_at, NEW.created_at
  );
END;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'sexual', 0, 2, 3, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'profanity', 0, 2, 3, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'harassment', 0, 3, 4, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'discrimination', 0, 2, 4, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'violence', 0, 3, 4, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'political', 0, 3, NULL, NULL, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'personal_info', 0, 1, 2, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'spam', 0, 2, 3, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'illegal', 0, 3, 4, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO organization_content_filter_policies (
  organization_id, category, enabled, review_min_severity, mask_min_severity,
  reject_min_severity, updated_by_user_id, created_at, updated_at
)
SELECT id, 'custom', 0, 3, 4, 5, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO session_content_filter_settings (
  organization_id, live_session_id, enabled, ai_routing_mode,
  mask_character, updated_by_user_id, created_at, updated_at
)
SELECT organization_id, id, 0, 'ambiguous', '＊', created_by_user_id, created_at, created_at
FROM live_sessions;

DROP TRIGGER IF EXISTS trg_realtime_comment_visible_insert;
DROP TRIGGER IF EXISTS trg_realtime_comment_moderation_update;

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
      'message', COALESCE(NEW.display_message, NEW.message),
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
  AND (NEW.moderation_state = 'visible' OR OLD.moderation_state = 'visible')
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
        'message', COALESCE(NEW.display_message, NEW.message),
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
