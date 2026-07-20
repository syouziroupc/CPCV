const PASSWORD_SCHEME = "pbkdf2-sha256-100000-v3";
const EXPECTED_SCHEMA_SHA256 = "62b899df8e4e8be885937a851c8818eec98daffab280b541cfa656838e4146fa";
const EXPECTED_APPLICATION_TABLES = [
  "audit_logs",
  "auth_sessions",
  "live_sessions",
  "organization_members",
  "organizations",
  "password_reset_tokens",
  "users"
];

const EXPECTED_CORE_SCHEMA_OBJECTS = [
  ...EXPECTED_APPLICATION_TABLES,
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
const EXPECTED_CORE_SCHEMA_SQL_LIST = EXPECTED_CORE_SCHEMA_OBJECTS.map((name) => `'${name}'`).join(",");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const suppliedNonce = request.headers.get("x-cpcv-bootstrap-nonce") || "";
    if (!env.BOOTSTRAP_NONCE || !constantTimeEqual(suppliedNonce, env.BOOTSTRAP_NONCE)) {
      return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (request.method !== "POST" || url.pathname !== "/bootstrap") {
      return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    if (!env.DB_V2) {
      return Response.json({ ok: false, error: "DB_V2_NOT_CONFIGURED" }, { status: 500 });
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return Response.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
    }

    const validationError = validateInput(input);
    if (validationError) {
      return Response.json({ ok: false, error: validationError }, { status: 400 });
    }

    input.organizationName = input.organizationName.trim();
    input.displayName = input.displayName.trim();

    const schemaError = await verifySchema(env.DB_V2);
    if (schemaError) {
      return Response.json({ ok: false, error: schemaError }, { status: 409 });
    }

    const existingOrganization = await env.DB_V2.prepare(
      "SELECT id FROM organizations LIMIT 1"
    ).first();
    if (existingOrganization) {
      return Response.json({ ok: false, error: "BOOTSTRAP_ALREADY_COMPLETED" }, { status: 409 });
    }

    const existingUser = await env.DB_V2.prepare(
      "SELECT id FROM users WHERE login_id = ? COLLATE NOCASE LIMIT 1"
    ).bind(input.loginId).first();
    if (existingUser) {
      return Response.json({ ok: false, error: "LOGIN_ID_ALREADY_EXISTS" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const organizationId = createId("org_");
    const userId = createId("usr_");
    const auditId = createId("audit_");

    try {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `INSERT INTO organizations (id, name, status, created_at, updated_at, deleted_at)
           SELECT ?, ?, 'active', ?, ?, NULL
           WHERE NOT EXISTS (SELECT 1 FROM organizations)`
        ).bind(organizationId, input.organizationName, now, now),
        env.DB_V2.prepare(
          `INSERT INTO users (
             id, login_id, display_name, password_scheme, password_hash,
             password_salt, password_changed_at, status, created_at, updated_at, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)`
        ).bind(
          userId,
          input.loginId,
          input.displayName,
          PASSWORD_SCHEME,
          input.passwordHash,
          input.passwordSalt,
          now,
          now,
          now
        ),
        env.DB_V2.prepare(
          `INSERT INTO organization_members (
             organization_id, user_id, role, status, created_at, updated_at, removed_at
           ) VALUES (?, ?, 'owner', 'active', ?, ?, NULL)`
        ).bind(organizationId, userId, now, now),
        env.DB_V2.prepare(
          `INSERT INTO audit_logs (
             id, organization_id, actor_type, actor_user_id, actor_role,
             action, target_type, target_id, details_json, created_at
           ) VALUES (?, ?, 'system', NULL, NULL, 'organization.bootstrap',
                     'organization', ?, ?, ?)`
        ).bind(
          auditId,
          organizationId,
          organizationId,
          JSON.stringify({ utility: "bootstrap-owner", version: 1 }),
          now
        )
      ]);
    } catch {
      return Response.json({ ok: false, error: "BOOTSTRAP_TRANSACTION_FAILED" }, { status: 409 });
    }

    return Response.json({
      ok: true,
      organizationId,
      userId
    });
  }
};

async function verifySchema(database) {
  try {
    const migrationResult = await database.prepare(
      `SELECT name
       FROM d1_migrations
       WHERE name IN ('0001_initial_schema.sql', '0002_auth_security.sql')
       ORDER BY name`
    ).all();
    const migrations = (migrationResult.results || []).map((row) => row.name);
    if (JSON.stringify(migrations) !== JSON.stringify([
      "0001_initial_schema.sql",
      "0002_auth_security.sql"
    ])) return "DB_V2_MIGRATION_NOT_APPLIED";

    const tableResult = await database.prepare(
      `SELECT name
       FROM sqlite_schema
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name <> 'd1_migrations'
         AND substr(name, 1, 4) <> '_cf_'
       ORDER BY name`
    ).all();
    const actualTables = new Set((tableResult.results || []).map((row) => row.name));
    if (EXPECTED_APPLICATION_TABLES.some((table) => !actualTables.has(table))) {
      return "DB_V2_SCHEMA_MISMATCH";
    }

    const schemaResult = await database.prepare(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_schema
       WHERE name NOT LIKE 'sqlite_%'
         AND name <> 'd1_migrations'
         AND substr(name, 1, 4) <> '_cf_'
         AND name IN (${EXPECTED_CORE_SCHEMA_SQL_LIST})
         AND sql IS NOT NULL
       ORDER BY type, name`
    ).all();
    const canonicalSchema = (schemaResult.results || []).map((row) =>
      `${row.type}\t${row.name}\t${row.tbl_name}\t${String(row.sql).replace(/\s+/g, " ").trim()}`
    ).join("\n");
    const schemaHash = await sha256Hex(canonicalSchema);
    if (schemaHash !== EXPECTED_SCHEMA_SHA256) {
      return "DB_V2_SCHEMA_MISMATCH";
    }

    const foreignKeyResult = await database.prepare("PRAGMA foreign_key_check").all();
    if ((foreignKeyResult.results || []).length !== 0) {
      return "DB_V2_FOREIGN_KEY_VIOLATION";
    }

    const quickCheck = await database.prepare("PRAGMA quick_check").first();
    if (!quickCheck || quickCheck.quick_check !== "ok") {
      return "DB_V2_QUICK_CHECK_FAILED";
    }
  } catch {
    return "DB_V2_SCHEMA_VERIFICATION_FAILED";
  }
  return "";
}

function validateInput(input) {
  if (!input || typeof input !== "object") return "INVALID_INPUT";

  if (typeof input.organizationName !== "string") return "INVALID_ORGANIZATION_NAME";
  const organizationName = input.organizationName.trim();
  if (organizationName.length < 1 || organizationName.length > 120) {
    return "INVALID_ORGANIZATION_NAME";
  }

  if (typeof input.loginId !== "string") return "INVALID_LOGIN_ID";
  if (!/^[a-z0-9._-]{1,64}$/.test(input.loginId)) return "INVALID_LOGIN_ID";

  if (typeof input.displayName !== "string") return "INVALID_DISPLAY_NAME";
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 80) return "INVALID_DISPLAY_NAME";

  if (typeof input.passwordHash !== "string" || input.passwordHash.length < 16 || input.passwordHash.length > 512) {
    return "INVALID_PASSWORD_HASH";
  }
  if (typeof input.passwordSalt !== "string" || input.passwordSalt.length < 8 || input.passwordSalt.length > 256) {
    return "INVALID_PASSWORD_SALT";
  }

  return "";
}

function createId(prefix) {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "")}`;
}

function constantTimeEqual(leftValue, rightValue) {
  const left = new TextEncoder().encode(String(leftValue));
  const right = new TextEncoder().encode(String(rightValue));
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
