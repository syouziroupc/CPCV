import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TEST_DIR = resolve(ROOT, `.stage02-test-${process.pid}`);
const DB_DIR = resolve(TEST_DIR, "schema-db");
const BOOTSTRAP_DB_DIR = resolve(TEST_DIR, "bootstrap-db");
const STAGE02_MIGRATIONS_DIR = resolve(TEST_DIR, "stage02-migrations");
const STAGE02_CONFIG = resolve(TEST_DIR, "wrangler.stage02-test.toml");
const NODE = process.execPath;
const WRANGLER_CLI = resolve(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const results = [];

const T0 = "2026-07-12T00:00:00.000Z";
const T1 = "2026-07-12T00:01:00.000Z";
const T2 = "2026-07-12T01:00:00.000Z";
const T3 = "2026-07-12T02:00:00.000Z";
const T4 = "2026-07-12T03:00:00.000Z";

try {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(STAGE02_MIGRATIONS_DIR, { recursive: true });
  copyFileSync(resolve(ROOT, "migrations-v2/0001_initial_schema.sql"), resolve(STAGE02_MIGRATIONS_DIR, "0001_initial_schema.sql"));
  copyFileSync(resolve(ROOT, "migrations-v2/0002_auth_security.sql"), resolve(STAGE02_MIGRATIONS_DIR, "0002_auth_security.sql"));
  writeFileSync(STAGE02_CONFIG, [
    'name = "cpcv-stage02-schema-test"',
    'main = "src/index.js"',
    'compatibility_date = "2026-06-17"',
    '',
    '[[d1_databases]]',
    'binding = "DB_V2"',
    'database_name = "class_comment_db_v2"',
    `migrations_dir = "${STAGE02_MIGRATIONS_DIR.replaceAll("\\", "/")}"`,
    ''
  ].join("\n"));

  const firstMigration = wrangler([
    "d1", "migrations", "apply", "DB_V2", "--local", "--persist-to", DB_DIR
  ]);
  assert("migration applies to an empty local D1", firstMigration.status === 0, firstMigration);
  assert("first migration run applies 0001_initial_schema.sql", firstMigration.stdout.includes("0001_initial_schema.sql"));

  const secondMigration = wrangler([
    "d1", "migrations", "apply", "DB_V2", "--local", "--persist-to", DB_DIR
  ]);
  assert("second migration apply exits successfully", secondMigration.status === 0, secondMigration);
  assert(
    "second migration apply is a no-op",
    /No migrations to apply|No migrations to be applied|Migrations to be applied:\s*\n\s*┌/i.test(secondMigration.stdout)
      ? /No migrations to apply|No migrations to be applied/i.test(secondMigration.stdout)
      : !secondMigration.stdout.includes("0001_initial_schema.sql")
  );
  const migrationRows = queryRows(DB_DIR,
    "SELECT name FROM d1_migrations ORDER BY id;"
  );
  assert(
    "migration history contains exactly the Stage 2 and Stage 3-A migrations after the second apply",
    JSON.stringify(migrationRows.map((row) => row.name)) === JSON.stringify([
      "0001_initial_schema.sql",
      "0002_auth_security.sql"
    ]),
    { migrationRows }
  );

  const expectedTables = [
    "audit_logs",
    "auth_sessions",
    "live_sessions",
    "organization_members",
    "organizations",
    "password_reset_tokens",
    "users"
  ];
  const tables = queryRows(DB_DIR,
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' AND substr(name,1,4) <> '_cf_' ORDER BY name;"
  ).map((row) => row.name);
  assert("exactly the seven application tables exist", JSON.stringify(tables) === JSON.stringify(expectedTables), { tables });

  const canonicalSchemaRows = queryRows(DB_DIR, `
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
      AND name <> 'd1_migrations'
      AND substr(name,1,4) <> '_cf_'
      AND sql IS NOT NULL
    ORDER BY type, name;
  `);
  const canonicalSchema = canonicalSchemaRows.map((row) =>
    `${row.type}\t${row.name}\t${row.tbl_name}\t${String(row.sql).replace(/\s+/g, " ").trim()}`
  ).join("\n");
  const canonicalSchemaHash = createHash("sha256").update(canonicalSchema).digest("hex");
  assert(
    "bootstrap schema fingerprint matches the migrated canonical schema",
    canonicalSchemaHash === "62b899df8e4e8be885937a851c8818eec98daffab280b541cfa656838e4146fa",
    { canonicalSchemaHash }
  );

  const schemaRows = queryRows(DB_DIR, `
    SELECT m.name AS table_name, p.cid, p.name, p.type,
           p.[notnull] AS not_null, p.dflt_value, p.pk
    FROM sqlite_schema m
    JOIN pragma_table_info(m.name) p
    WHERE m.type='table'
      AND m.name IN ('organizations','users','organization_members','auth_sessions',
                     'password_reset_tokens','live_sessions','audit_logs')
    ORDER BY m.name, p.cid;
  `);
  const expectedColumns = {
    audit_logs: [
      ["id","TEXT",1,null,1],["organization_id","TEXT",0,null,0],
      ["actor_type","TEXT",1,null,0],["actor_user_id","TEXT",0,null,0],
      ["actor_role","TEXT",0,null,0],["action","TEXT",1,null,0],
      ["target_type","TEXT",0,null,0],["target_id","TEXT",0,null,0],
      ["details_json","TEXT",0,null,0],["created_at","TEXT",1,null,0]
    ],
    auth_sessions: [
      ["id","TEXT",1,null,1],["organization_id","TEXT",1,null,0],
      ["user_id","TEXT",1,null,0],["token_hash","TEXT",1,null,0],
      ["csrf_token_hash","TEXT",1,null,0],["created_at","TEXT",1,null,0],
      ["last_seen_at","TEXT",1,null,0],["idle_expires_at","TEXT",1,null,0],
      ["absolute_expires_at","TEXT",1,null,0],["revoked_at","TEXT",0,null,0]
    ],
    live_sessions: [
      ["id","TEXT",1,null,1],["organization_id","TEXT",1,null,0],
      ["created_by_user_id","TEXT",1,null,0],["public_code","TEXT",1,null,0],
      ["title","TEXT",1,null,0],["posting_enabled","INTEGER",1,"1",0],
      ["comments_visible","INTEGER",1,"1",0],["comment_display_seconds","INTEGER",1,"60",0],
      ["comment_display_mode","TEXT",1,"'stack3'",0],["status","TEXT",1,"'active'",0],
      ["created_at","TEXT",1,null,0],["updated_at","TEXT",1,null,0],
      ["started_at","TEXT",1,null,0],["expires_at","TEXT",1,null,0],
      ["ended_at","TEXT",0,null,0],["deleted_at","TEXT",0,null,0]
    ],
    organization_members: [
      ["organization_id","TEXT",1,null,1],["user_id","TEXT",1,null,2],
      ["role","TEXT",1,null,0],["status","TEXT",1,"'active'",0],
      ["created_at","TEXT",1,null,0],["updated_at","TEXT",1,null,0],
      ["removed_at","TEXT",0,null,0]
    ],
    organizations: [
      ["id","TEXT",1,null,1],["name","TEXT",1,null,0],
      ["status","TEXT",1,"'active'",0],["created_at","TEXT",1,null,0],
      ["updated_at","TEXT",1,null,0],["deleted_at","TEXT",0,null,0]
    ],
    password_reset_tokens: [
      ["id","TEXT",1,null,1],["user_id","TEXT",1,null,0],
      ["token_hash","TEXT",1,null,0],["created_by_user_id","TEXT",0,null,0],
      ["created_at","TEXT",1,null,0],["expires_at","TEXT",1,null,0],
      ["used_at","TEXT",0,null,0],["revoked_at","TEXT",0,null,0]
    ],
    users: [
      ["id","TEXT",1,null,1],["login_id","TEXT",1,null,0],
      ["display_name","TEXT",1,null,0],["password_scheme","TEXT",1,null,0],
      ["password_hash","TEXT",1,null,0],["password_salt","TEXT",1,null,0],
      ["password_changed_at","TEXT",1,null,0],["status","TEXT",1,"'active'",0],
      ["created_at","TEXT",1,null,0],["updated_at","TEXT",1,null,0],
      ["deleted_at","TEXT",0,null,0],["failed_login_count","INTEGER",1,"0",0],
      ["locked_until","TEXT",0,null,0],["require_password_change","INTEGER",1,"0",0]
    ]
  };
  const actualColumns = Object.fromEntries(expectedTables.map((table) => [table, []]));
  for (const row of schemaRows) {
    actualColumns[row.table_name].push([
      row.name, row.type, row.not_null, row.dflt_value, row.pk
    ]);
  }
  assert("all table columns, types, nullability, defaults, and primary keys match the design",
    JSON.stringify(actualColumns) === JSON.stringify(expectedColumns),
    { actualColumns });

  const foreignKeyRows = queryRows(DB_DIR, `
    SELECT m.name AS table_name, f.id, f.seq,
           f.[table] AS target_table, f.[from] AS source_column,
           f.[to] AS target_column, f.on_update, f.on_delete
    FROM sqlite_schema m
    JOIN pragma_foreign_key_list(m.name) f
    WHERE m.type='table'
      AND m.name IN ('organizations','users','organization_members','auth_sessions',
                     'password_reset_tokens','live_sessions','audit_logs')
    ORDER BY m.name, f.id, f.seq;
  `);
  const actualForeignKeys = foreignKeyRows.map((row) => [
    row.table_name, row.id, row.seq, row.target_table,
    row.source_column, row.target_column, row.on_update, row.on_delete
  ]);
  const expectedForeignKeys = [
    ["audit_logs",0,0,"users","actor_user_id","id","NO ACTION","RESTRICT"],
    ["audit_logs",1,0,"organizations","organization_id","id","NO ACTION","RESTRICT"],
    ["auth_sessions",0,0,"organization_members","organization_id","organization_id","NO ACTION","RESTRICT"],
    ["auth_sessions",0,1,"organization_members","user_id","user_id","NO ACTION","RESTRICT"],
    ["live_sessions",0,0,"organization_members","organization_id","organization_id","NO ACTION","RESTRICT"],
    ["live_sessions",0,1,"organization_members","created_by_user_id","user_id","NO ACTION","RESTRICT"],
    ["live_sessions",1,0,"organizations","organization_id","id","NO ACTION","RESTRICT"],
    ["organization_members",0,0,"users","user_id","id","NO ACTION","RESTRICT"],
    ["organization_members",1,0,"organizations","organization_id","id","NO ACTION","RESTRICT"],
    ["password_reset_tokens",0,0,"users","created_by_user_id","id","NO ACTION","RESTRICT"],
    ["password_reset_tokens",1,0,"users","user_id","id","NO ACTION","RESTRICT"]
  ];
  assert("all foreign keys and ON DELETE rules match the design",
    JSON.stringify(actualForeignKeys) === JSON.stringify(expectedForeignKeys),
    { actualForeignKeys });

  const expectedIndexes = [
    "idx_audit_logs_actor_created",
    "idx_audit_logs_org_created",
    "idx_audit_logs_target_created",
    "idx_auth_sessions_absolute_expiry",
    "idx_auth_sessions_idle_expiry",
    "idx_auth_sessions_org_expiry",
    "idx_auth_sessions_user_org_expiry",
    "idx_live_sessions_creator_status_created",
    "idx_live_sessions_expires",
    "idx_live_sessions_org_status_created",
    "idx_organization_members_org_role_status",
    "idx_organization_members_user_status",
    "idx_organizations_status",
    "idx_password_reset_tokens_expires",
    "idx_password_reset_tokens_user_expires",
    "idx_users_lock_state",
    "idx_users_status"
  ];
  const indexes = queryRows(DB_DIR,
    "SELECT name FROM sqlite_schema WHERE type='index' AND name LIKE 'idx_%' ORDER BY name;"
  ).map((row) => row.name);
  assert("all 17 specified indexes exist", JSON.stringify(indexes) === JSON.stringify(expectedIndexes), { indexes });

  const fkRows = queryRows(DB_DIR, "PRAGMA foreign_key_check;");
  assert("PRAGMA foreign_key_check returns zero rows", fkRows.length === 0, { fkRows });
  const quickCheckRows = queryRows(DB_DIR, "PRAGMA quick_check;");
  assert("D1-supported PRAGMA quick_check returns ok", quickCheckRows.length === 1 && quickCheckRows[0].quick_check === "ok", { quickCheckRows });
  assert("underlying local SQLite PRAGMA integrity_check returns ok", localIntegrityCheck(DB_DIR) === "ok");

  seedFixtures(DB_DIR);
  testOrganizations(DB_DIR);
  testUsers(DB_DIR);
  testMemberships(DB_DIR);
  testAuthSessions(DB_DIR);
  testPasswordResetTokens(DB_DIR);
  testLiveSessions(DB_DIR);
  testAuditLogs(DB_DIR);
  testCrossOrganizationRules(DB_DIR);
  testDeleteRestrictions(DB_DIR);
  testQueryPlans(DB_DIR);

  const finalFkRows = queryRows(DB_DIR, "PRAGMA foreign_key_check;");
  assert("foreign keys remain clean after all schema tests", finalFkRows.length === 0, { finalFkRows });
  const finalQuickCheckRows = queryRows(DB_DIR, "PRAGMA quick_check;");
  assert("D1 quick_check remains ok after all schema tests", finalQuickCheckRows[0]?.quick_check === "ok", { finalQuickCheckRows });
  assert("local SQLite integrity_check remains ok after all schema tests", localIntegrityCheck(DB_DIR) === "ok");

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  console.log(`\nDB_V2 test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (passed !== 119 || failed !== 0 || results.length !== 119) process.exitCode = 1;
} finally {
  if (!process.argv.includes("--keep")) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } else {
    console.log(`Test state retained at ${TEST_DIR}`);
  }
}

function seedFixtures(dbDir) {
  expectSuccess(dbDir, "seed organizations", `
    INSERT INTO organizations VALUES
      ('org_a','Organization A','active','${T0}','${T0}',NULL),
      ('org_b','Organization B','active','${T0}','${T0}',NULL);
  `);
  expectSuccess(dbDir, "seed users", `
    INSERT INTO users VALUES
      ('usr_multi','multi.user','Multi User','pbkdf2-sha256-100000-v1','hhhhhhhhhhhhhhhh','ssssssss','${T0}','active','${T0}','${T0}',NULL,0,NULL,0),
      ('usr_a','teacher.a','Teacher A','pbkdf2-sha256-100000-v1','hhhhhhhhhhhhhhhh','ssssssss','${T0}','active','${T0}','${T0}',NULL,0,NULL,0),
      ('usr_b','teacher.b','Teacher B','pbkdf2-sha256-100000-v1','hhhhhhhhhhhhhhhh','ssssssss','${T0}','active','${T0}','${T0}',NULL,0,NULL,0),
      ('usr_only_a','only.a','Only A','pbkdf2-sha256-100000-v1','hhhhhhhhhhhhhhhh','ssssssss','${T0}','active','${T0}','${T0}',NULL,0,NULL,0);
  `);
  expectSuccess(dbDir, "seed organization memberships", `
    INSERT INTO organization_members VALUES
      ('org_a','usr_multi','owner','active','${T0}','${T0}',NULL),
      ('org_a','usr_a','teacher','active','${T0}','${T0}',NULL),
      ('org_b','usr_multi','admin','active','${T0}','${T0}',NULL),
      ('org_b','usr_b','teacher','active','${T0}','${T0}',NULL),
      ('org_a','usr_only_a','teacher','active','${T0}','${T0}',NULL);
  `);
}

function testOrganizations(dbDir) {
  expectFailure(dbDir, "organization rejects a NULL primary key", `INSERT INTO organizations VALUES (NULL,'Null ID','active','${T0}','${T0}',NULL);`);
  expectFailure(dbDir, "organization rejects an invalid status", `INSERT INTO organizations VALUES ('org_bad_status','Bad','unknown','${T0}','${T0}',NULL);`);
  expectFailure(dbDir, "organization rejects an empty name", `INSERT INTO organizations VALUES ('org_empty','','active','${T0}','${T0}',NULL);`);
  expectFailure(dbDir, "organization rejects a whitespace-only name", `INSERT INTO organizations VALUES ('org_space','   ','active','${T0}','${T0}',NULL);`);
  expectSuccess(dbDir, "organization names are not globally unique", `INSERT INTO organizations VALUES ('org_same_name','Organization A','active','${T0}','${T0}',NULL);`);
  expectFailure(dbDir, "organization rejects updated_at before created_at", `INSERT INTO organizations VALUES ('org_bad_update','Bad Update','active','${T1}','${T0}',NULL);`);
  expectFailure(dbDir, "active organization rejects deleted_at", `INSERT INTO organizations VALUES ('org_active_deleted','Active Deleted','active','${T0}','${T1}','${T1}');`);
  expectFailure(dbDir, "deleted organization requires deleted_at", `INSERT INTO organizations VALUES ('org_deleted','Deleted','deleted','${T0}','${T0}',NULL);`);
  expectSuccess(dbDir, "deleted organization accepts a consistent deleted_at", `INSERT INTO organizations VALUES ('org_deleted_ok','Deleted OK','deleted','${T0}','${T1}','${T1}');`);
}

function testUsers(dbDir) {
  expectFailure(dbDir, "user rejects a NULL primary key", `INSERT INTO users VALUES (NULL,'null.pk.user','Null PK User','pbkdf2-sha256-100000-v1','hhhhhhhhhhhhhhhh','ssssssss','${T0}','active','${T0}','${T0}',NULL,0,NULL,0);`);
  expectFailure(dbDir, "user rejects an exact duplicate login ID", userInsert("usr_dup", "teacher.a"));
  expectFailure(dbDir, "user rejects a case-only duplicate login ID", userInsert("usr_dup_case", "TEACHER.A"));
  expectFailure(dbDir, "user rejects an uppercase unique login ID", userInsert("usr_upper_unique", "UPPER.UNIQUE"));
  expectFailure(dbDir, "user rejects an empty login ID", userInsert("usr_empty_login", ""));
  expectFailure(dbDir, "user rejects forbidden login ID characters", userInsert("usr_bad_login", "bad/login"));
  expectFailure(dbDir, "user rejects an invalid status", userInsert("usr_bad_status", "valid.login", "unknown"));
  expectFailure(dbDir, "user rejects a whitespace-only display name", `INSERT INTO users VALUES ('usr_bad_display','bad.display','   ','pbkdf2-sha256-100000-v1','hhhhhhhhhhhhhhhh','ssssssss','${T0}','active','${T0}','${T0}',NULL,0,NULL,0);`);
  expectFailure(dbDir, "user rejects a short password hash", `INSERT INTO users VALUES ('usr_short_hash','short.hash','Short Hash','pbkdf2-sha256-100000-v1','short','ssssssss','${T0}','active','${T0}','${T0}',NULL,0,NULL,0);`);
  expectFailure(dbDir, "user rejects password_changed_at before creation", `INSERT INTO users VALUES ('usr_bad_password_time','bad.password.time','Bad Password Time','pbkdf2-sha256-100000-v1','hhhhhhhhhhhhhhhh','ssssssss','2026-07-11T23:59:00.000Z','active','${T0}','${T0}',NULL,0,NULL,0);`);
  expectFailure(dbDir, "active user rejects deleted_at", userInsert("usr_active_deleted", "active.deleted", "active", `'${T1}'`));
  expectFailure(dbDir, "deleted user requires deleted_at", userInsert("usr_deleted", "deleted.user", "deleted", "NULL"));
  expectSuccess(dbDir, "deleted user accepts a consistent deleted_at", userInsert("usr_deleted_ok", "deleted.ok", "deleted", `'${T1}'`));
}

function testMemberships(dbDir) {
  expectFailure(dbDir, "membership rejects a duplicate organization and user pair", membershipInsert("org_a", "usr_a", "teacher", "active", "NULL"));
  expectSuccess(dbDir, "one user can belong to another organization", membershipInsert("org_b", "usr_a", "teacher", "active", "NULL"));
  expectFailure(dbDir, "membership rejects a missing organization", membershipInsert("org_missing", "usr_a", "teacher", "active", "NULL"));
  expectFailure(dbDir, "membership rejects a missing user", membershipInsert("org_a", "usr_missing", "teacher", "active", "NULL"));
  expectFailure(dbDir, "membership rejects an invalid role", membershipInsert("org_a", "usr_b", "superuser", "active", "NULL"));
  expectFailure(dbDir, "membership rejects an invalid status", membershipInsert("org_a", "usr_b", "teacher", "invalid", "NULL"));
  expectFailure(dbDir, "active membership rejects removed_at", membershipInsert("org_a", "usr_b", "teacher", "active", `'${T1}'`));
  expectFailure(dbDir, "membership rejects updated_at before created_at", `INSERT INTO organization_members VALUES ('org_a','usr_b','teacher','active','${T1}','${T0}',NULL);`);
  expectFailure(dbDir, "removed membership requires removed_at", membershipInsert("org_a", "usr_b", "teacher", "removed", "NULL"));
  expectSuccess(dbDir, "removed membership accepts a consistent removed_at", membershipInsert("org_a", "usr_b", "teacher", "removed", `'${T1}'`));
}

function testAuthSessions(dbDir) {
  expectFailure(dbDir, "auth session rejects a NULL primary key", authInsert("NULL", "org_a", "usr_a", "token_null_pk_hash", "csrf_null_pk_hash").replace("'NULL'", "NULL"));
  expectSuccess(dbDir, "valid organization-bound auth session is accepted", authInsert("auth_1", "org_a", "usr_a", "token_1_unique_hash", "csrf_1_unique_hash"));
  expectFailure(dbDir, "auth session rejects a user without membership", authInsert("auth_no_member", "org_b", "usr_deleted_ok", "token_no_member_hash", "csrf_no_member_hash"));
  expectFailure(dbDir, "auth session rejects a duplicate token hash", authInsert("auth_dup_token", "org_a", "usr_a", "token_1_unique_hash", "csrf_2_unique_hash"));
  expectFailure(dbDir, "auth session rejects a duplicate CSRF hash", authInsert("auth_dup_csrf", "org_a", "usr_a", "token_2_unique_hash", "csrf_1_unique_hash"));
  expectFailure(dbDir, "auth session rejects a NULL organization", `INSERT INTO auth_sessions VALUES ('auth_null_org',NULL,'usr_a','token_null_org','csrf_null_org','${T0}','${T1}','${T2}','${T3}',NULL);`);
  expectFailure(dbDir, "auth session rejects last_seen_at before creation", authInsert("auth_seen_before", "org_a", "usr_a", "token_seen_before", "csrf_seen_before", "2026-07-11T23:59:00.000Z", T2, T3));
  expectFailure(dbDir, "auth session rejects idle expiry at last_seen_at", authInsert("auth_idle_equal", "org_a", "usr_a", "token_idle_equal", "csrf_idle_equal", T1, T1, T3));
  expectFailure(dbDir, "auth session rejects idle expiry beyond absolute expiry", authInsert("auth_idle_after_abs", "org_a", "usr_a", "token_idle_after", "csrf_idle_after", T1, T4, T3));
  expectFailure(dbDir, "auth session rejects revoked_at before creation", authInsert("auth_revoked_before", "org_a", "usr_a", "token_revoked", "csrf_revoked", T1, T2, T3, "2026-07-11T23:59:00.000Z"));
}

function testPasswordResetTokens(dbDir) {
  expectFailure(dbDir, "password reset token rejects a NULL primary key", resetInsert("NULL", "usr_a", "reset_null_pk_hash").replace("'NULL'", "NULL"));
  expectSuccess(dbDir, "valid password reset token is accepted", resetInsert("prt_1", "usr_a", "reset_token_1_hash"));
  expectFailure(dbDir, "password reset rejects duplicate token hash", resetInsert("prt_dup", "usr_a", "reset_token_1_hash"));
  expectFailure(dbDir, "password reset rejects a missing user", resetInsert("prt_missing", "usr_missing", "reset_missing_hash"));
  expectFailure(dbDir, "password reset rejects a missing creator", `INSERT INTO password_reset_tokens VALUES ('prt_missing_creator','usr_a','reset_missing_creator_hash','usr_missing','${T0}','${T2}',NULL,NULL);`);
  expectFailure(dbDir, "password reset rejects used_at and revoked_at together", resetInsert("prt_both", "usr_a", "reset_both_hash", T2, T2));
  expectFailure(dbDir, "password reset rejects used_at after expiry", resetInsert("prt_used_late", "usr_a", "reset_used_late_hash", T3, "NULL", T2));
  expectFailure(dbDir, "password reset rejects revoked_at before creation", resetInsert("prt_revoked_early", "usr_a", "reset_revoked_early_hash", "NULL", "2026-07-11T23:59:00.000Z", T2));
  expectFailure(dbDir, "password reset rejects expiry at creation", resetInsert("prt_expired", "usr_a", "reset_expired_hash", "NULL", "NULL", T0));
}

function testLiveSessions(dbDir) {
  expectFailure(dbDir, "live session rejects a NULL primary key", liveInsert("NULL", "org_a", "usr_a", "ABC24N").replace("'NULL'", "NULL"));
  expectSuccess(dbDir, "valid active live session is accepted", liveInsert("live_1", "org_a", "usr_a", "ABC234"));
  expectFailure(dbDir, "live session rejects a missing organization", liveInsert("live_missing_org", "org_missing", "usr_a", "ABC235"));
  expectFailure(dbDir, "live session rejects a NULL organization", liveInsert("live_null_org", "org_a", "usr_a", "ABC25A").replace("'org_a','usr_a'", "NULL,'usr_a'"));
  expectFailure(dbDir, "live session rejects a whitespace-only title", liveInsert("live_space_title", "org_a", "usr_a", "ABC25B").replace("'Session live_space_title'", "'   '"));
  expectFailure(dbDir, "live session rejects a creator outside the organization", liveInsert("live_cross_org", "org_b", "usr_only_a", "ABC236"));
  expectFailure(dbDir, "live session rejects a duplicate public code", liveInsert("live_dup_code", "org_a", "usr_a", "ABC234"));
  expectFailure(dbDir, "live session rejects a public code with wrong length", liveInsert("live_short_code", "org_a", "usr_a", "ABC23"));
  expectFailure(dbDir, "live session rejects forbidden public code characters", liveInsert("live_bad_chars", "org_a", "usr_a", "ABC01I"));
  expectFailure(dbDir, "live session rejects lowercase public codes", liveInsert("live_lower", "org_a", "usr_a", "abc237"));
  expectFailure(dbDir, "live session rejects an invalid display mode", liveInsert("live_mode", "org_a", "usr_a", "ABC238", { mode: "grid" }));
  expectFailure(dbDir, "live session rejects display seconds below range", liveInsert("live_seconds_low", "org_a", "usr_a", "ABC239", { seconds: 9 }));
  expectFailure(dbDir, "live session rejects display seconds above range", liveInsert("live_seconds_high", "org_a", "usr_a", "ABC24A", { seconds: 301 }));
  expectFailure(dbDir, "live session rejects posting boolean outside 0 and 1", liveInsert("live_posting_bool", "org_a", "usr_a", "ABC24B", { posting: 2 }));
  expectFailure(dbDir, "live session rejects visibility boolean outside 0 and 1", liveInsert("live_visible_bool", "org_a", "usr_a", "ABC24C", { visible: -1 }));
  expectFailure(dbDir, "ended live session rejects posting enabled", liveInsert("live_ended_posting", "org_a", "usr_a", "ABC24D", { status: "ended", posting: 1, visible: 0, endedAt: `'${T2}'` }));
  expectFailure(dbDir, "ended live session rejects comments visible", liveInsert("live_ended_visible", "org_a", "usr_a", "ABC24E", { status: "ended", posting: 0, visible: 1, endedAt: `'${T2}'` }));
  expectFailure(dbDir, "active live session rejects ended_at", liveInsert("live_active_ended", "org_a", "usr_a", "ABC24F", { endedAt: `'${T2}'` }));
  expectFailure(dbDir, "live session rejects expiry at started_at", liveInsert("live_bad_expiry", "org_a", "usr_a", "ABC25C").replace(`'${T4}'`, `'${T0}'`));
  expectFailure(dbDir, "ended live session rejects ended_at before started_at", liveInsert("live_ended_before", "org_a", "usr_a", "ABC25D", { status: "ended", posting: 0, visible: 0, endedAt: "'2026-07-11T23:59:00.000Z'" }));
  expectFailure(dbDir, "ended live session requires ended_at", liveInsert("live_ended_missing", "org_a", "usr_a", "ABC24G", { status: "ended", posting: 0, visible: 0 }));
  expectFailure(dbDir, "deleted live session requires deleted_at", liveInsert("live_deleted_missing", "org_a", "usr_a", "ABC24H", { status: "deleted", posting: 0, visible: 0, endedAt: `'${T2}'` }));
  expectSuccess(dbDir, "consistent ended live session is accepted", liveInsert("live_ended_ok", "org_a", "usr_a", "ABC24J", { status: "ended", posting: 0, visible: 0, endedAt: `'${T2}'` }));
  expectFailure(dbDir, "deleted live session rejects deleted_at before ended_at", liveInsert("live_deleted_order", "org_a", "usr_a", "ABC24L", { status: "deleted", posting: 0, visible: 0, endedAt: `'${T3}'`, deletedAt: `'${T2}'` }));
  expectSuccess(dbDir, "consistent deleted live session is accepted", liveInsert("live_deleted_ok", "org_a", "usr_a", "ABC24K", { status: "deleted", posting: 0, visible: 0, endedAt: `'${T2}'`, deletedAt: `'${T3}'` }));
}

function testAuditLogs(dbDir) {
  expectFailure(dbDir, "audit log rejects a NULL primary key", auditInsert("NULL", "org_a", "system", "NULL", "NULL", "{}").replace("'NULL'", "NULL"));
  expectSuccess(dbDir, "valid system audit log is accepted", auditInsert("audit_system", "org_a", "system", "NULL", "NULL", "{}"));
  expectSuccess(dbDir, "global system audit log with no organization is accepted", `INSERT INTO audit_logs VALUES ('audit_global',NULL,'system',NULL,NULL,'system.test',NULL,NULL,'{}','${T0}');`);
  expectSuccess(dbDir, "valid user audit log is accepted", auditInsert("audit_user", "org_a", "user", "'usr_a'", "'teacher'", "{}"));
  expectFailure(dbDir, "system audit rejects actor user ID", auditInsert("audit_system_user", "org_a", "system", "'usr_a'", "NULL", "{}"));
  expectFailure(dbDir, "system audit rejects actor role", auditInsert("audit_system_role", "org_a", "system", "NULL", "'owner'", "{}"));
  expectFailure(dbDir, "user audit requires actor user ID", auditInsert("audit_user_missing", "org_a", "user", "NULL", "'teacher'", "{}"));
  expectFailure(dbDir, "audit log rejects invalid JSON", auditInsert("audit_bad_json", "org_a", "system", "NULL", "NULL", "{bad"));
  expectFailure(dbDir, "audit log rejects a whitespace-only action", `INSERT INTO audit_logs VALUES ('audit_space_action','org_a','system',NULL,NULL,'   ',NULL,NULL,'{}','${T0}');`);
  expectFailure(dbDir, "audit log rejects a missing organization reference", auditInsert("audit_missing_org", "org_missing", "system", "NULL", "NULL", "{}"));
  expectFailure(dbDir, "audit log rejects a missing actor user", auditInsert("audit_missing_actor", "org_a", "user", "'usr_missing'", "'teacher'", "{}"));
  expectFailure(dbDir, "audit log rejects an invalid actor role", auditInsert("audit_bad_role", "org_a", "user", "'usr_a'", "'system_admin'", "{}"));
}

function testCrossOrganizationRules(dbDir) {
  expectFailure(dbDir, "organization A-only user cannot create organization B auth session", authInsert("auth_cross", "org_b", "usr_only_a", "token_cross_hash", "csrf_cross_hash"));
  expectFailure(dbDir, "organization A-only user cannot create organization B live session", liveInsert("live_cross_2", "org_b", "usr_only_a", "ABC24M"));
  expectSuccess(dbDir, "multi-organization user can create organization A auth session", authInsert("auth_multi_a", "org_a", "usr_multi", "token_multi_a_hash", "csrf_multi_a_hash"));
  expectSuccess(dbDir, "multi-organization user can create organization B auth session", authInsert("auth_multi_b", "org_b", "usr_multi", "token_multi_b_hash", "csrf_multi_b_hash"));
}

function testDeleteRestrictions(dbDir) {
  expectFailure(dbDir, "organization physical deletion is restricted while memberships exist", "DELETE FROM organizations WHERE id='org_a';");
  expectFailure(dbDir, "user physical deletion is restricted while memberships exist", "DELETE FROM users WHERE id='usr_a';");
}

function testQueryPlans(dbDir) {
  expectIndexedPlan(dbDir, "membership list query uses an index", "EXPLAIN QUERY PLAN SELECT organization_id, role FROM organization_members WHERE user_id='usr_multi' AND status='active';");
  expectIndexedPlan(dbDir, "organization owner query uses an index", "EXPLAIN QUERY PLAN SELECT user_id FROM organization_members WHERE organization_id='org_a' AND role='owner' AND status='active';");
  expectIndexedPlan(dbDir, "active live session query uses an index", "EXPLAIN QUERY PLAN SELECT id FROM live_sessions WHERE organization_id='org_a' AND status='active' ORDER BY created_at DESC;");
  expectIndexedPlan(dbDir, "auth token lookup uses a unique index", "EXPLAIN QUERY PLAN SELECT id FROM auth_sessions WHERE token_hash='token_1_unique_hash';");
  expectIndexedPlan(dbDir, "expired auth cleanup query uses an index", `EXPLAIN QUERY PLAN SELECT id FROM auth_sessions WHERE absolute_expires_at < '${T4}';`);
  expectIndexedPlan(dbDir, "organization audit query uses an index", "EXPLAIN QUERY PLAN SELECT id FROM audit_logs WHERE organization_id='org_a' ORDER BY created_at DESC;");
}

async function testBootstrapUtility() {
  const bootstrapSource = readFileSync(resolve(ROOT, "scripts/bootstrap-owner.mjs"), "utf8");
  const identityCheckPosition = bootstrapSource.indexOf("await verifyRemoteDatabaseIdentity(options);");
  const passwordReadPosition = bootstrapSource.indexOf("let password = await readPassword");
  assert(
    "remote bootstrap verifies the actual D1 UUID and name before reading the password",
    /"d1",\s*"info",\s*"DB_V2"/.test(bootstrapSource)
      && bootstrapSource.includes("info?.uuid")
      && bootstrapSource.includes("info?.name")
      && identityCheckPosition >= 0
      && passwordReadPosition > identityCheckPosition
  );
  assert(
    "bootstrap utility binds only to loopback and uses remote=true for remote D1 access",
    bootstrapSource.includes('"--ip",\n    "127.0.0.1"')
      && bootstrapSource.includes('lines.push("remote = true")')
      && bootstrapSource.includes('spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]')
  );
  const utilityWorkerSource = readFileSync(resolve(ROOT, "scripts/bootstrap-owner-worker.mjs"), "utf8");
  assert(
    "bootstrap verifies migration, table set, foreign keys, and quick_check before writing",
    utilityWorkerSource.includes("DB_V2_MIGRATION_NOT_APPLIED")
      && utilityWorkerSource.includes("DB_V2_SCHEMA_MISMATCH")
      && utilityWorkerSource.includes("PRAGMA foreign_key_check")
      && utilityWorkerSource.includes("PRAGMA quick_check")
  );

  const missingRemoteId = await runNode(["scripts/bootstrap-owner.mjs", "--remote"]);
  assert("remote bootstrap rejects a missing database ID", isCleanFailure(missingRemoteId), missingRemoteId);

  const localDatabaseId = await runNode(["scripts/bootstrap-owner.mjs", "--database-id", randomUUID()]);
  assert("local bootstrap rejects a remote database ID argument", isCleanFailure(localDatabaseId), localDatabaseId);

  const remotePasswordStdin = await runNode([
    "scripts/bootstrap-owner.mjs", "--remote", "--database-id", randomUUID(), "--password-stdin"
  ]);
  assert("remote bootstrap rejects --password-stdin", isCleanFailure(remotePasswordStdin), remotePasswordStdin);

  const legacyRemote = await runNode([
    "scripts/bootstrap-owner.mjs",
    "--remote",
    "--database-id", "f11457fa-27af-468d-94cc-6cdf1ae814e4",
    "--organization-name", "Legacy Rejection",
    "--login-id", "legacy.owner",
    "--display-name", "Legacy Owner"
  ]);
  assert("remote bootstrap rejects the legacy DB UUID", isCleanFailure(legacyRemote), legacyRemote);

  const nonTtyRemote = await runNode([
    "scripts/bootstrap-owner.mjs",
    "--remote",
    "--database-id", randomUUID(),
    "--organization-name", "Remote TTY Check",
    "--login-id", "remote.owner",
    "--display-name", "Remote Owner"
  ], "class_comment_db_v2\n");
  assert("remote bootstrap rejects non-TTY password input", isCleanFailure(nonTtyRemote), nonTtyRemote);

  const migration = wrangler(["d1", "migrations", "apply", "DB_V2", "--local", "--persist-to", BOOTSTRAP_DB_DIR]);
  assert("bootstrap test database migration succeeds", migration.status === 0, migration);

  const password = `Stage02-${randomUUID()}!Aa9`;
  expectSuccess(BOOTSTRAP_DB_DIR, "bootstrap schema mismatch fixture is installed", "CREATE TABLE unexpected_stage02_table (id TEXT PRIMARY KEY);");
  const schemaMismatchBootstrap = await runNode([
    "scripts/bootstrap-owner.mjs",
    "--organization-name", "Schema Mismatch Organization",
    "--login-id", "schema.owner",
    "--display-name", "Schema Owner",
    "--persist-to", BOOTSTRAP_DB_DIR,
    "--password-stdin"
  ], `${password}\n`);
  assert("bootstrap rejects a DB whose application table set differs from the Stage 2 schema", isCleanFailure(schemaMismatchBootstrap), schemaMismatchBootstrap);
  assert("schema mismatch bootstrap leaves the database empty", queryRows(BOOTSTRAP_DB_DIR, "SELECT count(*) AS count FROM organizations;")[0]?.count === 0);
  assertNoBootstrapTempConfigs("schema mismatch bootstrap removes its temporary config");
  expectSuccess(BOOTSTRAP_DB_DIR, "bootstrap schema mismatch fixture is removed", "DROP TABLE unexpected_stage02_table;");

  expectSuccess(BOOTSTRAP_DB_DIR, "bootstrap missing-index fixture is installed", "DROP INDEX idx_users_status;");
  const missingIndexBootstrap = await runNode([
    "scripts/bootstrap-owner.mjs",
    "--organization-name", "Missing Index Organization",
    "--login-id", "missing.index.owner",
    "--display-name", "Missing Index Owner",
    "--persist-to", BOOTSTRAP_DB_DIR,
    "--password-stdin"
  ], `${password}\n`);
  assert("bootstrap rejects a DB whose schema objects differ even when all seven tables remain", isCleanFailure(missingIndexBootstrap), missingIndexBootstrap);
  assert("missing-index bootstrap leaves the database empty", queryRows(BOOTSTRAP_DB_DIR, "SELECT count(*) AS count FROM organizations;")[0]?.count === 0);
  assertNoBootstrapTempConfigs("missing-index bootstrap removes its temporary config");
  expectSuccess(BOOTSTRAP_DB_DIR, "bootstrap missing-index fixture is removed", "CREATE INDEX idx_users_status ON users(status, created_at);");

  expectSuccess(BOOTSTRAP_DB_DIR, "bootstrap rollback trigger is installed", `
    CREATE TRIGGER test_abort_bootstrap_audit
    BEFORE INSERT ON audit_logs
    WHEN NEW.action = 'organization.bootstrap'
    BEGIN
      SELECT RAISE(ABORT, 'forced bootstrap rollback test');
    END;
  `);

  const failedBootstrap = await runNode([
    "scripts/bootstrap-owner.mjs",
    "--organization-name", "Rollback Organization",
    "--login-id", "rollback.owner",
    "--display-name", "Rollback Owner",
    "--persist-to", BOOTSTRAP_DB_DIR,
    "--password-stdin"
  ], `${password}\n`);
  assert("bootstrap reports failure when the audit insert is forced to fail", isCleanFailure(failedBootstrap), failedBootstrap);
  assert("bootstrap output does not contain the plaintext password on failure", !combined(failedBootstrap).includes(password));
  assertNoBootstrapTempConfigs("failed bootstrap removes its temporary config");

  const rollbackCounts = queryRows(BOOTSTRAP_DB_DIR, `
    SELECT
      (SELECT count(*) FROM organizations) AS organizations,
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM organization_members) AS members,
      (SELECT count(*) FROM audit_logs) AS audits;
  `)[0];
  assert(
    "failed bootstrap rolls back organization, user, membership, and audit together",
    Object.values(rollbackCounts).every((value) => value === 0),
    rollbackCounts
  );

  expectSuccess(BOOTSTRAP_DB_DIR, "bootstrap rollback trigger is removed", "DROP TRIGGER test_abort_bootstrap_audit;");

  const successfulBootstrap = await runNode([
    "scripts/bootstrap-owner.mjs",
    "--organization-name", "Primary Organization",
    "--login-id", "primary.owner",
    "--display-name", "Primary Owner",
    "--persist-to", BOOTSTRAP_DB_DIR,
    "--password-stdin"
  ], `${password}\n`);
  assert("bootstrap creates the first Owner successfully", successfulBootstrap.status === 0, successfulBootstrap);
  assert("bootstrap output does not contain the plaintext password on success", !combined(successfulBootstrap).includes(password));
  assertNoBootstrapTempConfigs("successful bootstrap removes its temporary config");

  const bootstrapRows = queryRows(BOOTSTRAP_DB_DIR, `
    SELECT o.name, u.login_id, m.role, m.status, a.actor_type, a.action
    FROM organizations o
    JOIN organization_members m ON m.organization_id=o.id
    JOIN users u ON u.id=m.user_id
    JOIN audit_logs a ON a.organization_id=o.id
    WHERE a.action='organization.bootstrap';
  `);
  assert(
    "bootstrap creates organization, active Owner membership, and system audit",
    bootstrapRows.length === 1
      && bootstrapRows[0].name === "Primary Organization"
      && bootstrapRows[0].login_id === "primary.owner"
      && bootstrapRows[0].role === "owner"
      && bootstrapRows[0].status === "active"
      && bootstrapRows[0].actor_type === "system",
    bootstrapRows
  );

  const secondBootstrap = await runNode([
    "scripts/bootstrap-owner.mjs",
    "--organization-name", "Second Organization",
    "--login-id", "second.owner",
    "--display-name", "Second Owner",
    "--persist-to", BOOTSTRAP_DB_DIR,
    "--password-stdin"
  ], `${password}\n`);
  assert("bootstrap rejects a second execution by default", isCleanFailure(secondBootstrap), secondBootstrap);
  assert("second bootstrap output does not contain the plaintext password", !combined(secondBootstrap).includes(password));
  assertNoBootstrapTempConfigs("rejected second bootstrap removes its temporary config");

  const secondCounts = queryRows(BOOTSTRAP_DB_DIR, "SELECT count(*) AS count FROM organizations;");
  assert("second bootstrap leaves exactly one organization", secondCounts[0]?.count === 1, secondCounts);

  const storedCredentialRows = queryRows(BOOTSTRAP_DB_DIR, `
    SELECT login_id, display_name, password_hash, password_salt FROM users;
  `);
  const storedCredentialText = JSON.stringify(storedCredentialRows);
  assert("plaintext bootstrap password is absent from stored user fields", !storedCredentialText.includes(password));
  const successfulOutput = combined(successfulBootstrap);
  assert(
    "bootstrap output does not contain the stored password hash or salt",
    storedCredentialRows.length === 1
      && !successfulOutput.includes(storedCredentialRows[0].password_hash)
      && !successfulOutput.includes(storedCredentialRows[0].password_salt)
  );
}


function assertNoBootstrapTempConfigs(name) {
  const temporaryConfigs = readdirSync(ROOT).filter((entry) =>
    entry.startsWith(".stage02-bootstrap-") && entry.endsWith(".toml")
  );
  assert(name, temporaryConfigs.length === 0, { temporaryConfigs });
}


function findFiles(directory, predicate) {
  const matches = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) matches.push(...findFiles(path, predicate));
    else if (predicate(path)) matches.push(path);
  }
  return matches;
}

function userInsert(id, loginId, status = "active", deletedAt = "NULL") {
  return `INSERT INTO users VALUES ('${id}','${loginId}','User ${id}','pbkdf2-sha256-100000-v1','hhhhhhhhhhhhhhhh','ssssssss','${T0}','${status}','${T0}','${T0}',${deletedAt},0,NULL,0);`;
}

function membershipInsert(orgId, userId, role, status, removedAt) {
  return `INSERT INTO organization_members VALUES ('${orgId}','${userId}','${role}','${status}','${T0}','${T0}',${removedAt});`;
}

function authInsert(id, orgId, userId, tokenHash, csrfHash, lastSeen = T1, idle = T2, absolute = T3, revoked = "NULL") {
  const revokedSql = revoked === "NULL" ? "NULL" : `'${revoked}'`;
  return `INSERT INTO auth_sessions VALUES ('${id}','${orgId}','${userId}','${tokenHash}','${csrfHash}','${T0}','${lastSeen}','${idle}','${absolute}',${revokedSql});`;
}

function resetInsert(id, userId, tokenHash, usedAt = "NULL", revokedAt = "NULL", expiresAt = T2) {
  const usedSql = usedAt === "NULL" ? "NULL" : `'${usedAt}'`;
  const revokedSql = revokedAt === "NULL" ? "NULL" : `'${revokedAt}'`;
  return `INSERT INTO password_reset_tokens VALUES ('${id}','${userId}','${tokenHash}',NULL,'${T0}','${expiresAt}',${usedSql},${revokedSql});`;
}

function liveInsert(id, orgId, userId, code, options = {}) {
  const posting = options.posting ?? 1;
  const visible = options.visible ?? 1;
  const seconds = options.seconds ?? 60;
  const mode = options.mode ?? "stack3";
  const status = options.status ?? "active";
  const endedAt = options.endedAt ?? "NULL";
  const deletedAt = options.deletedAt ?? "NULL";
  return `INSERT INTO live_sessions VALUES ('${id}','${orgId}','${userId}','${code}','Session ${id}',${posting},${visible},${seconds},'${mode}','${status}','${T0}','${T0}','${T0}','${T4}',${endedAt},${deletedAt});`;
}

function auditInsert(id, orgId, actorType, actorUserSql, actorRoleSql, details) {
  const detailsSql = details === "NULL" ? "NULL" : `'${details.replaceAll("'", "''")}'`;
  return `INSERT INTO audit_logs VALUES ('${id}','${orgId}','${actorType}',${actorUserSql},${actorRoleSql},'test.action','test','target',${detailsSql},'${T0}');`;
}

function expectSuccess(dbDir, name, sql) {
  const result = execute(dbDir, sql);
  assert(name, result.status === 0, result);
}

function expectFailure(dbDir, name, sql) {
  const result = execute(dbDir, sql);
  assert(name, isCleanFailure(result), result);
}

function isCleanFailure(result) {
  return Number.isInteger(result.status)
    && result.status > 0
    && !result.signal
    && !result.error;
}

function expectIndexedPlan(dbDir, name, sql) {
  const rows = queryRows(dbDir, sql);
  const details = rows.map((row) => String(row.detail || "")).join(" | ");
  assert(name, /USING (?:COVERING )?INDEX/i.test(details) && !/SCAN\s+\w+$/i.test(details), { details, rows });
}

function execute(dbDir, sql) {
  const databasePath = localDatabasePath(dbDir);
  let database;
  try {
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys=ON");
    database.exec(sql);
    return { status: 0, signal: null, stdout: "", stderr: "", error: "" };
  } catch (error) {
    return { status: 1, signal: null, stdout: "", stderr: String(error?.message || error), error: "" };
  } finally {
    database?.close();
  }
}

function queryRows(dbDir, sql) {
  const databasePath = localDatabasePath(dbDir);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    database.exec("PRAGMA foreign_keys=ON");
    return database.prepare(sql).all();
  } finally {
    database.close();
  }
}

