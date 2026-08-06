-- CPCV: selectable translation speed and accuracy profile.
-- Append-only migration. Do not edit prior migrations.

ALTER TABLE session_ai_settings
  ADD COLUMN translation_quality TEXT NOT NULL DEFAULT 'balanced'
  CHECK (translation_quality IN ('fast', 'balanced', 'accurate'));

PRAGMA optimize;
