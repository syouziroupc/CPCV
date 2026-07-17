import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/index.js";
import {
  LEGACY_PASSWORD_SCHEME,
  PASSWORD_SCHEME,
  createSalt,
  createToken,
  hashPassword,
  hashToken
} from "../src/auth/passwords.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = "http://localhost";
const DEFAULT_PASSWORD = "CorrectHorseBattery1";
const SECOND_PASSWORD = "AnotherStrongPassword2";
const results = [];
let sharedPasswordRecord;
let sharedLegacyPasswordRecord;

async function main() {
  await runGroup("login and session", testLoginAndSession);
  await runGroup("account lock and rate limit", testLockAndRateLimit);
  await runGroup("password change", testPasswordChange);
  await runGroup("organization management and reset", testOrganizationManagement);
  await runGroup("transaction rollback", testTransactionRollback);

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 3-B API test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function runGroup(name, fn) {
  const harness = await createHarness();
  try {
    await fn(harness);
  } catch (error) {
    check(`${name}: unexpected group error`, false, error);
  } finally {
    harness.close();
  }
}

async function testLoginAndSession(h) {
  let response = await h.api("/api/auth/login", {
    method: "POST",
    body: { loginId: "teacher.a", password: DEFAULT_PASSWORD, organizationId: "org_wrong" }
  });
  check("single-organization login succeeds and ignores supplied organizationId", response.status === 200, response);
  check("login response uses no-store security headers", securityHeaders(response));
  const loginBody = await response.json();
  check("login response does not expose raw session token", loginBody.ok && !JSON.stringify(loginBody).includes("rawSession") && !Object.hasOwn(loginBody, "sessionToken"));
  check("login selects the server-side active organization", loginBody.organization?.id === "org_a");
  const cookie = sessionCookie(response);
  check("local login sets HttpOnly SameSite Strict dev cookie", cookie.startsWith("cpcv_session_dev=") && cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict") && !cookie.includes("Secure"), cookie);
  const rawCookieToken = cookieValue(cookie);
  const sessionRow = h.row("SELECT token_hash, csrf_token_hash FROM auth_sessions ORDER BY created_at DESC LIMIT 1");
  check("D1 stores only session token hash", sessionRow.token_hash !== rawCookieToken && sessionRow.token_hash === await hashToken(rawCookieToken));
  check("D1 stores only CSRF token hash", sessionRow.csrf_token_hash !== loginBody.csrfToken && sessionRow.csrf_token_hash === await hashToken(loginBody.csrfToken));

  response = await h.api("/api/auth/session", { cookie });
  const sessionBody = await response.json();
  check("session lookup succeeds", response.status === 200 && sessionBody.user?.loginId === "teacher.a");
  check("GET session issues an additional CSRF token", sessionBody.csrfToken && sessionBody.csrfToken !== loginBody.csrfToken);
  response = await h.api("/api/auth/session", { cookie });
  const secondSessionBody = await response.json();
  check("separate tab receives a distinct CSRF token", response.status === 200 && secondSessionBody.csrfToken && secondSessionBody.csrfToken !== sessionBody.csrfToken);
  check("primary login CSRF hash remains stable", h.row("SELECT csrf_token_hash FROM auth_sessions WHERE id=?1", loginBody.session.id).csrf_token_hash === await hashToken(loginBody.csrfToken));
  check("secondary CSRF hashes are stored separately", h.row("SELECT COUNT(*) AS count FROM auth_session_csrf_tokens").count === 2);
  const tabTokens = [sessionBody.csrfToken, secondSessionBody.csrfToken];
  for (let index = 0; index < 8; index += 1) {
    response = await h.api("/api/auth/session", { cookie });
    const tab = await response.json();
    if (response.status === 200 && tab.csrfToken) tabTokens.push(tab.csrfToken);
  }
  check("secondary CSRF storage is capped at eight tokens", h.row("SELECT COUNT(*) AS count FROM auth_session_csrf_tokens").count === 8);
  const latestTabToken = tabTokens.at(-1);
  const evictedTabToken = tabTokens[0];
  response = await h.api("/api/auth/password/change", {
    method: "POST", cookie, csrf: evictedTabToken, body: { currentPassword: "wrong-password", newPassword: "Different-Strong-Passphrase-123!" }
  });
  check("oldest secondary CSRF token is evicted after the cap", response.status === 403 && (await response.json()).error === "CSRF_INVALID");
  for (const [name, token] of [["login", loginBody.csrfToken], ["latest tab", latestTabToken]]) {
    const protectedResponse = await h.api("/api/auth/password/change", {
      method: "POST", cookie, csrf: token, body: { currentPassword: "wrong-password", newPassword: "Different-Strong-Passphrase-123!" }
    });
    check(`${name} CSRF token remains valid`, protectedResponse.status === 401 && (await protectedResponse.json()).error === "CURRENT_PASSWORD_INVALID");
  }

  response = await h.api("/api/org?organizationId=org_a", { cookie });
  check("authenticated query organization selector is rejected", response.status === 400 && (await response.json()).error === "ORGANIZATION_ID_NOT_ALLOWED");
  response = await h.api("/api/org?organization-id=org_a", { cookie });
  check("organization selector separator variants are rejected", response.status === 400 && (await response.json()).error === "ORGANIZATION_ID_NOT_ALLOWED");

  response = await h.api("/api/auth/logout", { method: "POST", cookie, headers: { "content-type": "application/json" } });
  check("logout without CSRF is rejected", response.status === 403 && (await response.json()).error === "CSRF_REQUIRED");
  response = await h.api("/api/auth/logout", {
    method: "POST", cookie, csrf: sessionBody.csrfToken, body: { organization_id: "org_a" }
  });
  check("logout rejects body organization selector", response.status === 400 && (await response.json()).error === "ORGANIZATION_ID_NOT_ALLOWED");
  response = await h.api("/api/auth/logout", {
    method: "POST",
    cookie,
    csrf: latestTabToken,
    headers: { "content-type": "application/json" }
  });
  check("logout succeeds with Origin and CSRF", response.status === 200);
  check("logout clears identical cookie name", response.headers.get("set-cookie")?.startsWith("cpcv_session_dev=") && response.headers.get("set-cookie")?.includes("Max-Age=0"));
  response = await h.api("/api/auth/session", { cookie });
  check("logged-out token replay is rejected", response.status === 401);

  const invalid = await h.api("/api/auth/login", { method: "POST", body: { loginId: "absent", password: DEFAULT_PASSWORD } });
  const wrong = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: "wrong-password" } });
  check("unknown user and wrong password share generic response", invalid.status === 401 && wrong.status === 401 && JSON.stringify(await invalid.json()) === JSON.stringify(await wrong.json()));
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "suspended.user", password: DEFAULT_PASSWORD } });
  check("suspended user receives generic 401", response.status === 401 && (await response.json()).error === "INVALID_CREDENTIALS");
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "suspended.member", password: DEFAULT_PASSWORD } });
  check("suspended membership receives generic 401", response.status === 401 && (await response.json()).error === "INVALID_CREDENTIALS");

  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "multi.teacher", password: DEFAULT_PASSWORD } });
  const multiple = await response.json();
  check("multiple active organizations require selection", response.status === 409 && multiple.error === "ORGANIZATION_SELECTION_REQUIRED" && multiple.organizations.length === 2);
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "multi.teacher", password: DEFAULT_PASSWORD, organizationId: "org_missing" } });
  check("invalid selected organization remains generic", response.status === 401 && (await response.json()).error === "INVALID_CREDENTIALS");
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "multi.teacher", password: DEFAULT_PASSWORD, organizationId: "org_b" } });
  check("valid selected organization creates scoped session", response.status === 200 && (await response.json()).organization.id === "org_b");

  response = await h.api("/api/auth/login", { method: "POST", origin: "https://evil.example", body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("login rejects a different Origin", response.status === 403 && (await response.json()).error === "ORIGIN_FORBIDDEN");
  response = await h.api("/api/auth/login", { method: "POST", omitOrigin: true, body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("login rejects a missing Origin", response.status === 403 && (await response.json()).error === "ORIGIN_FORBIDDEN");
  response = await h.api("/api/auth/login", { method: "POST", rawBody: JSON.stringify({ loginId: "a".repeat(20_000), password: DEFAULT_PASSWORD }) });
  check("authentication JSON body is capped", response.status === 413 && (await response.json()).error === "REQUEST_BODY_TOO_LARGE");
  const firstFixation = await loginAs(h, "owner.a", DEFAULT_PASSWORD);
  const secondFixation = await loginAs(h, "owner.a", DEFAULT_PASSWORD);
  check("each login issues a new session token", cookieValue(firstFixation.cookie) !== cookieValue(secondFixation.cookie));
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "suspended.org", password: DEFAULT_PASSWORD } });
  check("suspended organization receives generic 401", response.status === 401 && (await response.json()).error === "INVALID_CREDENTIALS");

  response = await h.api("/api/auth/password/reset/request", { method: "POST", body: {} });
  check("email reset request endpoint validates its input", response.status === 400 && (await response.json()).error === "EMAIL_INVALID");

  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "deleted.user", password: DEFAULT_PASSWORD } });
  check("deleted user receives generic 401", response.status === 401 && (await response.json()).error === "INVALID_CREDENTIALS");
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "unassigned.user", password: DEFAULT_PASSWORD } });
  check("user without membership receives generic 401", response.status === 401 && (await response.json()).error === "INVALID_CREDENTIALS");

  const beforeLegacy = h.row("SELECT password_changed_at FROM users WHERE login_id='legacy.user'");
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "legacy.user", password: DEFAULT_PASSWORD } });
  const afterLegacy = h.row("SELECT password_scheme, password_changed_at FROM users WHERE login_id='legacy.user'");
  check("legacy password scheme is rehashed on successful login", response.status === 200 && afterLegacy.password_scheme === PASSWORD_SCHEME);
  check("legacy rehash preserves actual password change time", afterLegacy.password_changed_at === beforeLegacy.password_changed_at, afterLegacy);
}

