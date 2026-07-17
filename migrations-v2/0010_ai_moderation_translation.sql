-- CPCV Stage 7: AI moderation advice and translation.
-- Append-only migration. Do not edit migrations 0001-0009.

CREATE TABLE organization_ai_settings (
  organization_id TEXT NOT NULL PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  moderation_daily_limit INTEGER NOT NULL DEFAULT 500
    CHECK (moderation_daily_limit BETWEEN 0 AND 100000),
  translation_daily_limit INTEGER NOT NULL DEFAULT 500
    CHECK (translation_daily_limit BETWEEN 0 AND 100000),
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at)
);

CREATE TABLE session_ai_settings (
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  moderation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (moderation_enabled IN (0, 1)),
  translation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (translation_enabled IN (0, 1)),
  target_language TEXT NOT NULL DEFAULT 'ja'
    CHECK (target_language IN ('ja', 'en', 'ko', 'zh-CN', 'zh-TW')),
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, live_session_id),
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at)
);

CREATE TABLE ai_jobs (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('moderation', 'translation')),
  target_language TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'retry', 'succeeded', 'failed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
  run_after TEXT NOT NULL,
  claimed_at TEXT,
  finished_at TEXT,
  last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (comment_id, job_type, target_language),
  FOREIGN KEY (organization_id, live_session_id, comment_id)
    REFERENCES comments(organization_id, live_session_id, id) ON DELETE CASCADE,
  CHECK (
    (job_type = 'moderation' AND target_language = '')
    OR
    (job_type = 'translation' AND target_language IN ('ja', 'en', 'ko', 'zh-CN', 'zh-TW'))
  ),
  CHECK (run_after >= created_at),
  CHECK (claimed_at IS NULL OR claimed_at >= created_at),
  CHECK (finished_at IS NULL OR finished_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (
    (status IN ('queued', 'retry') AND finished_at IS NULL)
    OR (status = 'processing' AND claimed_at IS NOT NULL AND finished_at IS NULL)
    OR (status IN ('succeeded', 'failed', 'skipped') AND finished_at IS NOT NULL)
  )
);

CREATE TABLE ai_results (
  id TEXT NOT NULL PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('allow', 'review', 'hide')),
  confidence_milli INTEGER NOT NULL CHECK (confidence_milli BETWEEN 0 AND 1000),
  categories_json TEXT NOT NULL CHECK (json_valid(categories_json)),
  source TEXT NOT NULL CHECK (source IN ('provider', 'local_privacy_guard')),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, live_session_id, comment_id)
    REFERENCES comments(organization_id, live_session_id, id) ON DELETE CASCADE
);

CREATE TABLE translations (
  id TEXT NOT NULL PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  target_language TEXT NOT NULL CHECK (target_language IN ('ja', 'en', 'ko', 'zh-CN', 'zh-TW')),
  translated_text TEXT NOT NULL CHECK (length(translated_text) BETWEEN 1 AND 2000),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  prompt_version TEXT NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  UNIQUE (comment_id, target_language),
  FOREIGN KEY (job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, live_session_id, comment_id)
    REFERENCES comments(organization_id, live_session_id, id) ON DELETE CASCADE
);

CREATE TABLE ai_usage_events (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 100),
  job_type TEXT NOT NULL CHECK (job_type IN ('moderation', 'translation')),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
  day_key TEXT NOT NULL CHECK (length(day_key) = 10),
  input_characters INTEGER NOT NULL CHECK (input_characters BETWEEN 0 AND 1000000),
  output_characters INTEGER NOT NULL DEFAULT 0 CHECK (output_characters BETWEEN 0 AND 1000000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE,
  CHECK (updated_at >= created_at)
);

CREATE INDEX idx_ai_jobs_dispatch
  ON ai_jobs(status, run_after, created_at, id);
CREATE INDEX idx_ai_jobs_comment
  ON ai_jobs(comment_id, job_type, created_at DESC);
CREATE INDEX idx_ai_jobs_session_status
  ON ai_jobs(live_session_id, status, created_at DESC);
CREATE INDEX idx_ai_results_comment
  ON ai_results(comment_id, created_at DESC);
CREATE INDEX idx_translations_comment_language
  ON translations(comment_id, target_language, created_at DESC);
CREATE INDEX idx_ai_usage_org_day_kind
  ON ai_usage_events(organization_id, day_key, job_type, created_at, id);
CREATE INDEX idx_ai_usage_job
  ON ai_usage_events(job_id, created_at, id);

CREATE TRIGGER trg_organization_ai_settings_insert
AFTER INSERT ON organizations
BEGIN
  INSERT OR IGNORE INTO organization_ai_settings (
    organization_id, enabled, moderation_daily_limit, translation_daily_limit,
    updated_by_user_id, created_at, updated_at
  ) VALUES (NEW.id, 0, 500, 500, NULL, NEW.created_at, NEW.created_at);
END;

CREATE TRIGGER trg_session_ai_settings_insert
AFTER INSERT ON live_sessions
BEGIN
  INSERT OR IGNORE INTO session_ai_settings (
    organization_id, live_session_id, moderation_enabled, translation_enabled,
    target_language, updated_by_user_id, created_at, updated_at
  ) VALUES (NEW.organization_id, NEW.id, 0, 0, 'ja', NEW.created_by_user_id, NEW.created_at, NEW.created_at);
END;

CREATE TRIGGER trg_ai_usage_moderation_limit
BEFORE INSERT ON ai_usage_events
WHEN NEW.job_type = 'moderation'
  AND (
    SELECT COUNT(*) FROM ai_usage_events e
    WHERE e.organization_id = NEW.organization_id
      AND e.day_key = NEW.day_key
      AND e.job_type = 'moderation'
  ) >= COALESCE((
    SELECT moderation_daily_limit FROM organization_ai_settings s
    WHERE s.organization_id = NEW.organization_id
  ), 0)
BEGIN
  SELECT RAISE(ABORT, 'AI_DAILY_LIMIT_REACHED');
END;

CREATE TRIGGER trg_ai_usage_translation_limit
BEFORE INSERT ON ai_usage_events
WHEN NEW.job_type = 'translation'
  AND (
    SELECT COUNT(*) FROM ai_usage_events e
    WHERE e.organization_id = NEW.organization_id
      AND e.day_key = NEW.day_key
      AND e.job_type = 'translation'
  ) >= COALESCE((
    SELECT translation_daily_limit FROM organization_ai_settings s
    WHERE s.organization_id = NEW.organization_id
  ), 0)
BEGIN
  SELECT RAISE(ABORT, 'AI_DAILY_LIMIT_REACHED');
END;

INSERT OR IGNORE INTO organization_ai_settings (
  organization_id, enabled, moderation_daily_limit, translation_daily_limit,
  updated_by_user_id, created_at, updated_at
)
SELECT id, 0, 500, 500, NULL, created_at, created_at
FROM organizations;

INSERT OR IGNORE INTO session_ai_settings (
  organization_id, live_session_id, moderation_enabled, translation_enabled,
  target_language, updated_by_user_id, created_at, updated_at
)
SELECT organization_id, id, 0, 0, 'ja', created_by_user_id, created_at, created_at
FROM live_sessions;

PRAGMA optimize;
