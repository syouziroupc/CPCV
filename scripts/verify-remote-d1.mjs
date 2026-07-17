import { spawnSync } from "node:child_process";

const DATABASE = "class_comment_db_v2";

const requiredTables = [
  "organizations", "users", "organization_members", "auth_sessions",
  "password_reset_tokens", "live_sessions", "audit_logs", "participants",
  "comments", "comment_events", "auth_session_csrf_tokens",
  "session_moderation_settings", "comment_moderation_actions",
  "realtime_session_state", "realtime_events", "realtime_connection_tickets",
  "pending_registrations", "organization_origins", "organization_quotas",
  "organization_invitations", "email_change_requests", "email_enrollment_requests",
  "email_delivery_attempts", "auth_public_counters", "organization_email_events",
  "organization_ai_settings", "session_ai_settings", "ai_jobs", "ai_results",
  "translations", "ai_usage_events", "content_filter_terms",
  "organization_content_filter_policies", "session_content_filter_settings",
  "comment_filter_matches", "content_filter_pack_installs",
  "pdf_documents", "session_pdf_bindings", "pdf_pages", "session_pdf_state",
  "pdf_page_events", "comment_page_links", "understanding_signals",
  "analytics_snapshots"
];
const schemaRows = query(`SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;`);
const tableNames = new Set(schemaRows.map((row) => String(row.name || "")));
const missingTables = requiredTables.filter((name) => !tableNames.has(name));
assert(missingTables.length === 0, `DB_V2 is missing required table(s): ${missingTables.join(", ")}`);

for (const [prefix, label] of [
  ["0006_manual_moderation", "Stage 5 migration 0006_manual_moderation"],
  ["0007_realtime", "Stage 6 migration 0007_realtime"],
  ["0008_email_auth", "Stage 6.5-A migration 0008_email_auth"],
  ["0009_account_lifecycle", "Stage 6.5-B/C migration 0009_account_lifecycle"],
  ["0010_ai_moderation_translation", "Stage 7 migration 0010_ai_moderation_translation"],
  ["0011_dictionary_content_filter", "Stage 7.5 migration 0011_dictionary_content_filter"],
  ["0012_multilingual_filter_usability", "Stage 7.6 migration 0012_multilingual_filter_usability"],
  ["0013_bilingual_filter_translation_safety", "Stage 7.7 migration 0013_bilingual_filter_translation_safety"],
  ["0014_filter_pack_expansion", "Stage 7.8 migration 0014_filter_pack_expansion"],
  ["0015_pdf_page_analytics", "Stage 8 migration 0015_pdf_page_analytics"],
  ["0016_stage08_precision_hardening", "Stage 8.1 migration 0016_stage08_precision_hardening"],
  ["0017_final_integrity_hardening", "Stage 8.2 migration 0017_final_integrity_hardening"]
]) {
  const rows = query(`SELECT name FROM d1_migrations WHERE name LIKE '${prefix}%' LIMIT 1;`);
  assert(rows.length === 1, `DB_V2 ${label} is not recorded.`);
}

const moderationTriggers = query(`SELECT name FROM sqlite_schema WHERE type='trigger' AND name IN ('trg_comments_moderation_transition','trg_comments_moderation_timestamp') ORDER BY name;`);
assert(moderationTriggers.length === 2, "DB_V2 moderation guard triggers are incomplete.");

const realtimeTriggers = query(`SELECT name FROM sqlite_schema WHERE type='trigger' AND name IN ('trg_realtime_comment_visible_insert','trg_realtime_comment_moderation_update') ORDER BY name;`);
assert(realtimeTriggers.length === 2, "DB_V2 realtime event triggers are incomplete.");

const quotaTriggerNames = [
  "trg_organization_members_active_limit_insert",
  "trg_organization_members_active_limit_update",
  "trg_organization_invitations_pending_limit",
  "trg_organization_invitation_daily_email_limit"
];
const quotaTriggers = query(`SELECT name FROM sqlite_schema WHERE type='trigger' AND name IN (${quotaTriggerNames.map((name) => `'${name}'`).join(",")}) ORDER BY name;`);
assert(quotaTriggers.length === quotaTriggerNames.length, "DB_V2 organization quota triggers are incomplete.");


const stage8TriggerNames = [
  "trg_pdf_pages_document_bounds_insert",
  "trg_pdf_pages_document_bounds_update",
  "trg_session_pdf_state_consistency_insert",
  "trg_session_pdf_state_consistency_update",
  "trg_pdf_page_events_consistency_insert",
  "trg_comment_page_links_consistency_insert",
  "trg_understanding_signals_consistency_insert",
  "trg_understanding_signals_consistency_update",
  "trg_analytics_snapshots_consistency_insert",
  "trg_pdf_documents_identity_immutable",
  "trg_session_pdf_bindings_identity_immutable",
  "trg_pdf_pages_identity_immutable",
  "trg_pdf_page_events_immutable",
  "trg_comment_page_links_immutable",
  "trg_understanding_signals_identity_immutable",
  "trg_analytics_snapshots_immutable"
];
const stage8Triggers = query(`SELECT name FROM sqlite_schema WHERE type='trigger' AND name IN (${stage8TriggerNames.map((name) => `'${name}'`).join(",")}) ORDER BY name;`);
assert(stage8Triggers.length === stage8TriggerNames.length, "DB_V2 Stage 8 precision triggers are incomplete.");