async function testLockAndRateLimit(h) {
  for (let index = 1; index <= 5; index += 1) {
    const response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "lock.user", password: `bad-${index}` } });
    check(`failed login ${index} returns generic 401`, response.status === 401 && (await response.json()).error === "INVALID_CREDENTIALS");
  }
  let user = h.row("SELECT failed_login_count, locked_until FROM users WHERE login_id='lock.user'");
  check("fifth failure sets a 15-minute account lock", user.failed_login_count === 5 && Date.parse(user.locked_until) > Date.now() + 14 * 60 * 1000, user);
  let response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "lock.user", password: DEFAULT_PASSWORD } });
  check("correct password is rejected while locked", response.status === 401 && (await response.json()).error === "INVALID_CREDENTIALS");
  h.exec("UPDATE users SET locked_until='2000-01-01T00:00:00.000Z' WHERE login_id='lock.user'");
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "lock.user", password: DEFAULT_PASSWORD } });
  check("login succeeds after lock expiry", response.status === 200);
  user = h.row("SELECT failed_login_count, locked_until FROM users WHERE login_id='lock.user'");
  check("successful login clears failure count and lock", user.failed_login_count === 0 && user.locked_until === null, user);

  h.env.AUTH_LOGIN_IP_LIMITER = { limit: async () => ({ success: false }) };
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("IP limiter rejection returns 429 and Retry-After", response.status === 429 && response.headers.get("retry-after") === "60");
  h.env.AUTH_LOGIN_IP_LIMITER = { limit: async () => ({ success: true }) };
  h.env.AUTH_LOGIN_ACCOUNT_LIMITER = { limit: async () => ({ success: false }) };
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("account limiter rejection returns 429", response.status === 429 && (await response.json()).error === "RATE_LIMITED");
  h.env.AUTH_LOGIN_IP_LIMITER = { limit: async () => { throw new Error("unavailable"); } };
  h.env.AUTH_LOGIN_ACCOUNT_LIMITER = { limit: async () => ({ success: true }) };
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("limiter failure fails closed with service unavailable", response.status === 503 && response.headers.get("retry-after") === "60");
  check("limiter failure audit contains no raw IP or login ID", !JSON.stringify(h.rows("SELECT details_json FROM audit_logs WHERE action='auth.rate_limiter.unavailable'" )).includes("teacher.a") && !JSON.stringify(h.rows("SELECT details_json FROM audit_logs WHERE action='auth.rate_limiter.unavailable'" )).includes("127.0.0.1"));

  h.env.APP_ENV = "production";
  delete h.env.AUTH_LOGIN_IP_LIMITER;
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("production refuses login without rate limiter bindings", response.status === 500 && (await response.json()).error === "INTERNAL_ERROR");
  h.env.AUTH_LOGIN_IP_LIMITER = { limit: async () => ({ success: true }) };
  response = await h.api("/api/auth/login", { method: "POST", omitCfIp: true, body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("production refuses login without Cloudflare client IP", response.status === 500 && (await response.json()).error === "INTERNAL_ERROR");
}

async function testPasswordChange(h) {
  let login = await loginAs(h, "teacher.a", DEFAULT_PASSWORD);
  let response = await h.api("/api/auth/password/change", {
    method: "POST",
    cookie: login.cookie,
    csrf: login.body.csrfToken,
    body: { currentPassword: "wrong", newPassword: SECOND_PASSWORD }
  });
  check("password change rejects incorrect current password", response.status === 401 && (await response.json()).error === "CURRENT_PASSWORD_INVALID");
  response = await h.api("/api/auth/password/change", {
    method: "POST",
    cookie: login.cookie,
    csrf: login.body.csrfToken,
    body: { currentPassword: DEFAULT_PASSWORD, newPassword: "12345678901" }
  });
  check("password change enforces 12-character minimum", response.status === 400 && (await response.json()).error === "PASSWORD_POLICY_FAILED");
  response = await h.api("/api/auth/password/change", {
    method: "POST",
    cookie: login.cookie,
    csrf: login.body.csrfToken,
    body: { currentPassword: DEFAULT_PASSWORD, newPassword: SECOND_PASSWORD, organizationId: "org_a" }
  });
  check("password change rejects body organization selector", response.status === 400 && (await response.json()).error === "ORGANIZATION_ID_NOT_ALLOWED");
  response = await h.api("/api/auth/password/change", {
    method: "POST",
    cookie: login.cookie,
    csrf: login.body.csrfToken,
    body: { currentPassword: DEFAULT_PASSWORD, newPassword: SECOND_PASSWORD }
  });
  const changed = await response.json();
  check("password change succeeds and issues a fresh session", response.status === 200 && changed.csrfToken && sessionCookie(response));
  const oldSession = await h.api("/api/auth/session", { cookie: login.cookie });
  check("password change revokes the old session", oldSession.status === 401);
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("old password no longer authenticates", response.status === 401);
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: SECOND_PASSWORD } });
  check("new password authenticates", response.status === 200);
  check("password change audit exists", h.row("SELECT COUNT(*) AS count FROM audit_logs WHERE action='auth.password.changed'").count === 1);
}