function localDatabasePath(dbDir) {
  const sqliteFiles = findFiles(dbDir, (path) => path.endsWith(".sqlite") && !path.endsWith("metadata.sqlite"));
  if (sqliteFiles.length !== 1) {
    throw new Error(`Expected one local D1 SQLite file but found ${sqliteFiles.length}.`);
  }
  return sqliteFiles[0];
}

function localIntegrityCheck(dbDir) {
  const database = new DatabaseSync(localDatabasePath(dbDir), { readOnly: true });
  try {
    return String(database.prepare("PRAGMA integrity_check").get()?.integrity_check || "");
  } finally {
    database.close();
  }
}

function wrangler(args) {
  return run(NODE, [WRANGLER_CLI, ...args, "--config", STAGE02_CONFIG]);
}

function runNode(args, input = "") {
  return new Promise((resolveRun) => {
    const child = spawn(NODE, args, {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", CI: "1" }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
    }, 120000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 8 * 1024 * 1024) stdout = stdout.slice(-8 * 1024 * 1024);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8 * 1024 * 1024) stderr = stderr.slice(-8 * 1024 * 1024);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveRun({ status: null, signal: null, stdout, stderr, error: String(error.message || error) });
    });
    child.once("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveRun({ status, signal, stdout, stderr, error: "" });
    });
    child.stdin.end(input);
  });
}

function run(executable, args, input = "") {
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120000
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error.message || result.error) : ""
  };
}

function assert(name, condition, diagnostics = null) {
  const status = condition ? "PASS" : "FAIL";
  results.push({ name, status });
  console.log(`[${status}] ${name}`);
  if (!condition && diagnostics) {
    console.error(formatDiagnostics(diagnostics));
  }
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function combined(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}\n${result.error || ""}`;
}

function formatDiagnostics(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.slice(0, 6000);
}
