import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  LOCAL_SESSION_COOKIE,
  PRODUCTION_SESSION_COOKIE,
  parseCookies,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  sessionCookieName
} from "../src/auth/cookies.js";
import {
  isUnsafeMethod,
  requireCsrf,
  requireJsonContentType,
  requireSameOrigin
} from "../src/auth/csrf.js";
import { AuthError } from "../src/auth/errors.js";
import { authSessionLookupSql, requireAuth, requireRole } from "../src/auth/middleware.js";
import {
  LEGACY_PASSWORD_SCHEME,
  PASSWORD_SCHEME,
  constantTimeEqual,
  createSalt,
  createToken,
  hashPassword,
  hashToken,
  needsPasswordRehash,
  validatePassword,
  verifyPassword
} from "../src/auth/passwords.js";
import {
  PERMISSIONS,
  canManageMember,
  hasPermission,
  requirePermission
} from "../src/auth/permissions.js";
import { buildRateLimitKey, checkRateLimit, requireRateLimit } from "../src/auth/rate-limit.js";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_REFRESH_INTERVAL_MS,
  attachSessionInternal,
  createSessionMaterial,
  getSessionInternal,
  refreshedIdleExpiry,
  shouldRefreshSession
} from "../src/auth/sessions.js";
import { hashPassword as legacyHashPassword } from "../src/lib/password.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TEST_DIR = resolve(ROOT, `.stage03a-test-${process.pid}`);
const DB_DIR = resolve(TEST_DIR, "migration-db");
const DB_PATH = resolve(DB_DIR, "stage03a.sqlite");
const results = [];