async function testOrganizationManagement(h) {
  const owner = await loginAs(h, "owner.a", DEFAULT_PASSWORD);
  let response = await h.api("/api/org", { cookie: owner.cookie });
  check("owner can read current organization", response.status === 200 && (await response.json()).organization.id === "org_a");
  response = await h.api("/api/org/members?limit=2", { cookie: owner.cookie });
  const firstPage = await response.json();
  check("owner can list members with stable pagination", response.status === 200 && firstPage.members.length === 2 && firstPage.nextCursor);
  response = await h.api(`/api/org/members?limit=100&cursor=${encodeURIComponent(firstPage.nextCursor)}`, { cookie: owner.cookie });
  check("member cursor returns remaining members", response.status === 200 && (await response.json()).members.length >= 1);

  response = await h.api("/api/org/members", {
    method: "POST", cookie: owner.cookie, csrf: owner.body.csrfToken,
    body: { loginId: "new.teacher", displayName: "New Teacher", role: "teacher", temporaryPassword: SECOND_PASSWORD }
  });
  const created = await response.json();
  check("owner creates a new teacher", response.status === 201 && created.member.role === "teacher");
  check("new member requires password change", h.row("SELECT require_password_change FROM users WHERE login_id='new.teacher'").require_password_change === 1);
  response = await h.api("/api/org/members", {
    method: "POST", cookie: owner.cookie, csrf: owner.body.csrfToken,
    body: { loginId: "new.teacher", displayName: "Duplicate", role: "teacher", temporaryPassword: SECOND_PASSWORD }
  });
  check("global duplicate login ID returns 409", response.status === 409 && (await response.json()).error === "LOGIN_ID_ALREADY_EXISTS");

  response = await h.api("/api/org/members", {
    method: "POST", cookie: owner.cookie, csrf: owner.body.csrfToken,
    body: { existingUserId: "usr_unassigned", role: "teacher" }
  });
  check("owner can add an explicit existing user membership", response.status === 201 && (await response.json()).member.userId === "usr_unassigned");

  const admin = await loginAs(h, "admin.a", DEFAULT_PASSWORD);
  response = await h.api("/api/org/members", {
    method: "POST", cookie: admin.cookie, csrf: admin.body.csrfToken,
    body: { loginId: "admin.cannot", displayName: "Admin Cannot", role: "admin", temporaryPassword: SECOND_PASSWORD }
  });
  check("admin cannot create another admin", response.status === 403);
  response = await h.api("/api/org/members", {
    method: "POST", cookie: admin.cookie, csrf: admin.body.csrfToken,
    body: { loginId: "admin.teacher", displayName: "Admin Teacher", role: "teacher", temporaryPassword: SECOND_PASSWORD }
  });
  const adminCreatedTeacher = await response.json();
  check("admin can create a teacher", response.status === 201);

  const teacherLogin = await loginAs(h, "teacher.a", DEFAULT_PASSWORD);
  response = await h.api("/api/org/members/usr_teacher_a", {
    method: "PATCH", cookie: admin.cookie, csrf: admin.body.csrfToken,
    body: { status: "suspended" }
  });
  check("admin can suspend a teacher", response.status === 200 && (await response.json()).member.status === "suspended");
  response = await h.api("/api/auth/session", { cookie: teacherLogin.cookie });
  check("membership suspension invalidates existing session", response.status === 401);
  response = await h.api("/api/org/members/usr_admin_a", {
    method: "PATCH", cookie: admin.cookie, csrf: admin.body.csrfToken,
    body: { status: "suspended" }
  });
  check("admin cannot manage another admin", response.status === 403);
  response = await h.api("/api/org/members/usr_teacher_a", {
    method: "PATCH", cookie: admin.cookie, csrf: admin.body.csrfToken,
    body: { role: "admin" }
  });
  check("admin cannot promote a teacher to admin", response.status === 403);
  const teacherApi = await loginAs(h, "multi.teacher", DEFAULT_PASSWORD, "org_a");
  response = await h.api("/api/org/members", { cookie: teacherApi.cookie });
  check("teacher cannot list organization members", response.status === 403);

  const ownerA2 = await loginAs(h, "owner.a2", DEFAULT_PASSWORD);
  response = await h.api("/api/org/members/usr_owner_a2", {
    method: "PATCH", cookie: owner.cookie, csrf: owner.body.csrfToken,
    body: { role: "teacher" }
  });
  check("owner may demote a non-final owner", response.status === 200 && (await response.json()).member.role === "teacher");
  response = await h.api("/api/auth/session", { cookie: ownerA2.cookie });
  check("role change revokes the target session", response.status === 401);

  const secondOwnerSession = await loginAs(h, "owner.a", DEFAULT_PASSWORD);
  response = await h.api("/api/org/members/usr_teacher_a", {
    method: "PATCH", cookie: owner.cookie, csrf: secondOwnerSession.body.csrfToken,
    body: { status: "active" }
  });
  check("CSRF token from another session is rejected", response.status === 403 && (await response.json()).error === "CSRF_INVALID");

  const lastOwner = await loginAs(h, "last.owner", DEFAULT_PASSWORD);
  response = await h.api("/api/org/members/usr_last_owner", {
    method: "PATCH", cookie: lastOwner.cookie, csrf: lastOwner.body.csrfToken,
    body: { status: "suspended" }
  });
  check("last active owner cannot be suspended", response.status === 409 && (await response.json()).error === "LAST_OWNER_REQUIRED");
  response = await h.api("/api/org/members/usr_last_owner", {
    method: "DELETE", cookie: lastOwner.cookie, csrf: lastOwner.body.csrfToken,
    headers: { "content-type": "application/json" }
  });
  check("last active owner cannot be removed", response.status === 409 && (await response.json()).error === "LAST_OWNER_REQUIRED");
  response = await h.api("/api/org/members/usr_unassigned", {
    method: "DELETE", cookie: owner.cookie, csrf: owner.body.csrfToken, headers: { "content-type": "application/json" }
  });
  check("owner can remove a teacher membership", response.status === 204);
  response = await h.api("/api/org/members/usr_unassigned", {
    method: "PATCH", cookie: owner.cookie, csrf: owner.body.csrfToken, body: { status: "active" }
  });
  check("removed membership cannot be silently reactivated by PATCH", response.status === 409 && (await response.json()).error === "MEMBERSHIP_REMOVED");

  response = await h.api("/api/org/members/usr_admin_a/password-reset", {
    method: "POST", cookie: owner.cookie, csrf: owner.body.csrfToken,
    headers: { "content-type": "application/json" }
  });
  const firstIssued = await response.json();
  check("reset email request accepts an omitted JSON body", response.status === 202 && firstIssued.accepted === true && !Object.hasOwn(firstIssued, "resetToken"));
  const firstStoredReset = h.row("SELECT id, token_hash, revoked_at FROM password_reset_tokens WHERE user_id='usr_admin_a' ORDER BY created_at DESC, id DESC LIMIT 1");
  response = await h.api("/api/org/members/usr_admin_a/password-reset", {
    method: "POST", cookie: owner.cookie, csrf: owner.body.csrfToken, body: {}
  });
  const issued = await response.json();
  check("owner can request a one-time reset email for admin", response.status === 202 && issued.accepted === true && !Object.hasOwn(issued, "resetToken"));
  const storedReset = h.row("SELECT id, token_hash FROM password_reset_tokens WHERE user_id='usr_admin_a' AND revoked_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1");
  check("manager reset stores only a new SHA-256 token hash", Boolean(storedReset?.token_hash) && storedReset.token_hash !== firstStoredReset.token_hash);
  check("issuing a new reset email revokes the previous token", h.row("SELECT revoked_at FROM password_reset_tokens WHERE id=?1", firstStoredReset.id)?.revoked_at !== null);
  response = await h.api("/api/org/members/usr_admin_a/password-reset", {
    method: "POST", cookie: admin.cookie, csrf: admin.body.csrfToken, body: {}
  });
  check("admin cannot request reset for admin", response.status === 403);
  h.exec(`UPDATE users SET email='admin.teacher@example.com', email_verified_at=updated_at, email_updated_at=updated_at WHERE id='${adminCreatedTeacher.member.userId}'`);
  response = await h.api(`/api/org/members/${adminCreatedTeacher.member.userId}/password-reset`, {
    method: "POST", cookie: admin.cookie, csrf: admin.body.csrfToken, body: {}
  });
  check("admin can request reset email for a teacher", response.status === 202 && (await response.json()).accepted === true);
  response = await h.api("/api/org/members/usr_owner_a/password-reset", {
    method: "POST", cookie: owner.cookie, csrf: owner.body.csrfToken, body: {}
  });
  check("owner reset token issuance is forbidden", response.status === 403);
  response = await h.api("/api/org/members/usr_multi/password-reset", {
    method: "POST", cookie: owner.cookie, csrf: owner.body.csrfToken, body: {}
  });
  check("multi-organization user reset requires system operator", response.status === 409 && (await response.json()).error === "RESET_REQUIRES_SYSTEM_OPERATOR");

  const expiredToken = createToken();
  const revokedToken = createToken();
  const spareToken = createToken();
  runStatement(h.sqlite.prepare(`
    INSERT INTO password_reset_tokens
      (id,user_id,token_hash,created_by_user_id,created_at,expires_at,used_at,revoked_at)
    VALUES
      ('rst_expired','usr_admin_a',?1,'usr_owner_a','2019-01-01T00:00:00.000Z','2019-01-01T00:30:00.000Z',NULL,NULL),
      ('rst_revoked','usr_admin_a',?2,'usr_owner_a','2020-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z',NULL,'2020-01-01T00:01:00.000Z'),
      ('rst_spare','usr_admin_a',?3,'usr_owner_a','2020-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z',NULL,NULL)
  `), [await hashToken(expiredToken), await hashToken(revokedToken), await hashToken(spareToken)]);
  response = await h.api("/api/auth/password/reset", {
    method: "POST", body: { token: expiredToken, newPassword: SECOND_PASSWORD }
  });
  check("expired reset token is rejected", response.status === 400 && (await response.json()).error === "RESET_TOKEN_EXPIRED");
  response = await h.api("/api/auth/password/reset", {
    method: "POST", body: { token: revokedToken, newPassword: SECOND_PASSWORD }
  });
  check("revoked reset token is rejected", response.status === 400 && (await response.json()).error === "RESET_TOKEN_INVALID");

  response = await h.api("/api/auth/password/reset", {
    method: "POST", body: { token: spareToken, newPassword: SECOND_PASSWORD }
  });
  check("issued reset token changes password", response.status === 200);
  check("reset success revokes other unused tokens", h.row("SELECT revoked_at FROM password_reset_tokens WHERE id=?1", storedReset.id).revoked_at !== null);
  response = await h.api("/api/auth/password/reset", {
    method: "POST", body: { token: spareToken, newPassword: "ThirdStrongPassword3" }
  });
  check("used reset token cannot be replayed", response.status === 400 && (await response.json()).error === "RESET_TOKEN_INVALID");
  response = await h.api("/api/auth/session", { cookie: admin.cookie });
  check("password reset revokes all existing sessions", response.status === 401);
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "admin.a", password: SECOND_PASSWORD } });
  check("reset password authenticates", response.status === 200);

  response = await h.api("/api/org/audit-logs?limit=100", { cookie: owner.cookie });
  const audit = await response.json();
  check("owner can read organization audit log", response.status === 200 && audit.logs.some((item) => item.action === "auth.password_reset.email_requested"));
  const freshAdmin = await loginAs(h, "admin.a", SECOND_PASSWORD);
  response = await h.api("/api/org/audit-logs?limit=5", { cookie: freshAdmin.cookie });
  check("admin can read organization audit log", response.status === 200);
  response = await h.api("/api/org", { cookie: teacherApi.cookie });
  check("multi-organization session remains fixed to authenticated organization", response.status === 200 && (await response.json()).organization.id === "org_a");
  response = await h.api("/api/org/audit-logs?action=auth.password_reset.email_requested", { cookie: owner.cookie });
  const filteredAudit = await response.json();
  check("audit action filter is exact", response.status === 200 && filteredAudit.logs.length >= 1 && filteredAudit.logs.every((item) => item.action === "auth.password_reset.email_requested"));
  const serializedAudit = JSON.stringify(audit);
  check("audit response contains no password or raw reset token", !serializedAudit.includes("resetToken") && !/password_hash|password_salt|cookie/i.test(serializedAudit));
  response = await h.api("/api/org/audit-logs", { cookie: owner.cookie, headers: { "x-organization-id": "org_b" } });
  check("organization header selector is rejected", response.status === 400);
  response = await h.api("/api/org/members/%E0%A4%A", {
    method: "DELETE", cookie: owner.cookie, csrf: owner.body.csrfToken, headers: { "content-type": "application/json" }
  });
  check("malformed encoded member path returns a controlled 400", response.status === 400 && (await response.json()).error === "INVALID_PATH_PARAMETER");
}

