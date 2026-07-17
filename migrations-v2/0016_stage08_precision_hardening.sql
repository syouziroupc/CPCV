-- Stage 8 precision hardening. Append-only migration.
-- Enforces relationships that SQLite composite foreign keys alone cannot express.

CREATE TRIGGER trg_pdf_pages_document_bounds_insert
BEFORE INSERT ON pdf_pages
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM pdf_documents d
    WHERE d.id = NEW.pdf_document_id
      AND d.organization_id = NEW.organization_id
      AND NEW.page_number BETWEEN 1 AND d.page_count
  ) THEN RAISE(ABORT, 'pdf page outside document bounds') END;
END;

CREATE TRIGGER trg_pdf_pages_document_bounds_update
BEFORE UPDATE OF pdf_document_id, organization_id, page_number ON pdf_pages
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM pdf_documents d
    WHERE d.id = NEW.pdf_document_id
      AND d.organization_id = NEW.organization_id
      AND NEW.page_number BETWEEN 1 AND d.page_count
  ) THEN RAISE(ABORT, 'pdf page outside document bounds') END;
END;

CREATE TRIGGER trg_session_pdf_state_consistency_insert
BEFORE INSERT ON session_pdf_state
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM session_pdf_bindings b
    JOIN pdf_documents d
      ON d.id = b.pdf_document_id
     AND d.organization_id = b.organization_id
    WHERE b.id = NEW.binding_id
      AND b.organization_id = NEW.organization_id
      AND b.live_session_id = NEW.live_session_id
      AND b.pdf_document_id = NEW.pdf_document_id
      AND d.page_count = NEW.page_count
      AND NEW.current_page BETWEEN 1 AND d.page_count
      AND b.replaced_at IS NULL
  ) THEN RAISE(ABORT, 'session pdf state is inconsistent') END;
END;

CREATE TRIGGER trg_session_pdf_state_consistency_update
BEFORE UPDATE OF organization_id, live_session_id, binding_id, pdf_document_id, current_page, page_count
ON session_pdf_state
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM session_pdf_bindings b
    JOIN pdf_documents d
      ON d.id = b.pdf_document_id
     AND d.organization_id = b.organization_id
    WHERE b.id = NEW.binding_id
      AND b.organization_id = NEW.organization_id
      AND b.live_session_id = NEW.live_session_id
      AND b.pdf_document_id = NEW.pdf_document_id
      AND d.page_count = NEW.page_count
      AND NEW.current_page BETWEEN 1 AND d.page_count
      AND b.replaced_at IS NULL
  ) THEN RAISE(ABORT, 'session pdf state is inconsistent') END;
END;

CREATE TRIGGER trg_pdf_page_events_consistency_insert
BEFORE INSERT ON pdf_page_events
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM session_pdf_bindings b
    JOIN pdf_documents d
      ON d.id = b.pdf_document_id
     AND d.organization_id = b.organization_id
    WHERE b.id = NEW.binding_id
      AND b.organization_id = NEW.organization_id
      AND b.live_session_id = NEW.live_session_id
      AND b.pdf_document_id = NEW.pdf_document_id
      AND NEW.page_number BETWEEN 1 AND d.page_count
  ) THEN RAISE(ABORT, 'pdf page event is inconsistent') END;
END;

CREATE TRIGGER trg_comment_page_links_consistency_insert
BEFORE INSERT ON comment_page_links
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM session_pdf_bindings b
    JOIN pdf_documents d
      ON d.id = b.pdf_document_id
     AND d.organization_id = b.organization_id
    WHERE b.id = NEW.binding_id
      AND b.organization_id = NEW.organization_id
      AND b.live_session_id = NEW.live_session_id
      AND b.pdf_document_id = NEW.pdf_document_id
      AND NEW.page_number BETWEEN 1 AND d.page_count
  ) THEN RAISE(ABORT, 'comment page link is inconsistent') END;
END;

CREATE TRIGGER trg_understanding_signals_consistency_insert
BEFORE INSERT ON understanding_signals
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM session_pdf_bindings b
    JOIN pdf_documents d
      ON d.id = b.pdf_document_id
     AND d.organization_id = b.organization_id
    WHERE b.id = NEW.binding_id
      AND b.organization_id = NEW.organization_id
      AND b.live_session_id = NEW.live_session_id
      AND b.pdf_document_id = NEW.pdf_document_id
      AND NEW.page_number BETWEEN 1 AND d.page_count
  ) THEN RAISE(ABORT, 'understanding signal is inconsistent') END;
END;

CREATE TRIGGER trg_understanding_signals_consistency_update
BEFORE UPDATE OF organization_id, live_session_id, binding_id, pdf_document_id, page_number
ON understanding_signals
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM session_pdf_bindings b
    JOIN pdf_documents d
      ON d.id = b.pdf_document_id
     AND d.organization_id = b.organization_id
    WHERE b.id = NEW.binding_id
      AND b.organization_id = NEW.organization_id
      AND b.live_session_id = NEW.live_session_id
      AND b.pdf_document_id = NEW.pdf_document_id
      AND NEW.page_number BETWEEN 1 AND d.page_count
  ) THEN RAISE(ABORT, 'understanding signal is inconsistent') END;
END;

CREATE TRIGGER trg_analytics_snapshots_consistency_insert
BEFORE INSERT ON analytics_snapshots
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM session_pdf_bindings b
    WHERE b.id = NEW.binding_id
      AND b.organization_id = NEW.organization_id
      AND b.live_session_id = NEW.live_session_id
      AND b.pdf_document_id = NEW.pdf_document_id
  ) THEN RAISE(ABORT, 'analytics snapshot is inconsistent') END;
END;

CREATE TRIGGER trg_pdf_documents_identity_immutable
BEFORE UPDATE OF id, organization_id, sha256_hex, page_count, file_size_bytes, created_by_user_id, created_at
ON pdf_documents
BEGIN
  SELECT RAISE(ABORT, 'pdf document identity is immutable');
END;

CREATE TRIGGER trg_session_pdf_bindings_identity_immutable
BEFORE UPDATE OF id, organization_id, live_session_id, pdf_document_id, bound_by_user_id, bound_at
ON session_pdf_bindings
BEGIN
  SELECT RAISE(ABORT, 'pdf binding identity is immutable');
END;

CREATE TRIGGER trg_pdf_pages_identity_immutable
BEFORE UPDATE OF pdf_document_id, page_number, organization_id, first_seen_at
ON pdf_pages
BEGIN
  SELECT RAISE(ABORT, 'pdf page identity is immutable');
END;

CREATE TRIGGER trg_pdf_page_events_immutable
BEFORE UPDATE ON pdf_page_events
BEGIN
  SELECT RAISE(ABORT, 'pdf page event is immutable');
END;

CREATE TRIGGER trg_comment_page_links_immutable
BEFORE UPDATE ON comment_page_links
BEGIN
  SELECT RAISE(ABORT, 'comment page link is immutable');
END;

CREATE TRIGGER trg_understanding_signals_identity_immutable
BEFORE UPDATE OF id, organization_id, live_session_id, participant_id, binding_id, pdf_document_id, page_number, created_at
ON understanding_signals
BEGIN
  SELECT RAISE(ABORT, 'understanding signal identity is immutable');
END;

CREATE TRIGGER trg_analytics_snapshots_immutable
BEFORE UPDATE ON analytics_snapshots
BEGIN
  SELECT RAISE(ABORT, 'analytics snapshot is immutable');
END;
