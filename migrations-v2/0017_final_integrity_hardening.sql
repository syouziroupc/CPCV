-- CPCV Stage 8.2 final integrity hardening.
-- Enforce organization/context boundaries that single-column foreign keys cannot express.
PRAGMA foreign_keys = ON;

CREATE TRIGGER trg_audit_logs_actor_org_insert
BEFORE INSERT ON audit_logs
WHEN NEW.actor_user_id IS NOT NULL AND NEW.organization_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.actor_user_id )
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AUDIT_ACTOR');
END;

CREATE TRIGGER trg_audit_logs_actor_org_update
BEFORE UPDATE OF actor_user_id, organization_id, actor_role ON audit_logs
WHEN NEW.actor_user_id IS NOT NULL AND NEW.organization_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.actor_user_id )
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AUDIT_ACTOR');
END;

CREATE TRIGGER trg_comment_events_actor_org_insert
BEFORE INSERT ON comment_events
WHEN NEW.actor_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.actor_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_COMMENT_EVENT_ACTOR');
END;

CREATE TRIGGER trg_comment_events_actor_org_update
BEFORE UPDATE OF actor_user_id, organization_id ON comment_events
WHEN NEW.actor_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.actor_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_COMMENT_EVENT_ACTOR');
END;

CREATE TRIGGER trg_comment_moderation_actions_actor_org_insert
BEFORE INSERT ON comment_moderation_actions
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.actor_user_id )
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_MODERATION_ACTOR');
END;

CREATE TRIGGER trg_comment_moderation_actions_actor_org_update
BEFORE UPDATE OF actor_user_id, organization_id, actor_role ON comment_moderation_actions
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.actor_user_id )
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_MODERATION_ACTOR');
END;

CREATE TRIGGER trg_session_moderation_settings_updater_org_insert
BEFORE INSERT ON session_moderation_settings
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_MODERATION_UPDATER');
END;

CREATE TRIGGER trg_session_moderation_settings_updater_org_update
BEFORE UPDATE OF updated_by_user_id, organization_id ON session_moderation_settings
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_MODERATION_UPDATER');
END;

CREATE TRIGGER trg_content_filter_terms_creator_org_insert
BEFORE INSERT ON content_filter_terms
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.created_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_FILTER_TERM_CREATOR');
END;

CREATE TRIGGER trg_content_filter_terms_creator_org_update
BEFORE UPDATE OF created_by_user_id, organization_id ON content_filter_terms
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.created_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_FILTER_TERM_CREATOR');
END;

CREATE TRIGGER trg_organization_content_filter_policies_updater_org_insert
BEFORE INSERT ON organization_content_filter_policies
WHEN NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_FILTER_POLICY_UPDATER');
END;

CREATE TRIGGER trg_organization_content_filter_policies_updater_org_update
BEFORE UPDATE OF updated_by_user_id, organization_id ON organization_content_filter_policies
WHEN NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_FILTER_POLICY_UPDATER');
END;

CREATE TRIGGER trg_session_content_filter_settings_updater_org_insert
BEFORE INSERT ON session_content_filter_settings
WHEN NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_SESSION_FILTER_UPDATER');
END;

CREATE TRIGGER trg_session_content_filter_settings_updater_org_update
BEFORE UPDATE OF updated_by_user_id, organization_id ON session_content_filter_settings
WHEN NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_SESSION_FILTER_UPDATER');
END;

CREATE TRIGGER trg_content_filter_pack_installs_installer_org_insert
BEFORE INSERT ON content_filter_pack_installs
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.installed_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_FILTER_PACK_INSTALLER');
END;

CREATE TRIGGER trg_content_filter_pack_installs_installer_org_update
BEFORE UPDATE OF installed_by_user_id, organization_id ON content_filter_pack_installs
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.installed_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_FILTER_PACK_INSTALLER');
END;

CREATE TRIGGER trg_organization_ai_settings_updater_org_insert
BEFORE INSERT ON organization_ai_settings
WHEN NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AI_ORG_UPDATER');
END;

CREATE TRIGGER trg_organization_ai_settings_updater_org_update
BEFORE UPDATE OF updated_by_user_id, organization_id ON organization_ai_settings
WHEN NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AI_ORG_UPDATER');
END;

CREATE TRIGGER trg_session_ai_settings_updater_org_insert
BEFORE INSERT ON session_ai_settings
WHEN NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AI_SESSION_UPDATER');
END;

