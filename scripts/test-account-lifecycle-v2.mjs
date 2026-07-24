import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/index.js";
import { hashToken } from "../src/auth/passwords.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = "http://localhost";
const PASSWORD = "Correct-Horse-Battery-123";
const results = [];

async function main() {
  await testInvitationAndAccountLifecycle();
  await testInvitationAuthorizationAndQuotas();
  await testAccountDeletion();
  const passed = results.filter((x) => x.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 6.5 account lifecycle summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function testAccountDeletion() {
  const h = createHarness();
  try {
    const owner = await register(h, "delete-owner@example.com", "Delete Owner");
    let response = await h.api("/api/auth/account", {
      method: "DELETE", auth: owner,
      body: { currentPassword: "wrong-password", confirmation: "DELETE" }
    });
    check("account deletion requires the current password", response.status === 401 && (await response.json()).error === "CURRENT_PASSWORD_INVALID");

    response = await h.api("/api/auth/account", {
      method: "DELETE", auth: owner,
      body: { currentPassword: PASSWORD, confirmation: "DELETE" }
    });
    check("account owner can delete a private personal workspace", response.status === 204);
    check("account deletion clears the session cookie", String(response.headers.get("set-cookie") || "").includes("Max-Age=0"));
    const deletedUser = h.row("SELECT status, login_id, email, display_name, password_hash, password_salt FROM users WHERE id = ?1", owner.data.user.id);
    check("account deletion logically deletes the user", deletedUser?.status === "deleted");
    check("account deletion anonymizes direct identifiers", deletedUser?.login_id?.startsWith("deleted_") && deletedUser?.email?.endsWith("@invalid.example") && deletedUser?.display_name === "Deleted user");
    check("account deletion replaces credentials", deletedUser?.password_hash?.length >= 16 && deletedUser?.password_salt?.length >= 8);
    check("account deletion removes all memberships", h.row("SELECT COUNT(*) AS count FROM organization_members WHERE user_id = ?1 AND status <> 'removed'", owner.data.user.id)?.count === 0);
    check("account deletion deletes the personal workspace", h.row("SELECT status FROM organizations WHERE id = ?1", owner.data.organization.id)?.status === "deleted");
    check("account deletion revokes every session", h.row("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL", owner.data.user.id)?.count === 0);

    response = await h.api("/api/auth/login", { method: "POST", body: { email: "delete-owner@example.com", password: PASSWORD } });
    check("deleted account cannot log in", response.status === 401);
  } finally { h.close(); }
}

async function testInvitationAndAccountLifecycle() {
  const h = createHarness();
  try {
    const owner = await register(h, "owner@example.com", "Owner", "Organization A");
    check("self-registration returns Owner session", owner.data.organization.role === "owner");

    let response = await h.api("/api/org/invitations", {
      method: "POST", auth: owner,
      body: { email: "teacher@example.com", role: "teacher" }
    });
    const invitationCreated = await response.json();
    check("Owner can create a teacher invitation", response.status === 202 && invitationCreated.accepted === true, invitationCreated);
    await h.drain();
    const inviteMessage = h.emails.at(-1);
    const inviteToken = tokenFromMessage(inviteMessage, "accept-invitation");
    check("invitation email contains a path token", Boolean(inviteToken) && !inviteMessage.text.includes("?token="));
    const inviteRow = h.row("SELECT token_hash, email, role FROM organization_invitations WHERE id = ?1", invitationCreated.invitationId);
    check("invitation stores only token hash", inviteRow?.token_hash === await hashToken(inviteToken) && inviteRow.token_hash !== inviteToken, inviteRow);
    check("invitation delivery is attributed to organization", h.row("SELECT organization_id FROM email_delivery_attempts ORDER BY created_at DESC LIMIT 1")?.organization_id === owner.data.organization.id);

    response = await h.api("/api/auth/invitations/inspect", { method: "POST", body: { token: inviteToken } });
    const inspected = await response.json();
    check("public invitation inspection exposes only masked address", response.status === 200 && inspected.invitation.emailMask !== "teacher@example.com" && inspected.invitation.accountExists === false, inspected);

    response = await h.api("/api/auth/invitations/accept", {
      method: "POST",
      body: { token: inviteToken, displayName: "Teacher", password: PASSWORD }
    });
    const teacher = await response.json();
    teacher.cookie = cookieFrom(response); teacher.csrf = teacher.csrfToken;
    check("new user accepts invitation and receives session", response.status === 201 && teacher.organization.role === "teacher" && teacher.user.emailVerified === true, teacher);
    check("accepted invitation creates active membership", h.row("SELECT status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2", owner.data.organization.id, teacher.user.id)?.status === "active");
    response = await h.api("/api/auth/invitations/accept", { method: "POST", body: { token: inviteToken, displayName: "Again", password: PASSWORD } });
    check("invitation token cannot be replayed", response.status === 400 && (await response.json()).error === "INVITATION_INVALID");

    response = await h.api("/api/auth/account", { method: "GET", auth: teacher });
    const account = await response.json();
    check("account endpoint returns verified email and memberships", response.status === 200 && account.user.email === "teacher@example.com" && account.organizations.length === 1, account);

    response = await h.api(`/api/org/members/${encodeURIComponent(teacher.user.id)}/password-reset`, {
      method: "POST", auth: owner, body: {}
    });
    check("manager reset sends email without returning a raw token", response.status === 202 && !Object.hasOwn(await response.clone().json(), "resetToken"));
    await h.drain();
    const managerResetToken = tokenFromMessage(h.emails.at(-1), "reset-password");
    check("manager reset token is emailed", Boolean(managerResetToken));
    check("manager reset token is hashed in D1", Boolean(managerResetToken) && h.row("SELECT token_hash FROM password_reset_tokens WHERE user_id = ?1 AND revoked_at IS NULL", teacher.user.id)?.token_hash === await hashToken(managerResetToken));

    const secondOwner = await register(h, "second.owner@example.com", "Second Owner", "Organization C");
    response = await h.api("/api/org/invitations", {
      method: "POST", auth: secondOwner,
      body: { email: "teacher@example.com", role: "teacher" }
    });
    await h.drain();
    const crossOrganizationToken = tokenFromMessage(h.emails.at(-1), "accept-invitation");
    response = await h.api("/api/auth/invitations/accept", { method: "POST", auth: owner, body: { token: crossOrganizationToken } });
    check("a logged-in user with another email cannot consume an invitation", response.status === 403 && (await response.json()).error === "INVITATION_EMAIL_MISMATCH");
    response = await h.api("/api/auth/invitations/accept", { method: "POST", auth: teacher, body: { token: crossOrganizationToken } });
    const switchedTeacher = await response.json();
    check("existing user can join a second organization", response.status === 201 && switchedTeacher.organization.id === secondOwner.data.organization.id, switchedTeacher);
    check("existing invitation acceptance does not create a duplicate user", h.row("SELECT COUNT(*) AS count FROM users WHERE email = 'teacher@example.com'")?.count === 1);
    check("existing user now has two active memberships", h.row("SELECT COUNT(*) AS count FROM organization_members WHERE user_id = ?1 AND status = 'active'", teacher.user.id)?.count === 2);
    teacher.cookie = cookieFrom(response); teacher.csrf = switchedTeacher.csrfToken; teacher.data = switchedTeacher;

    response = await h.api(`/api/org/members/${encodeURIComponent(teacher.user.id)}/password-reset`, {
      method: "POST", auth: owner, body: {}
    });
    check("manager reset blocks a multi-organization account", response.status === 409 && (await response.json()).error === "RESET_REQUIRES_SYSTEM_OPERATOR");

    response = await h.api("/api/auth/email-change/request", {
      method: "POST", auth: teacher,
      body: { newEmail: "teacher.new@example.com", currentPassword: PASSWORD }
    });
    check("verified user can request email change", response.status === 202, await response.clone().json());
    await h.drain();
    const changeToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");
    check("email change confirmation uses a path token", Boolean(changeToken));
    check("email change raw token is absent from D1", h.row("SELECT token_hash FROM email_change_requests WHERE user_id = ?1", teacher.user.id)?.token_hash === await hashToken(changeToken));

    response = await h.api("/api/auth/email-change/confirm", { method: "POST", body: { token: changeToken } });
    const changed = await response.json();
    check("email change confirmation succeeds", response.status === 200 && changed.email === "teacher.new@example.com", changed);
    check("email change revokes all sessions", h.row("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL", teacher.user.id)?.count === 0);
    await h.drain();
    check("old address receives a change notice", h.emails.some((message) => message.to === "teacher@example.com" && /変更されました/.test(message.subject)));
    response = await h.api("/api/auth/email-change/confirm", { method: "POST", body: { token: changeToken } });
    check("email change token cannot be replayed", response.status === 400 && (await response.json()).error === "EMAIL_CHANGE_TOKEN_INVALID");

    const legacy = await createLegacyMember(h, owner.data.organization.id);
    response = await h.api("/api/auth/email-change/request", {
      method: "POST", auth: legacy,
      body: { newEmail: "legacy@example.com", currentPassword: PASSWORD }
    });
    check("legacy account can enroll its first email", response.status === 202, await response.clone().json());
    await h.drain();
    const enrollmentToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");
    response = await h.api("/api/auth/email-change/confirm", { method: "POST", body: { token: enrollmentToken } });
    check("legacy email enrollment becomes verified", response.status === 200 && h.row("SELECT email_verified_at FROM users WHERE id = ?1", legacy.userId)?.email_verified_at, await response.clone().json());

    response = await h.api("/api/org/members", {
      method: "POST", auth: owner,
      body: { loginId: "old-way", displayName: "Old", role: "teacher", temporaryPassword: PASSWORD }
    });
    check("temporary-password member creation is disabled", response.status === 410 && (await response.json()).error === "MEMBER_INVITATION_REQUIRED");
  } finally { h.close(); }
}

async function testInvitationAuthorizationAndQuotas() {
  const h = createHarness();
  try {
    const owner = await register(h, "owner2@example.com", "Owner 2", "Organization B");
    await h.api("/api/org/invitations", { method: "POST", auth: owner, body: { email: "admin@example.com", role: "admin" } });
    await h.drain();
    const adminToken = tokenFromMessage(h.emails.at(-1), "accept-invitation");
    let response = await h.api("/api/auth/invitations/accept", { method: "POST", body: { token: adminToken, displayName: "Admin", password: PASSWORD } });
    const admin = await response.json(); admin.cookie = cookieFrom(response); admin.csrf = admin.csrfToken;
    check("Owner can invite Admin", response.status === 201 && admin.organization.role === "admin");

    response = await h.api("/api/org/invitations", { method: "POST", auth: admin, body: { email: "forbidden@example.com", role: "admin" } });
    check("Admin cannot invite Admin", response.status === 403 && (await response.json()).error === "ROLE_FORBIDDEN");
    response = await h.api("/api/org/invitations", { method: "POST", auth: admin, body: { email: "allowed@example.com", role: "teacher" } });
    check("Admin can invite Teacher", response.status === 202);
    await h.drain();

    h.sqlite.prepare("UPDATE organization_quotas SET pending_invitation_limit = 1 WHERE organization_id = ?").run(owner.data.organization.id);
    response = await h.api("/api/org/invitations", { method: "POST", auth: owner, body: { email: "second@example.com", role: "teacher" } });
    check("pending invitation quota is enforced", response.status === 409 && (await response.json()).error === "INVITATION_LIMIT_REACHED");

    h.sqlite.prepare("UPDATE organization_quotas SET pending_invitation_limit = 25, invitation_email_daily_limit = 1 WHERE organization_id = ?").run(owner.data.organization.id);
    const allowedInvitationId = h.row("SELECT id FROM organization_invitations WHERE email = 'allowed@example.com'").id;
    const oldSentAt = new Date(Date.now() - 120000).toISOString();
    h.sqlite.prepare("UPDATE organization_invitations SET created_at = ?, last_sent_at = ? WHERE id = ?").run(oldSentAt, oldSentAt, allowedInvitationId);
    response = await h.api(`/api/org/invitations/${encodeURIComponent(allowedInvitationId)}/resend`, { method: "POST", auth: owner, body: {} });
    check("daily invitation email quota is enforced", response.status === 429 && (await response.json()).error === "INVITATION_EMAIL_DAILY_LIMIT_REACHED");

    h.sqlite.prepare("UPDATE organization_quotas SET invitation_email_daily_limit = 50, active_member_limit = 2 WHERE organization_id = ?").run(owner.data.organization.id);
    const pending = h.row("SELECT id FROM organization_invitations WHERE email = 'allowed@example.com'");
    h.sqlite.prepare("UPDATE organization_invitations SET last_sent_at = ? WHERE id = ?").run(oldSentAt, pending.id);
    response = await h.api(`/api/org/invitations/${encodeURIComponent(pending.id)}/resend`, { method: "POST", auth: owner, body: {} });
    check("invitation resend rotates successfully below quota", response.status === 202);
    await h.drain();
    const teacherToken = tokenFromMessage(h.emails.at(-1), "accept-invitation");
    response = await h.api("/api/auth/invitations/accept", { method: "POST", body: { token: teacherToken, displayName: "Limit Teacher", password: PASSWORD } });
    check("active member quota rejects invitation acceptance", response.status === 409 && (await response.json()).error === "MEMBER_LIMIT_REACHED");
  } finally { h.close(); }
}

async function register(h, email, displayName) {
  let response = await h.api("/api/auth/registration/request", { method: "POST", body: { email, displayName, password: PASSWORD, turnstileToken: "test-turnstile" } });
  if (response.status !== 202) throw new Error(`registration request failed ${response.status}`);
  await h.drain();
  const token = tokenFromMessage(h.emails.at(-1), "verify-email");
  response = await h.api("/api/auth/registration/verify", { method: "POST", body: { token } });
  const data = await response.json();
  if (response.status !== 201) throw new Error(`registration verify failed ${response.status}: ${JSON.stringify(data)}`);
  return { data, cookie: cookieFrom(response), csrf: data.csrfToken };
}

async function createLegacyMember(h, organizationId) {
  const userId = "usr_legacy";
  const loginId = "legacy-login";
  const owner = h.row("SELECT password_scheme, password_hash, password_salt FROM users ORDER BY created_at LIMIT 1");
  const now = new Date().toISOString();
  h.sqlite.prepare(`INSERT INTO users (
      id, login_id, display_name, password_scheme, password_hash, password_salt,
      password_changed_at, status, created_at, updated_at, deleted_at,
      failed_login_count, locked_until, require_password_change, email, email_verified_at, email_updated_at
    ) VALUES (?, ?, 'Legacy User', ?, ?, ?, ?, 'active', ?, ?, NULL, 0, NULL, 0, NULL, NULL, NULL)`)
    .run(userId, loginId, owner.password_scheme, owner.password_hash, owner.password_salt, now, now, now);
  h.sqlite.prepare(`INSERT INTO organization_members (organization_id,user_id,role,status,created_at,updated_at,removed_at) VALUES (?,?,'teacher','active',?,?,NULL)`).run(organizationId, userId, now, now);
  const response = await h.api("/api/auth/login", { method: "POST", body: { loginId, password: PASSWORD }, env: { EMAIL_AUTH_REQUIRED: "0" } });
  const data = await response.json();
  return { data, cookie: cookieFrom(response), csrf: data.csrfToken, userId };
}

function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  for (const name of ["0001_initial_schema.sql","0002_auth_security.sql","0004_precision_hardening.sql","0008_email_auth.sql","0009_account_lifecycle.sql"]) {
    sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
  }
  const db = new D1DatabaseAdapter(sqlite); const emails = []; const pending = [];
  const env = {
    DB_V2: db, APP_ENV: "local", AUTH_ORIGIN: ORIGIN, EMAIL_AUTH_REQUIRED: "1",
    TURNSTILE_TEST_BYPASS: "1", TURNSTILE_SITE_KEY: "test-site-key",
    AUTH_RATE_LIMIT_PEPPER: "test-only-auth-rate-limit-pepper",
    AUTH_EMAIL_FROM: "noreply@example.com", AUTH_EMAIL_REPLY_TO: "support@example.com",
    AUTH_LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
    AUTH_LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
    AUTH_PUBLIC_EMAIL_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL: { async send(message) { emails.push(message); return { messageId: `msg-${emails.length}` }; } }
  };
  return {
    sqlite, db, env, emails,
    async api(path, options = {}) {
      const headers = new Headers(options.headers || {});
      headers.set("origin", ORIGIN); headers.set("cf-connecting-ip", "127.0.0.1");
      if (options.auth?.cookie) headers.set("cookie", options.auth.cookie);
      if (options.auth?.csrf) headers.set("x-csrf-token", options.auth.csrf);
      let body;
      if (Object.hasOwn(options, "body")) { headers.set("content-type", "application/json"); body = JSON.stringify(options.body); }
      const request = new Request(`${ORIGIN}${path}`, { method: options.method || "GET", headers, body });
      const callEnv = { ...env, ...(options.env || {}) };
      return worker.fetch(request, callEnv, { waitUntil(p) { pending.push(Promise.resolve(p)); } });
    },
    async drain() { const tasks = pending.splice(0); await Promise.all(tasks); },
    row(sql, ...values) { return getStatement(sqlite.prepare(sql), sql, values) || null; },
    close() { sqlite.close(); }
  };
}
function cookieFrom(response) { return String(response.headers.get("set-cookie") || "").split(";", 1)[0]; }
function tokenFromMessage(message, segment) { const match = String(message?.text || "").match(new RegExp(`/${segment}/([^\\s]+)`)); return match ? decodeURIComponent(match[1]) : ""; }

class D1DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new D1PreparedAdapter(this.sqlite, sql); }
  async batch(statements) { this.sqlite.exec("BEGIN IMMEDIATE;"); try { const output = statements.map((s) => s.executeRun()); this.sqlite.exec("COMMIT;"); return output; } catch (e) { this.sqlite.exec("ROLLBACK;"); throw e; } }
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
  executeRun() { const r = runStatement(this.sqlite.prepare(this.sql), this.values, this.sql); return { success: true, results: [], meta: { changes: Number(r.changes || 0), last_row_id: Number(r.lastInsertRowid || 0) } }; }
}
function parameterObject(sql, values) { const matches = [...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])); if (!matches.length) return null; const object = {}; for (const i of new Set(matches)) object[String(i)] = values[i - 1] ?? null; return object; }
function runStatement(statement, values, sql = statement.sourceSQL || "") { const object = parameterObject(sql, values); return object ? statement.run(object) : statement.run(...values); }
function getStatement(statement, sql, values) { const object = parameterObject(sql, values); return object ? statement.get(object) : statement.get(...values); }
function allStatement(statement, sql, values) { const object = parameterObject(sql, values); return object ? statement.all(object) : statement.all(...values); }
function check(name, condition, detail = "") { const ok = Boolean(condition); results.push({ name, ok }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`); if (!ok && detail) console.error(detail); }

await main();