async function testTransactionRollback(h) {
  const owner = await loginAs(h, "owner.a", DEFAULT_PASSWORD);
  const teacher = await loginAs(h, "teacher.a", DEFAULT_PASSWORD);

  h.exec(`
    CREATE TRIGGER fail_member_suspend_audit
    BEFORE INSERT ON audit_logs
    WHEN NEW.action = 'member.suspended'
    BEGIN
      SELECT RAISE(ABORT, 'forced member audit failure');
    END;
  `);
  let response = await withoutConsoleError(() => h.api("/api/org/members/usr_teacher_a", {
    method: "PATCH", cookie: owner.cookie, csrf: owner.body.csrfToken, body: { status: "suspended" }
  }));
  check("member update reports failure when its audit write fails", response.status === 500 && securityHeaders(response));
  check("failed member update rolls back membership state", h.row("SELECT status FROM organization_members WHERE organization_id='org_a' AND user_id='usr_teacher_a'").status === "active");
  response = await h.api("/api/auth/session", { cookie: teacher.cookie });
  const teacherSessionAfterRollback = await response.json();
  check("failed member update rolls back session revocation", response.status === 200);
  h.exec("DROP TRIGGER fail_member_suspend_audit;");

  h.exec(`
    CREATE TRIGGER fail_member_create_audit
    BEFORE INSERT ON audit_logs
    WHEN NEW.action = 'member.created'
    BEGIN
      SELECT RAISE(ABORT, 'forced member create audit failure');
    END;
  `);
  response = await withoutConsoleError(() => h.api("/api/org/members", {
    method: "POST", cookie: owner.cookie, csrf: owner.body.csrfToken,
    body: { loginId: "rollback.teacher", displayName: "Rollback Teacher", role: "teacher", temporaryPassword: SECOND_PASSWORD }
  }));
  check("member creation reports failure when its audit write fails", response.status === 500 && securityHeaders(response));
  check("failed member creation rolls back the new user", h.row("SELECT id FROM users WHERE login_id='rollback.teacher'") === null);
  h.exec("DROP TRIGGER fail_member_create_audit;");

  h.exec(`
    CREATE TRIGGER fail_password_change_audit
    BEFORE INSERT ON audit_logs
    WHEN NEW.action = 'auth.password.changed'
    BEGIN
      SELECT RAISE(ABORT, 'forced password change audit failure');
    END;
  `);
  response = await withoutConsoleError(() => h.api("/api/auth/password/change", {
    method: "POST", cookie: teacher.cookie, csrf: teacherSessionAfterRollback.csrfToken,
    body: { currentPassword: DEFAULT_PASSWORD, newPassword: SECOND_PASSWORD }
  }));
  check("password change reports failure when its audit write fails", response.status === 500 && securityHeaders(response));
  response = await h.api("/api/auth/session", { cookie: teacher.cookie });
  check("failed password change rolls back session revocation", response.status === 200);
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: DEFAULT_PASSWORD } });
  check("failed password change preserves the old password", response.status === 200);
  response = await h.api("/api/auth/login", { method: "POST", body: { loginId: "teacher.a", password: SECOND_PASSWORD } });
  check("failed password change does not install the new password", response.status === 401);
  h.exec("DROP TRIGGER fail_password_change_audit;");

  const resetRawToken = createToken();
  const resetTokenHash = await hashToken(resetRawToken);
  const resetNow = new Date();
  const resetNowIso = resetNow.toISOString();
  const resetExpiresAt = new Date(resetNow.getTime() + 30 * 60 * 1000).toISOString();
  runStatement(h.sqlite.prepare(`
    INSERT INTO password_reset_tokens (
      id,user_id,token_hash,created_by_user_id,created_at,expires_at,used_at,revoked_at,email_snapshot,delivery_requested_at
    ) VALUES (?1,'usr_admin_a',?2,'usr_owner_a',?3,?4,NULL,NULL,'admin.a@example.com',?3)
  `), ['prt_rollback', resetTokenHash, resetNowIso, resetExpiresAt]);
  const admin = await loginAs(h, "admin.a", DEFAULT_PASSWORD);
  h.exec(`
    CREATE TRIGGER fail_reset_used_audit
    BEFORE INSERT ON audit_logs
    WHEN NEW.action = 'auth.password_reset.used'
    BEGIN
      SELECT RAISE(ABORT, 'forced reset audit failure');
    END;
  `);
  response = await withoutConsoleError(() => h.api("/api/auth/password/reset", {
    method: "POST", body: { token: resetRawToken, newPassword: SECOND_PASSWORD }
  }));
  check("password reset reports failure when its audit write fails", response.status === 500 && securityHeaders(response));
  check("failed password reset leaves token unused", h.row("SELECT used_at FROM password_reset_tokens WHERE token_hash=?1", resetTokenHash).used_at === null);
  response = await h.api("/api/auth/session", { cookie: admin.cookie });
  check("failed password reset rolls back session revocation", response.status === 200);
  h.exec("DROP TRIGGER fail_reset_used_audit;");
  response = await h.api("/api/auth/password/reset", {
    method: "POST", body: { token: resetRawToken, newPassword: SECOND_PASSWORD }
  });
  check("reset token remains usable after rolled-back failure", response.status === 200);
}