CREATE TRIGGER trg_session_ai_settings_updater_org_update
BEFORE UPDATE OF updated_by_user_id, organization_id ON session_ai_settings
WHEN NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.updated_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AI_SESSION_UPDATER');
END;

CREATE TRIGGER trg_organization_origins_creator_org_insert
BEFORE INSERT ON organization_origins
WHEN NEW.created_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.created_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_ORIGIN_CREATOR');
END;

CREATE TRIGGER trg_organization_origins_creator_org_update
BEFORE UPDATE OF created_by_user_id, organization_id ON organization_origins
WHEN NEW.created_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.created_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_ORIGIN_CREATOR');
END;

CREATE TRIGGER trg_pdf_documents_creator_org_insert
BEFORE INSERT ON pdf_documents
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.created_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_PDF_CREATOR');
END;

CREATE TRIGGER trg_pdf_documents_creator_org_update
BEFORE UPDATE OF created_by_user_id, organization_id ON pdf_documents
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.created_by_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_PDF_CREATOR');
END;

CREATE TRIGGER trg_organization_invitations_accepted_user_org_insert
BEFORE INSERT ON organization_invitations
WHEN NEW.accepted_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.accepted_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_INVITATION_ACCEPTOR');
END;

CREATE TRIGGER trg_organization_invitations_accepted_user_org_update
BEFORE UPDATE OF accepted_user_id, organization_id ON organization_invitations
WHEN NEW.accepted_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.accepted_user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_INVITATION_ACCEPTOR');
END;

CREATE TRIGGER trg_realtime_connection_tickets_user_org_insert
BEFORE INSERT ON realtime_connection_tickets
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_REALTIME_USER');
END;

CREATE TRIGGER trg_realtime_connection_tickets_user_org_update
BEFORE UPDATE OF user_id, organization_id, role ON realtime_connection_tickets
WHEN NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_REALTIME_USER');
END;

CREATE TRIGGER trg_realtime_connection_tickets_auth_context_insert
BEFORE INSERT ON realtime_connection_tickets
WHEN NOT EXISTS (SELECT 1 FROM auth_sessions a WHERE a.id = NEW.auth_session_id AND a.organization_id = NEW.organization_id AND a.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_REALTIME_AUTH_SESSION');
END;

CREATE TRIGGER trg_realtime_connection_tickets_auth_context_update
BEFORE UPDATE OF auth_session_id, organization_id, user_id ON realtime_connection_tickets
WHEN NOT EXISTS (SELECT 1 FROM auth_sessions a WHERE a.id = NEW.auth_session_id AND a.organization_id = NEW.organization_id AND a.user_id = NEW.user_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_REALTIME_AUTH_SESSION');
END;

CREATE TRIGGER trg_realtime_events_source_comment_insert
BEFORE INSERT ON realtime_events
WHEN NEW.source_comment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.id = NEW.source_comment_id AND c.organization_id = NEW.organization_id AND c.live_session_id = NEW.live_session_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_REALTIME_SOURCE_COMMENT');
END;

CREATE TRIGGER trg_realtime_events_source_comment_update
BEFORE UPDATE OF source_comment_id, organization_id, live_session_id ON realtime_events
WHEN NEW.source_comment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.id = NEW.source_comment_id AND c.organization_id = NEW.organization_id AND c.live_session_id = NEW.live_session_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_REALTIME_SOURCE_COMMENT');
END;

CREATE TRIGGER trg_comment_filter_matches_term_org_insert
BEFORE INSERT ON comment_filter_matches
WHEN NEW.term_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_filter_terms t WHERE t.id = NEW.term_id AND t.organization_id = NEW.organization_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_FILTER_MATCH_TERM');
END;

CREATE TRIGGER trg_comment_filter_matches_term_org_update
BEFORE UPDATE OF term_id, organization_id ON comment_filter_matches
WHEN NEW.term_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_filter_terms t WHERE t.id = NEW.term_id AND t.organization_id = NEW.organization_id)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_FILTER_MATCH_TERM');
END;

CREATE TRIGGER trg_ai_results_job_context_insert
BEFORE INSERT ON ai_results
WHEN NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = NEW.job_id AND j.organization_id = NEW.organization_id AND j.live_session_id = NEW.live_session_id AND j.comment_id = NEW.comment_id AND j.job_type = 'moderation')
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AI_RESULT_JOB');
END;

