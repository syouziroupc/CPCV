import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/index.js";
import { normalizeEmail } from "../src/auth/email.js";
import { hashToken } from "../src/auth/passwords.js";
import { consumePublicEmailRateLimit } from "../src/auth/public-auth-rate.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = "http://localhost";
const PASSWORD = "Correct-Horse-Battery-123";
const NEW_PASSWORD = "Replacement-Password-456";
const results = [];

async function main() {
  testEmailNormalization();
  await testRegistrationLoginAndReset();
  await testRegistrationConflictRollback();
  await testAggregateRateLimit();
  await testRateLimitAndDeliveryFailure();
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 6.5-A email authentication summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

function testEmailNormalization() {
  check("email normalization lowercases and trims", normalizeEmail("  Owner@Example.COM ") === "owner@example.com");
  check("email rejects Unicode addresses in Stage 6.5-A", normalizeEmail("利用者@example.com") === "");
  check("email rejects consecutive dots", normalizeEmail("a..b@example.com") === "");
  check("email rejects a domain without a dot", normalizeEmail("owner@localhost") === "");
  check("email rejects CRLF", normalizeEmail("owner@example.com\r\nBcc:x@example.com") === "");
}

async function testRegistrationLoginAndReset() {
  const h = createHarness();
  try {
    let response = await h.api("/api/auth/registration/request", {
      method: "POST",
      body: {
        email: " Owner@Example.COM ",
        displayName: "Owner A",
        password: PASSWORD,
        turnstileToken: "test-turnstile"
      }
    });
    check("registration request is accepted", response.status === 202 && (await response.json()).accepted === true);
    await h.drain();
    check("registration sends one verification email", h.emails.length === 1, h.emails);
    const verificationToken = tokenFromMessage(h.emails[0], "verify-email");
    check("verification email uses a path token", Boolean(verificationToken) && !h.emails[0].text.includes("?token="));
    const pending = h.row("SELECT email, token_hash, password_hash, password_salt FROM pending_registrations LIMIT 1");
    check("pending registration stores normalized email", pending?.email === "owner@example.com", pending);
    check("raw verification token is not stored", pending?.token_hash === await hashToken(verificationToken) && pending.token_hash !== verificationToken);
    check("plaintext password is absent from pending registration", !JSON.stringify(pending).includes(PASSWORD));

    h.db.zeroNextBatchChangeMetadata = true;
    response = await h.api("/api/auth/registration/verify", {
      method: "POST",
      body: { token: verificationToken }
    });
    const verified = await response.json();
    check("verification creates an authenticated Owner", response.status === 201 && verified.organization?.role === "owner" && verified.user?.email === "owner@example.com", verified);
    check("verification ignores unreliable D1 batch change metadata", response.status === 201);
    const signupCookie = response.headers.get("set-cookie") || "";
    check("verification sets an HttpOnly session cookie", signupCookie.includes("HttpOnly") && signupCookie.includes("SameSite=Strict"), signupCookie);
    check("verification creates one user", h.count("users") === 1);
    check("verification creates one organization", h.count("organizations") === 1);
    check("verification creates one Owner membership", h.row("SELECT role, status FROM organization_members")?.role === "owner");
    check("verification creates a personal workspace", h.row("SELECT name FROM organizations")?.name === "Owner Aの個人用ワークスペース");
    check("verification creates organization origin", h.row("SELECT source FROM organization_origins")?.source === "self_signup");
    check("verification creates organization quota", h.row("SELECT active_member_limit FROM organization_quotas")?.active_member_limit === 25);
    check("verified email timestamp is stored", Boolean(h.row("SELECT email_verified_at FROM users")?.email_verified_at));

    response = await h.api("/api/auth/registration/verify", { method: "POST", body: { token: verificationToken } });
    check("verification token cannot be replayed", response.status === 400 && (await response.json()).error === "REGISTRATION_TOKEN_INVALID");

    response = await h.api("/api/auth/login", {
      method: "POST",
      body: { email: "OWNER@example.com", password: PASSWORD }
    });
    check("verified email login succeeds", response.status === 200 && (await response.json()).user?.email === "owner@example.com");
    response = await h.api("/api/auth/login", {
      method: "POST",
      body: { loginId: h.row("SELECT login_id FROM users")?.login_id, password: PASSWORD }
    });
    check("legacy login ID is rejected when email auth is required", response.status === 400 && (await response.json()).error === "EMAIL_AUTH_REQUIRED");

    const emailCountBeforeUnknown = h.emails.length;
    response = await h.api("/api/auth/password/reset/request", {
      method: "POST",
      body: { email: "missing@example.com", turnstileToken: "test-turnstile" }
    });
    await h.drain();
    check("unknown reset address receives the generic response", response.status === 202 && (await response.json()).accepted === true);
    check("unknown reset address sends no email", h.emails.length === emailCountBeforeUnknown);

    response = await h.api("/api/auth/password/reset/request", {
      method: "POST",
      body: { email: "owner@example.com", turnstileToken: "test-turnstile" }
    });
    check("password reset request is accepted", response.status === 202);
    await h.drain();
    const resetMessage = h.emails.at(-1);
    const resetToken = tokenFromMessage(resetMessage, "reset-password");
    check("password reset email contains a path token", Boolean(resetToken) && !resetMessage.text.includes("?token="));
    const resetRow = h.row("SELECT token_hash, email_snapshot FROM password_reset_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1");
    check("raw reset token is not stored", resetRow?.token_hash === await hashToken(resetToken) && resetRow.token_hash !== resetToken);
    check("password reset snapshots the verified email", resetRow?.email_snapshot === "owner@example.com");

    response = await h.api("/api/auth/password/reset", {
      method: "POST",
      body: { token: resetToken, newPassword: NEW_PASSWORD }
    });
    check("emailed reset token changes the password", response.status === 200 && (await response.json()).ok === true);
    check("password reset revokes every existing session", h.row("SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at IS NULL")?.count === 0);
    response = await h.api("/api/auth/password/reset", {
      method: "POST",
      body: { token: resetToken, newPassword: "Another-Replacement-789" }
    });
    check("password reset token cannot be replayed", response.status === 400 && (await response.json()).error === "RESET_TOKEN_INVALID");
    response = await h.api("/api/auth/login", { method: "POST", body: { email: "owner@example.com", password: PASSWORD } });
    check("old password is rejected after reset", response.status === 401);
    response = await h.api("/api/auth/login", { method: "POST", body: { email: "owner@example.com", password: NEW_PASSWORD } });
    check("new password authenticates after reset", response.status === 200);

    response = await h.api("/api/auth/password/reset/request", {
      method: "POST",
      body: { email: "owner@example.com" }
    });
    check("public email issuance requires Turnstile", response.status === 400 && (await response.json()).error === "TURNSTILE_REQUIRED");
  } finally {
    h.close();
  }
}

async function testRegistrationConflictRollback() {
  const h = createHarness();
  try {
    let response = await h.api("/api/auth/registration/request", {
      method: "POST",
      body: {
        email: "race@example.com",
        displayName: "Race Owner",
        password: PASSWORD,
        turnstileToken: "test-turnstile"
      }
    });
    await h.drain();
    const verificationToken = tokenFromMessage(h.emails[0], "verify-email");
    h.db.beforeBatch = () => {
      h.sqlite.exec(`
        INSERT INTO users (
          id, login_id, display_name, password_scheme, password_hash, password_salt,
          password_changed_at, status, created_at, updated_at, deleted_at,
          failed_login_count, locked_until, require_password_change,
          email, email_verified_at, email_updated_at
        )
        SELECT 'usr_collision', 'collision-login', 'Collision User',
               password_scheme, password_hash, password_salt,
               created_at, 'active', created_at, created_at, NULL,
               0, NULL, 0, email, created_at, created_at
        FROM pending_registrations WHERE email = 'race@example.com';
      `);
    };
    response = await h.api("/api/auth/registration/verify", {
      method: "POST",
      body: { token: verificationToken }
    });
    const body = await response.json();
    check("verification email race returns completed conflict", response.status === 400 && body.error === "REGISTRATION_ALREADY_COMPLETED", body);
    check("verification email race leaves pending token unconsumed", h.row("SELECT verified_at FROM pending_registrations WHERE email = 'race@example.com'")?.verified_at === null);
    check("verification email race rolls back organization side effects", h.count("organizations") === 0 && h.count("organization_members") === 0 && h.count("auth_sessions") === 0);
  } finally {
    h.close();
  }
}

async function testAggregateRateLimit() {
  const h = createHarness();
  try {
    const request = new Request(`${ORIGIN}/api/auth/registration/request`, {
      method: "POST",
      headers: { "cf-connecting-ip": "127.0.0.9" }
    });
    for (const purpose of ["registration", "registration-resend", "password-reset", "invitation", "email-change"]) {
      await consumePublicEmailRateLimit(request, h.env, "aggregate@example.com", purpose);
    }
    let error;
    try {
      await consumePublicEmailRateLimit(request, h.env, "aggregate@example.com", "another-purpose");
    } catch (caught) {
      error = caught;
    }
    check("daily recipient limit is aggregate across email purposes", error?.status === 429 && error?.code === "RATE_LIMITED", error);
  } finally {
    h.close();
  }
}

async function testRateLimitAndDeliveryFailure() {
  const h = createHarness();
  try {
    let last;
    for (let index = 0; index < 6; index += 1) {
      last = await h.api("/api/auth/password/reset/request", {
        method: "POST",
        body: { email: "rate@example.com", turnstileToken: "test-turnstile" }
      });
    }
    check("sixth public email request is rate limited", last.status === 429 && (await last.json()).error === "RATE_LIMITED");

    h.env.EMAIL = { async send() { throw Object.assign(new Error("provider down"), { code: "PROVIDER_DOWN" }); } };
    const response = await h.api("/api/auth/registration/request", {
      method: "POST",
      ip: "127.0.0.2",
      body: {
        email: "failure@example.com",
        displayName: "Failure User",
        password: PASSWORD,
        turnstileToken: "test-turnstile"
      }
    });
    await h.drain();
    check("registration remains accepted when email delivery fails", response.status === 202);
    const attempt = h.row("SELECT status, provider_error_code, recipient_mask FROM email_delivery_attempts ORDER BY created_at DESC LIMIT 1");
    check("email delivery failure is recorded without message content", attempt?.status === "failed" && attempt?.provider_error_code === "PROVIDER_DOWN", attempt);
    check("delivery log masks the recipient", attempt?.recipient_mask === "fa*****@example.com", attempt);
  } finally {
    h.close();
  }
}

function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  for (const name of [
    "0001_initial_schema.sql",
    "0002_auth_security.sql",
    "0004_precision_hardening.sql",
    "0008_email_auth.sql", "0009_account_lifecycle.sql"
  ]) sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
  const db = new D1DatabaseAdapter(sqlite);
  const emails = [];
  const pending = [];
  const env = {
    DB_V2: db,
    APP_ENV: "local",
    AUTH_ORIGIN: ORIGIN,
    EMAIL_AUTH_REQUIRED: "1",
    TURNSTILE_TEST_BYPASS: "1",
    TURNSTILE_SITE_KEY: "test-site-key",
    AUTH_RATE_LIMIT_PEPPER: "test-only-auth-rate-limit-pepper",
    AUTH_EMAIL_FROM: "noreply@example.com",
    AUTH_EMAIL_REPLY_TO: "support@example.com",
    AUTH_LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
    AUTH_LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
    AUTH_PUBLIC_EMAIL_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL: { async send(message) { emails.push(message); return { messageId: `msg-${emails.length}` }; } }
  };
  return {
    sqlite, db, env, emails,
    api: async (path, options = {}) => {
      const headers = new Headers(options.headers || {});
      headers.set("origin", options.origin || ORIGIN);
      headers.set("cf-connecting-ip", options.ip || "127.0.0.1");
      let body;
      if (Object.hasOwn(options, "body")) {
        headers.set("content-type", "application/json");
        body = JSON.stringify(options.body);
      }
      const request = new Request(`${ORIGIN}${path}`, { method: options.method || "GET", headers, body });
      return worker.fetch(request, env, { waitUntil(promise) { pending.push(Promise.resolve(promise)); } });
    },
    async drain() { const current = pending.splice(0); await Promise.all(current); },
    row: (sql, ...values) => queryOne(sqlite, sql, values),
    count: (table) => Number(queryOne(sqlite, `SELECT COUNT(*) AS count FROM ${table}`)?.count || 0),
    close: () => sqlite.close()
  };
}