async function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2/0001_initial_schema.sql"), "utf8"));
  sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2/0002_auth_security.sql"), "utf8"));
  sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2/0004_precision_hardening.sql"), "utf8"));
  sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2/0008_email_auth.sql"), "utf8"));
  sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2/0009_account_lifecycle.sql"), "utf8"));
  const db = new D1DatabaseAdapter(sqlite);
  const env = {
    DB_V2: db,
    APP_ENV: "local",
    AUTH_ORIGIN: ORIGIN,
    AUTH_RATE_LIMIT_PEPPER: "test-only-rate-limit-pepper",
    AUTH_LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
    AUTH_LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
    AUTH_EMAIL_FROM: "noreply@example.com",
    AUTH_EMAIL_REPLY_TO: "support@example.com",
    EMAIL: { async send() { return { messageId: "test-message" }; } }
  };
  const h = {
    sqlite,
    db,
    env,
    api: (path, options) => api(env, path, options),
    row: (sql, ...values) => queryOne(sqlite, sql, values),
    rows: (sql, ...values) => queryAll(sqlite, sql, values),
    exec: (sql) => sqlite.exec(sql),
    close: () => sqlite.close()
  };
  await seed(h);
  return h;
}

async function seed(h) {
  const now = "2020-01-01T00:00:00.000Z";
  h.sqlite.exec(`
    INSERT INTO organizations VALUES
      ('org_a','Organization A','active','${now}','${now}',NULL),
      ('org_b','Organization B','active','${now}','${now}',NULL),
      ('org_last','Last Owner Org','active','${now}','${now}',NULL),
      ('org_suspended','Suspended Org','suspended','${now}','${now}',NULL);
  `);
  sharedPasswordRecord ||= await createPasswordRecord(DEFAULT_PASSWORD);
  sharedLegacyPasswordRecord ||= await createLegacyPasswordRecord(DEFAULT_PASSWORD);
  const users = [
    ["usr_owner_a", "owner.a", "Owner A", "active"],
    ["usr_owner_a2", "owner.a2", "Owner A2", "active"],
    ["usr_admin_a", "admin.a", "Admin A", "active"],
    ["usr_teacher_a", "teacher.a", "Teacher A", "active"],
    ["usr_suspended_user", "suspended.user", "Suspended User", "suspended"],
    ["usr_suspended_member", "suspended.member", "Suspended Member", "active"],
    ["usr_multi", "multi.teacher", "Multi Teacher", "active"],
    ["usr_owner_b", "owner.b", "Owner B", "active"],
    ["usr_last_owner", "last.owner", "Last Owner", "active"],
    ["usr_lock", "lock.user", "Lock User", "active"],
    ["usr_suspended_org", "suspended.org", "Suspended Org User", "active"],
    ["usr_unassigned", "unassigned.user", "Unassigned User", "active"],
    ["usr_deleted", "deleted.user", "Deleted User", "deleted"],
    ["usr_legacy", "legacy.user", "Legacy User", "active"]
  ];
  const insertUser = h.sqlite.prepare(`
    INSERT INTO users (
      id, login_id, display_name, password_scheme, password_hash, password_salt,
      password_changed_at, status, created_at, updated_at, deleted_at,
      failed_login_count, locked_until, require_password_change
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?7,?7,?9,0,NULL,0)
  `);
  for (const [id, loginId, displayName, status] of users) {
    const record = loginId === "legacy.user" ? sharedLegacyPasswordRecord : sharedPasswordRecord;
    const scheme = loginId === "legacy.user" ? LEGACY_PASSWORD_SCHEME : PASSWORD_SCHEME;
    runStatement(insertUser, [
      id, loginId, displayName, scheme, record.hash, record.salt, now, status,
      status === "deleted" ? now : null
    ]);
    runStatement(h.sqlite.prepare(
      `UPDATE users SET email=?1, email_verified_at=?2, email_updated_at=?2 WHERE id=?3`
    ), [`${loginId}@example.com`, now, id]);
  }
  const memberships = [
    ["org_a", "usr_owner_a", "owner", "active"],
    ["org_a", "usr_owner_a2", "owner", "active"],
    ["org_a", "usr_admin_a", "admin", "active"],
    ["org_a", "usr_teacher_a", "teacher", "active"],
    ["org_a", "usr_suspended_user", "teacher", "active"],
    ["org_a", "usr_suspended_member", "teacher", "suspended"],
    ["org_a", "usr_multi", "teacher", "active"],
    ["org_b", "usr_multi", "teacher", "active"],
    ["org_b", "usr_owner_b", "owner", "active"],
    ["org_last", "usr_last_owner", "owner", "active"],
    ["org_a", "usr_lock", "teacher", "active"],
    ["org_suspended", "usr_suspended_org", "owner", "active"],
    ["org_a", "usr_deleted", "teacher", "active"],
    ["org_a", "usr_legacy", "teacher", "active"]
  ];
  const insertMember = h.sqlite.prepare(`
    INSERT INTO organization_members VALUES (?1,?2,?3,?4,?5,?5,NULL)
  `);
  for (const member of memberships) runStatement(insertMember, [...member, now]);
}

