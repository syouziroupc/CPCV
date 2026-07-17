PRAGMA foreign_keys = ON;

ALTER TABLE comments ADD COLUMN detected_language TEXT NOT NULL DEFAULT 'und'
  CHECK (length(detected_language) BETWEEN 2 AND 20);
ALTER TABLE comments ADD COLUMN language_confidence_milli INTEGER NOT NULL DEFAULT 0
  CHECK (language_confidence_milli BETWEEN 0 AND 1000);
ALTER TABLE comments ADD COLUMN unsupported_language INTEGER NOT NULL DEFAULT 0
  CHECK (unsupported_language IN (0, 1));

ALTER TABLE session_content_filter_settings ADD COLUMN translation_filter_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (translation_filter_enabled IN (0, 1));
ALTER TABLE session_content_filter_settings ADD COLUMN unsupported_language_mode TEXT NOT NULL DEFAULT 'ai_review'
  CHECK (unsupported_language_mode IN ('ai_review', 'review_only', 'allow'));

ALTER TABLE content_filter_terms ADD COLUMN source_pack TEXT;
ALTER TABLE content_filter_terms ADD COLUMN source_pack_version INTEGER;
ALTER TABLE content_filter_terms ADD COLUMN source_pack_term_key TEXT;

CREATE TABLE content_filter_pack_installs (
  organization_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  pack_version INTEGER NOT NULL CHECK (pack_version BETWEEN 1 AND 1000000),
  installed_by_user_id TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, pack_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (installed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (length(pack_id) BETWEEN 3 AND 80),
  CHECK (updated_at >= installed_at)
);

CREATE INDEX idx_filter_pack_installs_org
  ON content_filter_pack_installs(organization_id, installed_at, pack_id);
CREATE INDEX idx_filter_terms_source_pack
  ON content_filter_terms(organization_id, source_pack, source_pack_term_key)
  WHERE source_pack IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE translations ADD COLUMN source_language TEXT NOT NULL DEFAULT 'und'
  CHECK (length(source_language) BETWEEN 2 AND 20);
ALTER TABLE translations ADD COLUMN display_text TEXT;
ALTER TABLE translations ADD COLUMN filter_action TEXT NOT NULL DEFAULT 'allow'
  CHECK (filter_action IN ('allow', 'mask', 'review', 'reject'));
ALTER TABLE translations ADD COLUMN filter_matches_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(filter_matches_json));
ALTER TABLE translations ADD COLUMN filter_version INTEGER NOT NULL DEFAULT 0
  CHECK (filter_version >= 0);

UPDATE session_ai_settings SET target_language = 'ja'
WHERE target_language NOT IN ('ja', 'en');

PRAGMA optimize;
