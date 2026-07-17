-- CPCV Stage 8: local-PDF page linkage and anonymous understanding analytics.
-- PDF bytes, page text, annotations, and filenames are never stored server-side.
-- Append-only migration. Do not edit migrations 0001-0014.

CREATE TABLE pdf_documents (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sha256_hex TEXT NOT NULL COLLATE NOCASE,
  pdfjs_fingerprint TEXT,
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 5000),
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 536870912),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (organization_id, sha256_hex),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (length(sha256_hex) = 64),
  CHECK (sha256_hex NOT GLOB '*[^0-9a-f]*'),
  CHECK (pdfjs_fingerprint IS NULL OR length(pdfjs_fingerprint) BETWEEN 1 AND 160),
  CHECK (last_seen_at >= created_at)
);

CREATE TABLE session_pdf_bindings (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  pdf_document_id TEXT NOT NULL,
  bound_by_user_id TEXT NOT NULL,
  bound_at TEXT NOT NULL,
  replaced_at TEXT,
  UNIQUE (organization_id, live_session_id, id),
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, pdf_document_id)
    REFERENCES pdf_documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, bound_by_user_id)
    REFERENCES organization_members(organization_id, user_id) ON DELETE RESTRICT,
  CHECK (replaced_at IS NULL OR replaced_at >= bound_at)
);

CREATE UNIQUE INDEX idx_session_pdf_bindings_active
  ON session_pdf_bindings(live_session_id)
  WHERE replaced_at IS NULL;

CREATE INDEX idx_session_pdf_bindings_document
  ON session_pdf_bindings(pdf_document_id, bound_at DESC);

CREATE TABLE pdf_pages (
  pdf_document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number BETWEEN 1 AND 5000),
  organization_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (pdf_document_id, page_number),
  UNIQUE (organization_id, pdf_document_id, page_number),
  FOREIGN KEY (organization_id, pdf_document_id)
    REFERENCES pdf_documents(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CHECK (last_seen_at >= first_seen_at)
);

CREATE TABLE session_pdf_state (
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL PRIMARY KEY,
  binding_id TEXT NOT NULL,
  pdf_document_id TEXT NOT NULL,
  current_page INTEGER NOT NULL CHECK (current_page BETWEEN 1 AND 5000),
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 5000),
  client_version INTEGER NOT NULL CHECK (client_version BETWEEN 1 AND 2147483647),
  updated_by_user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, live_session_id),
  FOREIGN KEY (organization_id, live_session_id)
    REFERENCES live_sessions(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, live_session_id, binding_id)
    REFERENCES session_pdf_bindings(organization_id, live_session_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, pdf_document_id)
    REFERENCES pdf_documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by_user_id)
    REFERENCES organization_members(organization_id, user_id) ON DELETE RESTRICT,
  CHECK (current_page <= page_count)
);

CREATE INDEX idx_session_pdf_state_document
  ON session_pdf_state(pdf_document_id, updated_at DESC);

CREATE TABLE pdf_page_events (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  pdf_document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number BETWEEN 1 AND 5000),
  client_version INTEGER NOT NULL CHECK (client_version BETWEEN 1 AND 2147483647),
  event_type TEXT NOT NULL CHECK (event_type IN ('bound', 'page_changed')),
  source_user_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE (binding_id, client_version),
  FOREIGN KEY (organization_id, live_session_id, binding_id)
    REFERENCES session_pdf_bindings(organization_id, live_session_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, pdf_document_id, page_number)
    REFERENCES pdf_pages(organization_id, pdf_document_id, page_number) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_user_id)
    REFERENCES organization_members(organization_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX idx_pdf_page_events_session_time
  ON pdf_page_events(live_session_id, occurred_at ASC, id ASC);

CREATE INDEX idx_pdf_page_events_page
  ON pdf_page_events(pdf_document_id, page_number, occurred_at ASC);

CREATE TABLE comment_page_links (
  comment_id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  pdf_document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number BETWEEN 1 AND 5000),
  state_client_version INTEGER NOT NULL CHECK (state_client_version BETWEEN 1 AND 2147483647),
  link_method TEXT NOT NULL DEFAULT 'server_current_page'
    CHECK (link_method = 'server_current_page'),
  linked_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, live_session_id, comment_id)
    REFERENCES comments(organization_id, live_session_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, live_session_id, binding_id)
    REFERENCES session_pdf_bindings(organization_id, live_session_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, pdf_document_id, page_number)
    REFERENCES pdf_pages(organization_id, pdf_document_id, page_number) ON DELETE RESTRICT
);

CREATE INDEX idx_comment_page_links_session_page
  ON comment_page_links(live_session_id, binding_id, page_number, linked_at ASC);

CREATE TABLE understanding_signals (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  pdf_document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number BETWEEN 1 AND 5000),
  signal TEXT NOT NULL CHECK (signal IN ('understood', 'unsure', 'confused')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retained_until TEXT NOT NULL,
  UNIQUE (live_session_id, participant_id, binding_id, page_number),
  FOREIGN KEY (organization_id, live_session_id, participant_id)
    REFERENCES participants(organization_id, live_session_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, live_session_id, binding_id)
    REFERENCES session_pdf_bindings(organization_id, live_session_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, pdf_document_id, page_number)
    REFERENCES pdf_pages(organization_id, pdf_document_id, page_number) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at),
  CHECK (retained_until > created_at)
);

CREATE INDEX idx_understanding_signals_session_page
  ON understanding_signals(live_session_id, binding_id, page_number, updated_at DESC);

CREATE INDEX idx_understanding_signals_retention
  ON understanding_signals(retained_until, id);

CREATE TABLE analytics_snapshots (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  live_session_id TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  pdf_document_id TEXT NOT NULL,
  source_cutoff_at TEXT NOT NULL,
  minimum_group_size INTEGER NOT NULL CHECK (minimum_group_size BETWEEN 2 AND 20),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  pages_json TEXT NOT NULL CHECK (json_valid(pages_json)),
  checksum_sha256 TEXT NOT NULL COLLATE NOCASE,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retained_until TEXT NOT NULL,
  FOREIGN KEY (organization_id, live_session_id, binding_id)
    REFERENCES session_pdf_bindings(organization_id, live_session_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, pdf_document_id)
    REFERENCES pdf_documents(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES organization_members(organization_id, user_id) ON DELETE RESTRICT,
  CHECK (length(checksum_sha256) = 64),
  CHECK (checksum_sha256 NOT GLOB '*[^0-9a-f]*'),
  CHECK (retained_until > created_at)
);

CREATE INDEX idx_analytics_snapshots_session_created
  ON analytics_snapshots(live_session_id, created_at DESC, id DESC);

CREATE INDEX idx_analytics_snapshots_retention
  ON analytics_snapshots(retained_until, id);

PRAGMA optimize;