async function createPasswordRecord(password) {
  const salt = createSalt();
  return { salt, hash: await hashPassword(password, salt) };
}

async function createLegacyPasswordRecord(password) {
  const salt = "legacy-salt-value-1234";
  return { salt, hash: await hashPassword(password, salt, LEGACY_PASSWORD_SCHEME) };
}

async function loginAs(h, loginId, password, organizationId) {
  const body = { loginId, password };
  if (organizationId) body.organizationId = organizationId;
  const response = await h.api("/api/auth/login", { method: "POST", body });
  const parsed = await response.json();
  if (response.status !== 200) throw new Error(`Login failed for ${loginId}: ${response.status} ${JSON.stringify(parsed)}`);
  return { response, body: parsed, cookie: sessionCookie(response) };
}

async function api(env, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!options.omitOrigin) headers.set("origin", Object.hasOwn(options, "origin") ? options.origin : ORIGIN);
  if (!options.omitCfIp) headers.set("cf-connecting-ip", options.ip || "127.0.0.1");
  if (options.cookie) headers.set("cookie", cookiePair(options.cookie));
  if (options.csrf) headers.set("x-csrf-token", options.csrf);
  let body;
  if (Object.hasOwn(options, "rawBody")) {
    headers.set("content-type", headers.get("content-type") || "application/json");
    body = String(options.rawBody);
  } else if (Object.hasOwn(options, "body")) {
    headers.set("content-type", headers.get("content-type") || "application/json");
    body = JSON.stringify(options.body);
  }
  const request = new Request(`${ORIGIN}${path}`, {
    method: options.method || "GET",
    headers,
    body
  });
  return worker.fetch(request, env, { waitUntil() {} });
}

