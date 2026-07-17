PRAGMA foreign_keys = ON;

-- Enables deterministic in-place upgrades of untouched built-in pack terms.
-- Manually edited terms clear source_pack metadata and are therefore never overwritten.
CREATE UNIQUE INDEX IF NOT EXISTS idx_filter_terms_source_pack_key_unique
  ON content_filter_terms(organization_id, source_pack, source_pack_term_key)
  WHERE source_pack IS NOT NULL AND source_pack_term_key IS NOT NULL AND deleted_at IS NULL;

PRAGMA optimize;