const stage82TriggerNames = [
  "trg_audit_logs_actor_org_insert",
  "trg_audit_logs_actor_org_update",
  "trg_comment_events_actor_org_insert",
  "trg_comment_events_actor_org_update",
  "trg_comment_moderation_actions_actor_org_insert",
  "trg_comment_moderation_actions_actor_org_update",
  "trg_session_moderation_settings_updater_org_insert",
  "trg_session_moderation_settings_updater_org_update",
  "trg_content_filter_terms_creator_org_insert",
  "trg_content_filter_terms_creator_org_update",
  "trg_organization_content_filter_policies_updater_org_insert",
  "trg_organization_content_filter_policies_updater_org_update",
  "trg_session_content_filter_settings_updater_org_insert",
  "trg_session_content_filter_settings_updater_org_update",
  "trg_content_filter_pack_installs_installer_org_insert",
  "trg_content_filter_pack_installs_installer_org_update",
  "trg_organization_ai_settings_updater_org_insert",
  "trg_organization_ai_settings_updater_org_update",
  "trg_session_ai_settings_updater_org_insert",
  "trg_session_ai_settings_updater_org_update",
  "trg_organization_origins_creator_org_insert",
  "trg_organization_origins_creator_org_update",
  "trg_pdf_documents_creator_org_insert",
  "trg_pdf_documents_creator_org_update",
  "trg_organization_invitations_accepted_user_org_insert",
  "trg_organization_invitations_accepted_user_org_update",
  "trg_realtime_connection_tickets_user_org_insert",
  "trg_realtime_connection_tickets_user_org_update",
  "trg_realtime_connection_tickets_auth_context_insert",
  "trg_realtime_connection_tickets_auth_context_update",
  "trg_realtime_events_source_comment_insert",
  "trg_realtime_events_source_comment_update",
  "trg_comment_filter_matches_term_org_insert",
  "trg_comment_filter_matches_term_org_update",
  "trg_ai_results_job_context_insert",
  "trg_ai_results_job_context_update",
  "trg_translations_job_context_insert",
  "trg_translations_job_context_update",
  "trg_ai_usage_events_job_context_insert",
  "trg_ai_usage_events_job_context_update",
  "trg_content_filter_terms_limit_insert",
  "trg_content_filter_terms_limit_update",
];
const stage82Triggers = query(`SELECT name FROM sqlite_schema WHERE type='trigger' AND name IN (${stage82TriggerNames.map((name) => `'${name}'`).join(",")}) ORDER BY name;`);
assert(stage82Triggers.length === stage82TriggerNames.length, `DB_V2 Stage 8.2 integrity triggers are incomplete (${stage82Triggers.length}/${stage82TriggerNames.length}).`);

const foreignKeys = query("PRAGMA foreign_key_check;");
assert(foreignKeys.length === 0, `DB_V2 foreign_key_check returned ${foreignKeys.length} row(s).`);

const quick = query("PRAGMA quick_check;");
assert(quick.length === 1 && String(quick[0]?.quick_check ?? "").toLowerCase() === "ok", "DB_V2 quick_check failed.");

const owners = query(`SELECT COUNT(*) AS active_owner_count
  FROM organization_members AS m
  JOIN organizations AS o ON o.id = m.organization_id
  JOIN users AS u ON u.id = m.user_id
  WHERE m.role='owner' AND m.status='active'
    AND o.status='active' AND u.status='active';`);
const ownerCount = Number(owners[0]?.active_owner_count);
assert(Number.isSafeInteger(ownerCount) && ownerCount >= 1, "DB_V2 has no active Owner in an active organization.");

const unverifiedOwners = query(`SELECT COUNT(*) AS unverified_owner_count
  FROM organization_members AS m
  JOIN organizations AS o ON o.id = m.organization_id
  JOIN users AS u ON u.id = m.user_id
  WHERE m.role='owner' AND m.status='active'
    AND o.status='active' AND u.status='active'
    AND (u.email IS NULL OR u.email_verified_at IS NULL);`);
const unverifiedOwnerCount = Number(unverifiedOwners[0]?.unverified_owner_count);
assert(Number.isSafeInteger(unverifiedOwnerCount) && unverifiedOwnerCount >= 0, "DB_V2 returned an invalid unverified Owner count.");
if (unverifiedOwnerCount > 0) {
  console.warn(`[WARN] ${unverifiedOwnerCount} active Owner account(s) do not have a verified email. Keep EMAIL_AUTH_REQUIRED=0 until npm run verify:email-auth-ready succeeds.`);
}

console.log(`remote DB_V2 health verified; ${requiredTables.length} required tables, migrations through Stage 8.2, moderation/realtime/quota/Stage8 precision and Stage8.2 integrity triggers (${stage82TriggerNames.length}), active Owners: ${ownerCount}, unverified Owners: ${unverifiedOwnerCount}`);

function query(sql) {
  const result = spawnSync(npxCommand(), [
    "wrangler", "d1", "execute", DATABASE, "--remote", "--json", "--command", sql
  ], { cwd: process.cwd(), env: process.env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "Remote D1 query failed.\n");
    process.exit(result.status || 1);
  }
  let payload;
  try { payload = JSON.parse(result.stdout.replace(/^\uFEFF/, "")); }
  catch (error) {
    console.error(`Unable to parse Wrangler D1 JSON: ${error.message}`);
    process.exit(1);
  }
  const executions = Array.isArray(payload) ? payload : [payload];
  assert(executions.length > 0 && executions.every((entry) => entry?.success !== false), "Remote D1 query reported failure.");
  return executions.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
}

function npxCommand() { return process.platform === "win32" ? "npx.cmd" : "npx"; }
function assert(condition, message) { if (!condition) { console.error(message); process.exit(1); } }