function tokenFromMessage(message, segment) {
  const match = String(message?.text || "").match(new RegExp(`/${segment}/([^\\s]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

class D1DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new D1PreparedAdapter(this.sqlite, sql); }
  async batch(statements) {
    if (this.beforeBatch) {
      const hook = this.beforeBatch;
      this.beforeBatch = null;
      await hook();
    }
    this.sqlite.exec("BEGIN IMMEDIATE;");
    try {
      const output = statements.map((statement) => statement.executeRun());
      if (this.zeroNextBatchChangeMetadata) {
        this.zeroNextBatchChangeMetadata = false;
        for (const result of output) result.meta.changes = 0;
      }
      this.sqlite.exec("COMMIT;");
      return output;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
    }
  }
  async exec(sql) { this.sqlite.exec(sql); return { count: 0, duration: 0 }; }
}

class D1PreparedAdapter {
  constructor(sqlite, sql, values = []) { this.sqlite = sqlite; this.sql = sql; this.values = values; }
  bind(...values) { return new D1PreparedAdapter(this.sqlite, this.sql, values); }
  async first(column) { const row = this.executeGet(); return column ? row?.[column] ?? null : row ?? null; }
  async all() { return { success: true, results: this.executeAll(), meta: {} }; }
  async run() { return this.executeRun(); }
  executeGet() { return getStatement(this.sqlite.prepare(this.sql), this.sql, this.values); }
  executeAll() { return allStatement(this.sqlite.prepare(this.sql), this.sql, this.values); }
  executeRun() {
    const result = runStatement(this.sqlite.prepare(this.sql), this.values, this.sql);
    return { success: true, results: [], meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

function parameterObject(sql, values) {
  const matches = [...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]));
  if (!matches.length) return null;
  const object = {};
  for (const index of new Set(matches)) object[String(index)] = values[index - 1] ?? null;
  return object;
}
function runStatement(statement, values, sql = statement.sourceSQL || "") { const object = parameterObject(sql, values); return object ? statement.run(object) : statement.run(...values); }
function getStatement(statement, sql, values) { const object = parameterObject(sql, values); return object ? statement.get(object) : statement.get(...values); }
function allStatement(statement, sql, values) { const object = parameterObject(sql, values); return object ? statement.all(object) : statement.all(...values); }
function queryOne(sqlite, sql, values = []) { return getStatement(sqlite.prepare(sql), sql, values) || null; }

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

await main();