function testMigration() {
  mkdirSync(DB_DIR, { recursive: true });
  const database = new DatabaseSync(DB_PATH);
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(`CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
    const firstApplied = applyTrackedMigrations(database, [
      "0001_initial_schema.sql",
      "0002_auth_security.sql"
    ]);
    assert("0001 and 0002 migrations apply to an empty local D1", firstApplied.length === 2, { firstApplied });
    assert("migration output includes 0002_auth_security.sql", firstApplied.includes("0002_auth_security.sql"), { firstApplied });

    const secondApplied = applyTrackedMigrations(database, [
      "0001_initial_schema.sql",
      "0002_auth_security.sql"
    ]);
    assert("second Stage 3-A migration apply succeeds", Array.isArray(secondApplied), { secondApplied });
    assert("second Stage 3-A migration apply is a no-op", secondApplied.length === 0, { secondApplied });
  } finally {
    database.close();
  }

  const columns = queryRows(DB_DIR, "PRAGMA table_info(users);");
  const added = columns.filter((row) => ["failed_login_count", "locked_until", "require_password_change"].includes(row.name));
  assert("users has all three Stage 3-A security columns", added.length === 3, { added });
  assert("failed_login_count default is zero and NOT NULL", added.find((row) => row.name === "failed_login_count")?.dflt_value === "0" && added.find((row) => row.name === "failed_login_count")?.notnull === 1, { added });
  assert("require_password_change default is zero and NOT NULL", added.find((row) => row.name === "require_password_change")?.dflt_value === "0" && added.find((row) => row.name === "require_password_change")?.notnull === 1, { added });
  const indexes = queryRows(DB_DIR, "SELECT name FROM sqlite_schema WHERE type='index' AND name='idx_users_lock_state';");
  assert("idx_users_lock_state exists", indexes.length === 1, { indexes });

  executeExpectFailure(DB_DIR, "failed_login_count CHECK rejects negative values", `
    INSERT INTO users (
      id, login_id, display_name, password_scheme, password_hash, password_salt,
      password_changed_at, status, created_at, updated_at, deleted_at,
      failed_login_count, locked_until, require_password_change
    ) VALUES (
      'usr_bad_count','bad.count','Bad Count','${PASSWORD_SCHEME}',
      'hhhhhhhhhhhhhhhh','ssssssssssssssss','2026-07-12T00:00:00.000Z','active',
      '2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z',NULL,-1,NULL,0
    );
  `);
  executeExpectFailure(DB_DIR, "require_password_change CHECK rejects values outside 0 and 1", `
    INSERT INTO users (
      id, login_id, display_name, password_scheme, password_hash, password_salt,
      password_changed_at, status, created_at, updated_at, deleted_at,
      failed_login_count, locked_until, require_password_change
    ) VALUES (
      'usr_bad_force','bad.force','Bad Force','${PASSWORD_SCHEME}',
      'hhhhhhhhhhhhhhhh','ssssssssssssssss','2026-07-12T00:00:00.000Z','active',
      '2026-07-12T00:00:00.000Z','2026-07-12T00:00:00.000Z',NULL,0,NULL,2
    );
  `);
}

function applyTrackedMigrations(database, names) {
  const applied = [];
  for (const name of names) {
    const exists = database.prepare("SELECT 1 FROM d1_migrations WHERE name=?").get(name);
    if (exists) continue;
    database.exec(readFileSync(resolve(ROOT, `migrations-v2/${name}`), "utf8"));
    database.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
    applied.push(name);
  }
  return applied;
}

async function testPasswords() {
  const salt = createSalt();
  const token = createToken();
  assert("password salt contains at least 16 random bytes", decodeBase64Url(salt).length >= 16, { salt });
  assert("session token contains at least 32 random bytes", decodeBase64Url(token).length >= 32, { tokenLength: token.length });
  assert("two generated tokens differ", token !== createToken());
  assert("7-character password is rejected", validatePassword("a".repeat(7), "user") === "PASSWORD_POLICY_FAILED");
  assert("8-character password is accepted", validatePassword("a".repeat(8), "user") === "");
  assert("128-character password is accepted", validatePassword("あ".repeat(128), "user") === "");
  assert("129-character password is rejected", validatePassword("あ".repeat(129), "user") === "PASSWORD_POLICY_FAILED");
  assert("Unicode password is accepted", validatePassword("安全なパスワードです12", "user") === "");
  assert("password identical to login ID is rejected", validatePassword("teacher.login", "teacher.login") === "PASSWORD_POLICY_FAILED");
  assert("password whitespace is not trimmed", validatePassword(` ${"a".repeat(10)} `, "user") === "");

  const hash = await hashPassword("correct horse battery", salt);
  assert("current PBKDF2 password verifies", await verifyPassword("correct horse battery", salt, hash, PASSWORD_SCHEME));
  assert("wrong current PBKDF2 password does not verify", !await verifyPassword("wrong password value", salt, hash, PASSWORD_SCHEME));
  assert("current password scheme respects the Workers PBKDF2 limit", PASSWORD_SCHEME === "pbkdf2-sha256-100000-v3");
  const legacySalt = createSalt();
  const legacyHash = await legacyHashPassword("legacy password value", legacySalt);
  assert("legacy PBKDF2 v1 password verifies during migration", await verifyPassword("legacy password value", legacySalt, legacyHash, LEGACY_PASSWORD_SCHEME));
  assert("legacy scheme requires rehash", needsPasswordRehash(LEGACY_PASSWORD_SCHEME));
  assert("current scheme does not require rehash", !needsPasswordRehash(PASSWORD_SCHEME));
  assert("constant-time equality accepts equal strings", constantTimeEqual("same", "same"));
  assert("constant-time equality rejects different strings", !constantTimeEqual("same", "different"));
  assert("token hash is deterministic", await hashToken("token") === await hashToken("token"));
  assert("token hash does not equal raw token", await hashToken("token") !== "token");
  await assertRejectsType("empty token hash input is rejected", () => hashToken(""), TypeError);
}

function testCookies() {
  const prodRequest = request("https://trusted.example/api/auth/session");
  const prodEnv = { APP_ENV: "production" };
  assert("production cookie uses __Host prefix", sessionCookieName(prodRequest, prodEnv) === PRODUCTION_SESSION_COOKIE);
  const serialized = serializeSessionCookie("raw-token", prodRequest, prodEnv, "2026-07-12T12:00:00.000Z", new Date("2026-07-12T00:00:00.000Z"));
  assert("production cookie has Secure", /; Secure;/.test(serialized), { serialized });
  assert("production cookie has HttpOnly", serialized.includes("; HttpOnly;"), { serialized });
  assert("production cookie has SameSite Strict", serialized.includes("SameSite=Strict"), { serialized });
  assert("production cookie has Path root", serialized.includes("Path=/"), { serialized });
  assert("production cookie has no Domain attribute", !/Domain=/i.test(serialized), { serialized });
  assert("production cookie has 12-hour Max-Age", serialized.includes("Max-Age=43200"), { serialized });
  const cleared = serializeClearedSessionCookie(prodRequest, prodEnv);
  assert("logout cookie uses same production name", cleared.startsWith(`${PRODUCTION_SESSION_COOKIE}=`), { cleared });
  assert("logout cookie has Max-Age zero", cleared.includes("Max-Age=0"), { cleared });
  assert("logout cookie preserves Secure and HttpOnly", cleared.includes("Secure") && cleared.includes("HttpOnly"), { cleared });

  const localRequest = request("http://127.0.0.1:8787/api/auth/session", { cookie: `${LOCAL_SESSION_COOKIE}=local-token` });
  const localEnv = { APP_ENV: "local" };
  assert("local cookie uses development name", sessionCookieName(localRequest, localEnv) === LOCAL_SESSION_COOKIE);
  assert("local cookie token is parsed", readSessionToken(localRequest, localEnv) === "local-token");
  const localSerialized = serializeSessionCookie("local-token", localRequest, localEnv, "2026-07-12T12:00:00.000Z", new Date("2026-07-12T00:00:00.000Z"));
  assert("local cookie omits Secure", !localSerialized.includes("Secure"), { localSerialized });
  assertThrows("APP_ENV local is rejected on a remote hostname", () => sessionCookieName(request("https://trusted.example/"), localEnv), 500, "LOCAL_COOKIE_FORBIDDEN");
  const parsed = parseCookies("a=first; malformed; a=second; encoded=hello%20world");
  assert("cookie parser keeps first duplicate value", parsed.get("a") === "first", { parsed: [...parsed] });
  assert("cookie parser decodes values", parsed.get("encoded") === "hello world", { parsed: [...parsed] });
}

async function testOriginAndCsrf() {
  const env = { AUTH_ORIGIN: "https://trusted.example" };
  assert("GET is not unsafe", !isUnsafeMethod("GET"));
  assert("POST is unsafe", isUnsafeMethod("POST"));
  assert("exact Origin succeeds", requireSameOrigin(request("https://trusted.example/api", { origin: "https://trusted.example" }), env) === env.AUTH_ORIGIN);
  for (const [name, origin] of [
    ["different scheme", "http://trusted.example"],
    ["different host", "https://other.example"],
    ["different port", "https://trusted.example:444"],
    ["suffix attack", "https://trusted.example.evil"],
    ["multiple values", "https://trusted.example, https://evil.example"],
    ["missing value", ""]
  ]) {
    const headers = origin ? { origin } : {};
    assertThrows(`Origin rejects ${name}`, () => requireSameOrigin(request("https://trusted.example/api", headers), env), 403, "ORIGIN_FORBIDDEN");
  }
  assertThrows("misconfigured AUTH_ORIGIN is rejected", () => requireSameOrigin(request("https://trusted.example/api", { origin: "https://trusted.example" }), { AUTH_ORIGIN: "https://trusted.example/extra" }), 500, "AUTH_ORIGIN_INVALID");
  assert("JSON content type is accepted", requireJsonContentType(request("https://trusted.example/api", { "content-type": "application/json; charset=utf-8" }, "POST")) === undefined);
  assertThrows("non-JSON content type is rejected", () => requireJsonContentType(request("https://trusted.example/api", { "content-type": "text/plain" }, "POST")), 415, "JSON_CONTENT_TYPE_REQUIRED");

  const rawCsrf = createToken();
  const auth = attachSessionInternal({ sessionId: "auth_1" }, { csrfTokenHash: await hashToken(rawCsrf) });
  const valid = request("https://trusted.example/api", { "x-csrf-token": rawCsrf }, "POST");
  assert("correct CSRF token succeeds", await requireCsrf(valid, env, auth));
  await assertRejects("missing CSRF token is rejected", () => requireCsrf(request("https://trusted.example/api", {}, "POST"), env, auth), 403, "CSRF_REQUIRED");
  await assertRejects("modified CSRF token is rejected", () => requireCsrf(request("https://trusted.example/api", { "x-csrf-token": `${rawCsrf}x` }, "POST"), env, auth), 403, "CSRF_INVALID");
  const otherAuth = attachSessionInternal({ sessionId: "auth_2" }, { csrfTokenHash: await hashToken(createToken()) });
  await assertRejects("CSRF token from another session is rejected", () => requireCsrf(valid, env, otherAuth), 403, "CSRF_INVALID");
  assert("GET does not require CSRF", await requireCsrf(request("https://trusted.example/api", {}, "GET"), env, auth) === undefined);
}

function testPermissions() {
  const matrix = [
    ["owner", PERMISSIONS.OWNER_MANAGE, true],
    ["owner", PERMISSIONS.AUDIT_READ, true],
    ["admin", PERMISSIONS.TEACHER_MANAGE, true],
    ["admin", PERMISSIONS.ADMIN_MANAGE, false],
    ["admin", PERMISSIONS.OWNER_MANAGE, false],
    ["teacher", PERMISSIONS.SESSION_MANAGE_OWN, true],
    ["teacher", PERMISSIONS.MEMBERS_LIST, false],
    ["teacher", PERMISSIONS.AUDIT_READ, false]
  ];
  for (const [role, permission, expected] of matrix) {
    assert(`${role} permission ${permission} matches matrix`, hasPermission(role, permission) === expected);
  }
  assert("Owner can manage Admin", canManageMember("owner", "admin", "update"));
  assert("Owner cannot issue reset token to Owner", !canManageMember("owner", "owner", "password-reset"));
  assert("Admin can manage Teacher", canManageMember("admin", "teacher", "update"));
  assert("Admin cannot manage Admin", !canManageMember("admin", "admin", "update"));
  assert("Admin cannot manage Owner", !canManageMember("admin", "owner", "update"));
  assert("Teacher cannot manage members", !canManageMember("teacher", "teacher", "update"));
  assert("unknown member action is rejected", !canManageMember("owner", "teacher", "unexpected"));
  assert("requirePermission returns authorized context", requirePermission({ role: "owner" }, PERMISSIONS.OWNER_MANAGE).role === "owner");
  assertThrows("requirePermission rejects unauthorized role", () => requirePermission({ role: "teacher" }, PERMISSIONS.MEMBERS_LIST), 403, "ROLE_FORBIDDEN");
  assert("requireRole returns allowed role", requireRole({ role: "admin" }, ["owner", "admin"]).role === "admin");
  assertThrows("requireRole rejects disallowed role", () => requireRole({ role: "teacher" }, ["owner", "admin"]), 403, "ROLE_FORBIDDEN");
}

async function testRateLimit() {
  const first = await buildRateLimitKey("user@example", "pepper-value", "account");
  const second = await buildRateLimitKey("user@example", "pepper-value", "account");
  assert("rate-limit key is deterministic", first === second, { first, second });
  assert("rate-limit key does not contain raw identifier", !first.includes("user@example"), { first });
  let received;
  const allowed = await checkRateLimit({ limit: async (input) => { received = input; return { success: true }; } }, "key-1");
  assert("rate limiter receives Cloudflare object argument", received?.key === "key-1", { received });
  assert("successful rate limiter allows request", allowed.success && !allowed.unavailable, allowed);
  await assertRejects("failed rate limiter produces 429", () => requireRateLimit({ limit: async () => ({ success: false }) }, "key-2"), 429, "RATE_LIMITED");
  let failureObserved = false;
  const unavailable = await checkRateLimit({ limit: async () => { throw new Error("binding unavailable"); } }, "key-3", { onFailure: async () => { failureObserved = true; } });
  assert("limiter failure fails closed", !unavailable.success && unavailable.unavailable, unavailable);
  assert("limiter failure callback runs", failureObserved);
  const callbackFailure = await checkRateLimit({ limit: async () => { throw new Error("binding unavailable"); } }, "key-3b", { onFailure: async () => { throw new Error("audit unavailable"); } });
  assert("limiter and failure callback outage still fails closed", !callbackFailure.success && callbackFailure.unavailable, callbackFailure);
  const missing = await checkRateLimit(null, "key-4");
  assert("missing limiter is unavailable and denied", !missing.success && missing.unavailable, missing);
}

async function testSessions() {
  const now = new Date("2026-07-12T00:00:00.000Z");
  const material = await createSessionMaterial(now);
  assert("session material has independent raw tokens", material.rawSessionToken !== material.rawCsrfToken);
  assert("session token hash does not expose raw token", material.tokenHash !== material.rawSessionToken);
  assert("CSRF token hash does not expose raw token", material.csrfTokenHash !== material.rawCsrfToken);
  assert("session idle expiry is two hours", Date.parse(material.idleExpiresAt) - now.getTime() === SESSION_IDLE_MS, material);
  assert("session absolute expiry is twelve hours", Date.parse(material.absoluteExpiresAt) - now.getTime() === SESSION_ABSOLUTE_MS, material);
  assert("session does not refresh before five minutes", !shouldRefreshSession(now.toISOString(), new Date(now.getTime() + SESSION_REFRESH_INTERVAL_MS - 1)));
  assert("session refreshes at five minutes", shouldRefreshSession(now.toISOString(), new Date(now.getTime() + SESSION_REFRESH_INTERVAL_MS)));
  const absolute = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  assert("idle refresh never exceeds absolute expiry", refreshedIdleExpiry(absolute, new Date(now.getTime() + 10 * 60 * 1000)) === absolute);
  const auth = attachSessionInternal({ sessionId: "auth_1" }, { csrfTokenHash: "csrf_hash" });
  assert("session internal data is accessible to middleware utilities", getSessionInternal(auth)?.csrfTokenHash === "csrf_hash");
  assert("session internal data is not enumerable", JSON.stringify(auth) === '{"sessionId":"auth_1"}', auth);
}

async function testMiddleware() {
  const rawToken = createToken();
  const now = new Date("2026-07-12T06:00:00.000Z");
  const baseRow = {
    session_id: "auth_1",
    organization_id: "org_a",
    user_id: "usr_a",
    csrf_token_hash: await hashToken(createToken()),
    session_created_at: "2026-07-12T00:00:00.000Z",
    last_seen_at: "2026-07-12T05:59:00.000Z",
    idle_expires_at: "2026-07-12T07:59:00.000Z",
    absolute_expires_at: "2026-07-12T12:00:00.000Z",
    revoked_at: null,
    login_id: "teacher.a",
    email: null,
    display_name: "Teacher A",
    user_status: "active",
    organization_status: "active",
    role: "teacher",
    membership_status: "active"
  };
  const validDb = new MockD1(baseRow);
  const validRequest = request("http://127.0.0.1:8787/api/private", { cookie: `${LOCAL_SESSION_COOKIE}=${rawToken}` });
  const env = { APP_ENV: "local", DB_V2: validDb };
  const auth = await requireAuth(validRequest, env, { now });
  assert("middleware returns exact public AuthContext fields", JSON.stringify(Object.keys(auth).sort()) === JSON.stringify(["displayName", "email", "loginId", "organizationId", "role", "sessionId", "userId"].sort()), auth);
  assert("middleware AuthContext uses session organization", auth.organizationId === "org_a", auth);
  assert("middleware performs one JOIN lookup", validDb.firstCalls.length === 1 && /JOIN users[\s\S]*JOIN organizations[\s\S]*JOIN organization_members/.test(validDb.firstCalls[0].sql), validDb.firstCalls);
  assert("middleware does not refresh last_seen before five minutes", validDb.runCalls.length === 0, validDb.runCalls);
  assert("lookup SQL uses a bound token hash", authSessionLookupSql().includes("WHERE s.token_hash = ?1"));

  const refreshDb = new MockD1({ ...baseRow, last_seen_at: "2026-07-12T05:00:00.000Z" });
  await requireAuth(validRequest, { APP_ENV: "local", DB_V2: refreshDb }, { now });
  assert("middleware refreshes last_seen after five minutes", refreshDb.runCalls.length === 1, refreshDb.runCalls);
  assert("middleware refresh is conditional on old last_seen value", /last_seen_at = \?4/.test(refreshDb.runCalls[0].sql), refreshDb.runCalls);
  assert("refreshed idle expiry does not exceed absolute expiry", Date.parse(refreshDb.runCalls[0].bindings[1]) <= Date.parse(baseRow.absolute_expires_at), refreshDb.runCalls);

  await assertRejects("missing session cookie is rejected", () => requireAuth(request("http://127.0.0.1:8787/api/private"), env, { now }), 401, "AUTH_REQUIRED");
  await assertRejects("unknown session token is rejected", () => requireAuth(validRequest, { APP_ENV: "local", DB_V2: new MockD1(null) }, { now }), 401, "AUTH_REQUIRED");
  await assertRejects("revoked session is rejected", () => requireAuth(validRequest, { APP_ENV: "local", DB_V2: new MockD1({ ...baseRow, revoked_at: "2026-07-12T05:00:00.000Z" }) }, { now }), 401, "SESSION_REVOKED");
  await assertRejects("idle-expired session is rejected", () => requireAuth(validRequest, { APP_ENV: "local", DB_V2: new MockD1({ ...baseRow, idle_expires_at: now.toISOString() }) }, { now }), 401, "SESSION_EXPIRED");
  await assertRejects("absolute-expired session is rejected", () => requireAuth(validRequest, { APP_ENV: "local", DB_V2: new MockD1({ ...baseRow, absolute_expires_at: now.toISOString() }) }, { now }), 401, "SESSION_EXPIRED");
  await assertRejects("invalid last_seen_at is rejected", () => requireAuth(validRequest, { APP_ENV: "local", DB_V2: new MockD1({ ...baseRow, last_seen_at: "invalid-date" }) }, { now }), 401, "SESSION_EXPIRED");
  for (const [name, patch] of [
    ["suspended user", { user_status: "suspended" }],
    ["suspended organization", { organization_status: "suspended" }],
    ["suspended membership", { membership_status: "suspended" }],
    ["removed membership", { membership_status: "removed" }]
  ]) {
    await assertRejects(`${name} is rejected`, () => requireAuth(validRequest, { APP_ENV: "local", DB_V2: new MockD1({ ...baseRow, ...patch }) }, { now }), 401, "MEMBERSHIP_INACTIVE");
  }
  await assertRejects("invalid database role is rejected", () => requireAuth(validRequest, { APP_ENV: "local", DB_V2: new MockD1({ ...baseRow, role: "superuser" }) }, { now }), 403, "ROLE_FORBIDDEN");
}

class MockD1 {
  constructor(row) {
    this.row = row;
    this.firstCalls = [];
    this.runCalls = [];
  }

  prepare(sql) {
    const database = this;
    return {
      bindings: [],
      bind(...bindings) {
        this.bindings = bindings;
        return this;
      },
      async first() {
        database.firstCalls.push({ sql, bindings: this.bindings });
        return database.row ? { ...database.row } : null;
      },
      async run() {
        database.runCalls.push({ sql, bindings: this.bindings });
        return { success: true, meta: { changes: 1 } };
      }
    };
  }
}

function request(url, headers = {}, method = "GET") {
  return new Request(url, { method, headers });
}

function assert(name, condition, details = {}) {
  if (condition) {
    results.push({ name, status: "PASS" });
    console.log(`[PASS] ${name}`);
  } else {
    results.push({ name, status: "FAIL", details });
    console.error(`[FAIL] ${name}`);
    console.error(formatDetails(details));
  }
}

function assertThrows(name, operation, status, code) {
  try {
    operation();
    assert(name, false, { expected: { status, code }, actual: "no error" });
  } catch (error) {
    assert(name, error instanceof AuthError && error.status === status && error.code === code, describeError(error));
  }
}

async function assertRejects(name, operation, status, code) {
  try {
    await operation();
    assert(name, false, { expected: { status, code }, actual: "no error" });
  } catch (error) {
    assert(name, error instanceof AuthError && error.status === status && error.code === code, describeError(error));
  }
}

async function assertRejectsType(name, operation, expectedType) {
  try {
    await operation();
    assert(name, false, { expected: expectedType.name, actual: "no error" });
  } catch (error) {
    assert(name, error instanceof expectedType, describeError(error));
  }
}

function describeError(error) {
  return {
    name: error?.name,
    message: error?.message,
    status: error?.status,
    code: error?.code,
    stack: error?.stack
  };
}

function formatDetails(details) {
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function decodeBase64Url(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/") + padding, "base64");
}

function executeExpectFailure(dbDir, name, sql) {
  const result = execute(dbDir, sql);
  assert(name, Number.isInteger(result.status) && result.status > 0 && !result.signal && !result.error, result);
}

function execute(dbDir, sql) {
  let database;
  try {
    database = new DatabaseSync(localDatabasePath(dbDir));
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(sql);
    return { status: 0, signal: null, stdout: "", stderr: "", error: "" };
  } catch (error) {
    return { status: 1, signal: null, stdout: "", stderr: String(error?.message || error), error: "" };
  } finally {
    database?.close();
  }
}

function queryRows(dbDir, sql) {
  const database = new DatabaseSync(localDatabasePath(dbDir), { readOnly: true });
  try {
    return database.prepare(sql).all().map((row) => ({ ...row }));
  } finally {
    database.close();
  }
}

function localDatabasePath() {
  return DB_PATH;
}


try {
  rmSync(TEST_DIR, { recursive: true, force: true });
  testMigration();
  await testPasswords();
  testCookies();
  await testOriginAndCsrf();
  testPermissions();
  await testRateLimit();
  await testSessions();
  await testMiddleware();

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  console.log(`\nStage 3-A test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed > 0) process.exitCode = 1;
} finally {
  if (!process.argv.includes("--keep")) rmSync(TEST_DIR, { recursive: true, force: true });
  else console.log(`Stage 3-A test state retained at ${TEST_DIR}`);
}

