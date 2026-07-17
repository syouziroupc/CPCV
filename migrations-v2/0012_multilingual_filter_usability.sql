PRAGMA foreign_keys = ON;

ALTER TABLE content_filter_terms ADD COLUMN language_code TEXT NOT NULL DEFAULT 'und'
  CHECK (length(language_code) BETWEEN 2 AND 35);
ALTER TABLE content_filter_terms ADD COLUMN boundary_mode TEXT NOT NULL DEFAULT 'auto'
  CHECK (boundary_mode IN ('auto', 'word', 'substring'));

DROP INDEX IF EXISTS idx_content_filter_terms_active_unique;
CREATE UNIQUE INDEX idx_content_filter_terms_active_unique
  ON content_filter_terms(organization_id, compact_term, category, language_code, boundary_mode)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_content_filter_terms_org_language
  ON content_filter_terms(organization_id, language_code, active, category, severity DESC, id);

PRAGMA optimize;