class D1DatabaseAdapter {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }
  prepare(sql) {
    return new D1PreparedAdapter(this.sqlite, sql);
  }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE;");
    try {
      const output = [];
      for (const statement of statements) output.push(statement.executeRun());
      this.sqlite.exec("COMMIT;");
      return output;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
    }
  }
  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 0, duration: 0 };
  }
}

class D1PreparedAdapter {
  constructor(sqlite, sql, values = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new D1PreparedAdapter(this.sqlite, this.sql, values);
  }
  async first(column) {
    const row = this.executeGet();
    return column ? row?.[column] ?? null : row ?? null;
  }
  async all() {
    return { success: true, results: this.executeAll(), meta: {} };
  }
  async run() {
    return this.executeRun();
  }
  executeGet() {
    const statement = this.sqlite.prepare(this.sql);
    return getStatement(statement, this.sql, this.values);
  }
  executeAll() {
    const statement = this.sqlite.prepare(this.sql);
    return allStatement(statement, this.sql, this.values);
  }
  executeRun() {
    const statement = this.sqlite.prepare(this.sql);
    const result = runStatement(statement, this.values, this.sql);
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

function runStatement(statement, values, sql = statement.sourceSQL || "") {
  const object = parameterObject(sql, values);
  return object ? statement.run(object) : statement.run(...values);
}

function getStatement(statement, sql, values) {
  const object = parameterObject(sql, values);
  return object ? statement.get(object) : statement.get(...values);
}

function allStatement(statement, sql, values) {
  const object = parameterObject(sql, values);
  return object ? statement.all(object) : statement.all(...values);
}

function queryOne(sqlite, sql, values = []) {
  return getStatement(sqlite.prepare(sql), sql, values) || null;
}

function queryAll(sqlite, sql, values = []) {
  return allStatement(sqlite.prepare(sql), sql, values);
}

function sessionCookie(response) {
  return response.headers.get("set-cookie") || "";
}

function cookiePair(setCookie) {
  return String(setCookie).split(";", 1)[0];
}

function cookieValue(setCookie) {
  return decodeURIComponent(cookiePair(setCookie).split("=").slice(1).join("="));
}

async function withoutConsoleError(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

function securityHeaders(response) {
  return response.headers.get("cache-control") === "no-store"
    && response.headers.get("pragma") === "no-cache"
    && response.headers.get("x-content-type-options") === "nosniff"
    && response.headers.get("referrer-policy") === "no-referrer";
}

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

await main();