CREATE TRIGGER trg_ai_results_job_context_update
BEFORE UPDATE OF job_id, organization_id, live_session_id, comment_id ON ai_results
WHEN NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = NEW.job_id AND j.organization_id = NEW.organization_id AND j.live_session_id = NEW.live_session_id AND j.comment_id = NEW.comment_id AND j.job_type = 'moderation')
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AI_RESULT_JOB');
END;

CREATE TRIGGER trg_translations_job_context_insert
BEFORE INSERT ON translations
WHEN NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = NEW.job_id AND j.organization_id = NEW.organization_id AND j.live_session_id = NEW.live_session_id AND j.comment_id = NEW.comment_id AND j.job_type = 'translation' AND j.target_language = NEW.target_language)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_TRANSLATION_JOB');
END;

CREATE TRIGGER trg_translations_job_context_update
BEFORE UPDATE OF job_id, organization_id, live_session_id, comment_id, target_language ON translations
WHEN NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = NEW.job_id AND j.organization_id = NEW.organization_id AND j.live_session_id = NEW.live_session_id AND j.comment_id = NEW.comment_id AND j.job_type = 'translation' AND j.target_language = NEW.target_language)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_TRANSLATION_JOB');
END;

CREATE TRIGGER trg_ai_usage_events_job_context_insert
BEFORE INSERT ON ai_usage_events
WHEN NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = NEW.job_id AND j.organization_id = NEW.organization_id AND j.job_type = NEW.job_type AND NEW.attempt_number <= j.attempt_count)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AI_USAGE_JOB');
END;

CREATE TRIGGER trg_ai_usage_events_job_context_update
BEFORE UPDATE OF job_id, organization_id, job_type, attempt_number ON ai_usage_events
WHEN NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = NEW.job_id AND j.organization_id = NEW.organization_id AND j.job_type = NEW.job_type AND NEW.attempt_number <= j.attempt_count)
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_AI_USAGE_JOB');
END;


-- Enforce the documented per-organization dictionary ceiling in the database.
-- The INSERT trigger excludes rows that will resolve to an existing active term
-- or existing pack key so legitimate UPSERT upgrades still work at the limit.
CREATE TRIGGER trg_content_filter_terms_limit_insert
BEFORE INSERT ON content_filter_terms
WHEN NEW.deleted_at IS NULL
 AND NOT EXISTS (
   SELECT 1 FROM content_filter_terms t
   WHERE t.organization_id = NEW.organization_id
     AND t.compact_term = NEW.compact_term
     AND t.category = NEW.category
     AND t.language_code = NEW.language_code
     AND t.boundary_mode = NEW.boundary_mode
     AND t.deleted_at IS NULL
 )
 AND NOT EXISTS (
   SELECT 1 FROM content_filter_terms t
   WHERE NEW.source_pack IS NOT NULL
     AND NEW.source_pack_term_key IS NOT NULL
     AND t.organization_id = NEW.organization_id
     AND t.source_pack = NEW.source_pack
     AND t.source_pack_term_key = NEW.source_pack_term_key
     AND t.deleted_at IS NULL
 )
 AND (SELECT COUNT(*) FROM content_filter_terms t
      WHERE t.organization_id = NEW.organization_id AND t.deleted_at IS NULL) >= 2000
BEGIN
  SELECT RAISE(ABORT, 'FILTER_TERM_LIMIT_REACHED');
END;

CREATE TRIGGER trg_content_filter_terms_limit_update
BEFORE UPDATE OF organization_id, deleted_at ON content_filter_terms
WHEN NEW.deleted_at IS NULL
 AND (OLD.deleted_at IS NOT NULL OR OLD.organization_id <> NEW.organization_id)
 AND (SELECT COUNT(*) FROM content_filter_terms t
      WHERE t.organization_id = NEW.organization_id
        AND t.deleted_at IS NULL
        AND t.id <> OLD.id) >= 2000
BEGIN
  SELECT RAISE(ABORT, 'FILTER_TERM_LIMIT_REACHED');
END;

