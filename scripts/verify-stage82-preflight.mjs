import { spawnSync } from "node:child_process";

const DATABASE = "class_comment_db_v2";
const sql = `
SELECT 'audit_logs.actor_user' AS check_name, COUNT(*) AS violation_count
FROM audit_logs a
WHERE a.actor_user_id IS NOT NULL AND a.organization_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=a.organization_id AND m.user_id=a.actor_user_id)
UNION ALL SELECT 'comment_events.actor_user', COUNT(*) FROM comment_events e
WHERE e.actor_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=e.organization_id AND m.user_id=e.actor_user_id)
UNION ALL SELECT 'comment_moderation_actions.actor_user', COUNT(*) FROM comment_moderation_actions a
WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=a.organization_id AND m.user_id=a.actor_user_id)
UNION ALL SELECT 'session_moderation_settings.updated_by', COUNT(*) FROM session_moderation_settings x
WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.updated_by_user_id)
UNION ALL SELECT 'content_filter_terms.created_by', COUNT(*) FROM content_filter_terms x
WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.created_by_user_id)
UNION ALL SELECT 'organization_content_filter_policies.updated_by', COUNT(*) FROM organization_content_filter_policies x
WHERE x.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.updated_by_user_id)
UNION ALL SELECT 'session_content_filter_settings.updated_by', COUNT(*) FROM session_content_filter_settings x
WHERE x.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.updated_by_user_id)
UNION ALL SELECT 'content_filter_pack_installs.installed_by', COUNT(*) FROM content_filter_pack_installs x
WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.installed_by_user_id)
UNION ALL SELECT 'organization_ai_settings.updated_by', COUNT(*) FROM organization_ai_settings x
WHERE x.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.updated_by_user_id)
UNION ALL SELECT 'session_ai_settings.updated_by', COUNT(*) FROM session_ai_settings x
WHERE x.updated_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.updated_by_user_id)
UNION ALL SELECT 'organization_origins.created_by', COUNT(*) FROM organization_origins x
WHERE x.created_by_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.created_by_user_id)
UNION ALL SELECT 'pdf_documents.created_by', COUNT(*) FROM pdf_documents x
WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.created_by_user_id)
UNION ALL SELECT 'organization_invitations.accepted_user', COUNT(*) FROM organization_invitations x
WHERE x.accepted_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.accepted_user_id)
UNION ALL SELECT 'realtime_connection_tickets.user', COUNT(*) FROM realtime_connection_tickets x
WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=x.organization_id AND m.user_id=x.user_id)
UNION ALL SELECT 'realtime_connection_tickets.auth_session', COUNT(*) FROM realtime_connection_tickets x
WHERE NOT EXISTS (SELECT 1 FROM auth_sessions a WHERE a.id=x.auth_session_id AND a.organization_id=x.organization_id AND a.user_id=x.user_id)
UNION ALL SELECT 'realtime_events.source_comment', COUNT(*) FROM realtime_events x
WHERE x.source_comment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.id=x.source_comment_id AND c.organization_id=x.organization_id AND c.live_session_id=x.live_session_id)
UNION ALL SELECT 'comment_filter_matches.term', COUNT(*) FROM comment_filter_matches x
WHERE x.term_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_filter_terms t WHERE t.id=x.term_id AND t.organization_id=x.organization_id)
UNION ALL SELECT 'ai_results.job_context', COUNT(*) FROM ai_results x
WHERE NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id=x.job_id AND j.organization_id=x.organization_id AND j.live_session_id=x.live_session_id AND j.comment_id=x.comment_id AND j.job_type='moderation')
UNION ALL SELECT 'translations.job_context', COUNT(*) FROM translations x
WHERE NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id=x.job_id AND j.organization_id=x.organization_id AND j.live_session_id=x.live_session_id AND j.comment_id=x.comment_id AND j.job_type='translation' AND j.target_language=x.target_language)
UNION ALL SELECT 'ai_usage_events.job_context', COUNT(*) FROM ai_usage_events x
WHERE NOT EXISTS (SELECT 1 FROM ai_jobs j WHERE j.id=x.job_id AND j.organization_id=x.organization_id AND j.job_type=x.job_type AND x.attempt_number<=j.attempt_count)
UNION ALL SELECT 'content_filter_terms.active_limit', COUNT(*) FROM (
  SELECT organization_id FROM content_filter_terms WHERE deleted_at IS NULL GROUP BY organization_id HAVING COUNT(*)>2000
);`;

const tableRows = query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
const tableNames = new Set(tableRows.map((row) => String(row.name || "")));
if (!tableNames.has("organizations")) {
  if (tableNames.size === 0 || (tableNames.size === 1 && tableNames.has("d1_migrations"))) {
    console.log("Stage 8.2 existing-data preflight passed: DB_V2 is fresh.");
    process.exit(0);
  }
  console.error("DB_V2 contains an incomplete unknown schema. Do not apply migrations until the resource is identified.");
  process.exit(1);
}
const prerequisites = [
  "organization_members", "audit_logs", "comment_events", "comment_moderation_actions",
  "session_moderation_settings", "content_filter_terms", "organization_content_filter_policies",
  "session_content_filter_settings", "content_filter_pack_installs", "organization_ai_settings",
  "session_ai_settings", "organization_origins", "pdf_documents", "organization_invitations",
  "realtime_connection_tickets", "realtime_events", "comment_filter_matches", "ai_results",
  "translations", "ai_usage_events", "ai_jobs", "auth_sessions", "comments"
];
const missing = prerequisites.filter((name) => !tableNames.has(name));
if (missing.length) {
  console.error(`DB_V2 is not fresh and lacks Stage 8.1 prerequisite table(s): ${missing.join(", ")}`);
  process.exit(1);
}
const rows = query(sql);
const invalid = rows.filter((row) => Number(row?.violation_count) > 0);
for (const row of rows) console.log(`${row.check_name}\t${Number(row.violation_count)}`);
if (invalid.length) {
  console.error("Stage 8.2 migration must not be applied until every listed violation is resolved through a reviewed repair procedure.");
  process.exit(1);
}
console.log(`Stage 8.2 existing-data preflight passed (${rows.length} checks).`);

function query(command) {
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", [
    "wrangler", "d1", "execute", DATABASE, "--remote", "--json", "--command", command
  ], { cwd: process.cwd(), env: process.env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "Stage 8.2 preflight query failed.\n");
    process.exit(result.status || 1);
  }
  let payload;
  try { payload = JSON.parse(result.stdout.replace(/^\uFEFF/, "")); }
  catch (error) { console.error(`Unable to parse Wrangler D1 JSON: ${error.message}`); process.exit(1); }
  const executions = Array.isArray(payload) ? payload : [payload];
  if (!executions.length || executions.some((entry) => entry?.success === false)) {
    console.error("Stage 8.2 preflight query reported failure.");
    process.exit(1);
  }
  return executions.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
}