-- Abort deployment instead of silently accepting an already-corrupt over-limit database.
CREATE TABLE migration_0017_term_limit_guard (id INTEGER PRIMARY KEY);
CREATE TRIGGER trg_migration_0017_term_limit_guard
BEFORE INSERT ON migration_0017_term_limit_guard
WHEN EXISTS (
  SELECT 1 FROM content_filter_terms
  WHERE deleted_at IS NULL
  GROUP BY organization_id
  HAVING COUNT(*) > 2000
)
BEGIN
  SELECT RAISE(ABORT, 'FILTER_TERM_LIMIT_EXISTING_VIOLATION');
END;
INSERT INTO migration_0017_term_limit_guard (id) VALUES (1);
DROP TRIGGER trg_migration_0017_term_limit_guard;
DROP TABLE migration_0017_term_limit_guard;

-- Validate existing rows without rewriting large production tables.
CREATE TABLE migration_0017_boundary_guard (id INTEGER PRIMARY KEY);
CREATE TRIGGER trg_migration_0017_boundary_guard
BEFORE INSERT ON migration_0017_boundary_guard
WHEN
  EXISTS (SELECT 1 FROM audit_logs a WHERE a.actor_user_id IS NOT NULL AND a.organization_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = a.organization_id AND m.user_id = a.actor_user_id))
  OR EXISTS (SELECT 1 FROM comment_events e WHERE e.actor_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = e.organization_id AND m.user_id = e.actor_user_id))
  OR EXISTS (SELECT 1 FROM comment_moderation_actions a WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = a.organization_id AND m.user_id = a.actor_user_id))
  OR EXISTS (SELECT 1 FROM session_moderation_settings x WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.updated_by_user_id))
  OR EXISTS (SELECT 1 FROM content_filter_terms x WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.created_by_user_id))
  OR EXISTS (SELECT 1 FROM organization_content_filter_policies x WHERE x.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.updated_by_user_id))
  OR EXISTS (SELECT 1 FROM session_content_filter_settings x WHERE x.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.updated_by_user_id))
  OR EXISTS (SELECT 1 FROM content_filter_pack_installs x WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.installed_by_user_id))
  OR EXISTS (SELECT 1 FROM organization_ai_settings x WHERE x.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.updated_by_user_id))
  OR EXISTS (SELECT 1 FROM session_ai_settings x WHERE x.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.updated_by_user_id))
  OR EXISTS (SELECT 1 FROM organization_origins x WHERE x.created_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.created_by_user_id))
  OR EXISTS (SELECT 1 FROM pdf_documents x WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.created_by_user_id))
  OR EXISTS (SELECT 1 FROM organization_invitations x WHERE x.accepted_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.accepted_user_id))
  OR EXISTS (SELECT 1 FROM realtime_connection_tickets x WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = x.organization_id AND m.user_id = x.user_id))
  OR EXISTS (SELECT 1 FROM realtime_connection_tickets x WHERE NOT EXISTS (SELECT 1 FROM auth_sessions a WHERE a.id = x.auth_session_id AND a.organization_id = x.organization_id AND a.user_id = x.user_id))
  OR EXISTS (SELECT 1 FROM realtime_events x WHERE x.source_comment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.id = x.source_comment_id AND c.organization_id = x.organization_id AND c.live_session_id = x.live_session_id))
  OR EXISTS (SELECT 1 FROM comment_filter_matches x WHERE x.term_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_filter_terms t WHERE t.id = x.term_id AND t.organization_id = x.organization_id))
  OR EXISTS (SELECT 1 FROM ai_results x WHERE NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = x.job_id AND j.organization_id = x.organization_id AND j.live_session_id = x.live_session_id AND j.comment_id = x.comment_id AND j.job_type = 'moderation'))
  OR EXISTS (SELECT 1 FROM translations x WHERE NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = x.job_id AND j.organization_id = x.organization_id AND j.live_session_id = x.live_session_id AND j.comment_id = x.comment_id AND j.job_type = 'translation' AND j.target_language = x.target_language))
  OR EXISTS (SELECT 1 FROM ai_usage_events x WHERE NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id = x.job_id AND j.organization_id = x.organization_id AND j.job_type = x.job_type AND x.attempt_number <= j.attempt_count))
BEGIN
  SELECT RAISE(ABORT, 'ORG_BOUNDARY_EXISTING_VIOLATION');
END;
INSERT INTO migration_0017_boundary_guard (id) VALUES (1);
DROP TRIGGER trg_migration_0017_boundary_guard;
DROP TABLE migration_0017_boundary_guard;
