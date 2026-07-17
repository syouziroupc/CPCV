import { auditStatement } from "../auth/audit.js";
import { serializeSessionCookie } from "../auth/cookies.js";
import { requireSameOrigin } from "../auth/csrf.js";
import { normalizeDisplayName, assertOnlyFields, makeId, readJsonObject, rejectOrganizationSelector } from "../auth/request.js";
import { AuthError } from "../auth/errors.js";
import { authJson } from "../auth/http.js";
import {
  PASSWORD_SCHEME,
  createSalt,
  createToken,
  hashPassword,
  hashToken,
  requireValidPassword
} from "../auth/passwords.js";
import { createSessionMaterial } from "../auth/sessions.js";
import { internalLoginId, normalizeEmail, normalizeOrganizationName, requireEmail } from "../auth/email.js";
import { requireTurnstile } from "../auth/turnstile.js";
import { consumePublicEmailRateLimit } from "../auth/public-auth-rate.js";
import { sendPasswordReset, sendRegistrationVerification } from "../auth/email-service.js";

const REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const ACCEPTED = Object.freeze({ ok: true, accepted: true });

export async function handleEmailAuthApi(request, env, ctx) {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/config") return handleConfig(request, env);
  if (path === "/api/auth/registration/request") return handleRegistrationRequest(request, env, ctx);
  if (path === "/api/auth/registration/resend") return handleRegistrationResend(request, env, ctx);
  if (path === "/api/auth/registration/verify") return handleRegistrationVerify(request, env);
  if (path === "/api/auth/password/reset/request") return handleResetRequest(request, env, ctx);
  return null;
}

function handleConfig(request, env) {
  requireMethod(request, "GET");
  return authJson({
    ok: true,
    turnstileSiteKey: String(env?.TURNSTILE_SITE_KEY || ""),
    emailAuthRequired: emailAuthRequired(env),
    turnstileTestBypass: String(env?.APP_ENV || "").toLowerCase() !== "production"
      && String(env?.TURNSTILE_TEST_BYPASS || "") === "1"
  });
}

async function handleRegistrationRequest(request, env, ctx) {
  requirePublicPost(request, env);
  const input = await readJsonObject(request);
  assertOnlyFields(input, ["email", "displayName", "organizationName", "password", "turnstileToken"]);
  const email = requireEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName);
  const organizationName = normalizeOrganizationName(input.organizationName);
  const password = typeof input.password === "string" ? input.password : "";
  if (!displayName) throw new AuthError(400, "DISPLAY_NAME_INVALID");
  if (!organizationName) throw new AuthError(400, "ORGANIZATION_NAME_INVALID");
  requireValidPassword(password, email);
  await requireTurnstile(request, env, input.turnstileToken);
  await consumePublicEmailRateLimit(request, env, email, "registration");

  const salt = createSalt();
  const passwordHash = await hashPassword(password, salt);
  const existing = await env.DB_V2.prepare(
    `SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(email).first();
  if (existing) return authJson(ACCEPTED, 202);

  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + REGISTRATION_TTL_MS).toISOString();
  const id = makeId("reg");
  try {
    await env.DB_V2.batch([
      env.DB_V2.prepare(
        `UPDATE pending_registrations SET revoked_at = ?1
         WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
      ).bind(nowIso, email),
      env.DB_V2.prepare(
        `INSERT INTO pending_registrations (
           id, email, display_name, organization_name,
           password_scheme, password_hash, password_salt, token_hash,
           created_at, expires_at, verified_at, revoked_at, last_sent_at, resend_count
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, ?9, 0)`
      ).bind(id, email, displayName, organizationName, PASSWORD_SCHEME, passwordHash, salt, tokenHash, nowIso, expiresAt)
    ]);
  } catch (error) {
    if (isEmailConflict(error)) return authJson(ACCEPTED, 202);
    throw error;
  }
  const requestId = makeId("req");
  schedule(ctx, sendRegistrationVerification(env, { email, rawToken, requestId }));
  return authJson(ACCEPTED, 202);
}

async function handleRegistrationResend(request, env, ctx) {
  requirePublicPost(request, env);
  const input = await readJsonObject(request);
  assertOnlyFields(input, ["email", "turnstileToken"]);
  const email = requireEmail(input.email);
  await requireTurnstile(request, env, input.turnstileToken);
  await consumePublicEmailRateLimit(request, env, email, "registration-resend");
  const now = new Date();
  const nowIso = now.toISOString();
  const pending = await env.DB_V2.prepare(
    `SELECT id, expires_at, last_sent_at
     FROM pending_registrations
     WHERE email = ?1 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL
     LIMIT 1`
  ).bind(email).first();
  if (!pending || Date.parse(pending.expires_at) <= now.getTime()) return authJson(ACCEPTED, 202);
  if (Date.parse(pending.last_sent_at) > now.getTime() - 60_000) {
    throw new AuthError(429, "RATE_LIMITED", { headers: { "retry-after": "60" } });
  }
  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const result = await env.DB_V2.prepare(
    `UPDATE pending_registrations
     SET token_hash = ?1, last_sent_at = ?2, resend_count = resend_count + 1
     WHERE id = ?3 AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?2`
  ).bind(tokenHash, nowIso, pending.id).run();
  if (Number(result?.meta?.changes || 0) === 1) {
    schedule(ctx, sendRegistrationVerification(env, { email, rawToken, requestId: makeId("req") }));
  }
  return authJson(ACCEPTED, 202);
}

async function handleRegistrationVerify(request, env) {
  requirePublicPost(request, env);
  const input = await readJsonObject(request);
  assertOnlyFields(input, ["token"]);
  const rawToken = typeof input.token === "string" ? input.token : "";
  if (!rawToken || rawToken.length > 512) throw new AuthError(400, "REGISTRATION_TOKEN_INVALID");
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const pending = await env.DB_V2.prepare(
    `SELECT id, email, display_name, organization_name, expires_at, verified_at, revoked_at
     FROM pending_registrations WHERE token_hash = ?1 LIMIT 1`
  ).bind(tokenHash).first();
  if (!pending || pending.verified_at || pending.revoked_at) throw new AuthError(400, "REGISTRATION_TOKEN_INVALID");
  if (Date.parse(pending.expires_at) <= now.getTime()) throw new AuthError(400, "REGISTRATION_TOKEN_EXPIRED");
  if (await env.DB_V2.prepare(`SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`).bind(pending.email).first()) {
    throw new AuthError(400, "REGISTRATION_ALREADY_COMPLETED");
  }

  const claimMarker = makeClaimMarker(now);
  const userId = makeId("usr");
  const organizationId = makeId("org");
  const sessionId = makeId("ses");
  const loginId = internalLoginId();
  const session = await createSessionMaterial(now);
  let results;
  try {
    results = await env.DB_V2.batch([
      env.DB_V2.prepare(
        `UPDATE pending_registrations SET verified_at = ?1
         WHERE id = ?2 AND token_hash = ?3 AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?4`
      ).bind(claimMarker, pending.id, tokenHash, nowIso),
      env.DB_V2.prepare(
        `INSERT INTO users (
           id, login_id, display_name, password_scheme, password_hash, password_salt,
           password_changed_at, status, created_at, updated_at, deleted_at,
           failed_login_count, locked_until, require_password_change,
           email, email_verified_at, email_updated_at
         )
         SELECT ?1, ?2, p.display_name, p.password_scheme, p.password_hash, p.password_salt,
                ?3, 'active', ?3, ?3, NULL, 0, NULL, 0, p.email, ?3, ?3
         FROM pending_registrations p
         WHERE p.id = ?4 AND p.verified_at = ?5`
      ).bind(userId, loginId, nowIso, pending.id, claimMarker),
      env.DB_V2.prepare(
        `INSERT INTO organizations (id, name, status, created_at, updated_at, deleted_at)
         SELECT ?1, p.organization_name, 'active', ?2, ?2, NULL
         FROM pending_registrations p
         WHERE p.id = ?3 AND p.verified_at = ?4
           AND EXISTS (SELECT 1 FROM users WHERE id = ?5)`
      ).bind(organizationId, nowIso, pending.id, claimMarker, userId),
      env.DB_V2.prepare(
        `INSERT INTO organization_members (
           organization_id, user_id, role, status, created_at, updated_at, removed_at
         )
         SELECT ?1, ?2, 'owner', 'active', ?3, ?3, NULL
         WHERE EXISTS (SELECT 1 FROM organizations WHERE id = ?1)
           AND EXISTS (SELECT 1 FROM users WHERE id = ?2)`
      ).bind(organizationId, userId, nowIso),
      env.DB_V2.prepare(
        `INSERT INTO organization_origins (organization_id, source, created_by_user_id, created_at)
         SELECT ?1, 'self_signup', ?2, ?3
         WHERE EXISTS (
           SELECT 1 FROM organization_members
           WHERE organization_id = ?1 AND user_id = ?2 AND role = 'owner' AND status = 'active'
         )`
      ).bind(organizationId, userId, nowIso),
      env.DB_V2.prepare(
        `INSERT INTO organization_quotas (
           organization_id, active_member_limit, pending_invitation_limit,
           invitation_email_daily_limit, created_at, updated_at
         )
         SELECT ?1, 25, 25, 50, ?2, ?2
         WHERE EXISTS (SELECT 1 FROM organizations WHERE id = ?1)`
      ).bind(organizationId, nowIso),
      env.DB_V2.prepare(
        `INSERT INTO auth_sessions (
           id, organization_id, user_id, token_hash, csrf_token_hash,
           created_at, last_seen_at, idle_expires_at, absolute_expires_at, revoked_at
         )
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL
         WHERE EXISTS (
           SELECT 1 FROM organization_members
           WHERE organization_id = ?2 AND user_id = ?3 AND role = 'owner' AND status = 'active'
         )`
      ).bind(sessionId, organizationId, userId, session.tokenHash, session.csrfTokenHash,
        session.createdAt, session.lastSeenAt, session.idleExpiresAt, session.absoluteExpiresAt),
      conditionalRegistrationAuditStatement(env.DB_V2, {
        organizationId,
        userId,
        createdAt: nowIso
      })
    ]);
  } catch (error) {
    if (isEmailConflict(error)) throw new AuthError(400, "REGISTRATION_ALREADY_COMPLETED");
    throw error;
  }
  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[2]?.meta?.changes || 0) !== 1
      || Number(results?.[3]?.meta?.changes || 0) !== 1
      || Number(results?.[4]?.meta?.changes || 0) !== 1
      || Number(results?.[5]?.meta?.changes || 0) !== 1
      || Number(results?.[6]?.meta?.changes || 0) !== 1
      || Number(results?.[7]?.meta?.changes || 0) !== 1) {
    throw new AuthError(400, "REGISTRATION_TOKEN_INVALID");
  }

  return authJson({
    ok: true,
    csrfToken: session.rawCsrfToken,
    session: {
      id: sessionId,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt
    },
    user: {
      id: userId,
      email: pending.email,
      loginId,
      displayName: pending.display_name,
      requirePasswordChange: false
    },
    organization: {
      id: organizationId,
      name: pending.organization_name,
      role: "owner"
    }
  }, 201, {
    "set-cookie": serializeSessionCookie(session.rawSessionToken, request, env, session.absoluteExpiresAt, now)
  });
}

async function handleResetRequest(request, env, ctx) {
  requirePublicPost(request, env);
  const input = await readJsonObject(request);
  assertOnlyFields(input, ["email", "turnstileToken"]);
  const email = requireEmail(input.email);
  await requireTurnstile(request, env, input.turnstileToken);
  await consumePublicEmailRateLimit(request, env, email, "password-reset");
  const user = await env.DB_V2.prepare(
    `SELECT id, email FROM users
     WHERE email = ?1 COLLATE NOCASE AND email_verified_at IS NOT NULL AND status = 'active'
     LIMIT 1`
  ).bind(email).first();
  if (!user) return authJson(ACCEPTED, 202);

  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET revoked_at = ?1
       WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, user.id),
    env.DB_V2.prepare(
      `INSERT INTO password_reset_tokens (
         id, user_id, token_hash, created_by_user_id, created_at, expires_at,
         used_at, revoked_at, email_snapshot, delivery_requested_at
       ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, NULL, NULL, ?6, ?4)`
    ).bind(makeId("prt"), user.id, tokenHash, nowIso, expiresAt, email)
  ]);
  schedule(ctx, sendPasswordReset(env, { email, rawToken, requestId: makeId("req") }));
  return authJson(ACCEPTED, 202);
}

function conditionalRegistrationAuditStatement(db, entry) {
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     )
     SELECT ?1, ?2, 'user', ?3, 'owner',
            'organization.self_signup', 'organization', ?2, '{}', ?4
     WHERE EXISTS (
       SELECT 1 FROM organization_members
       WHERE organization_id = ?2 AND user_id = ?3
         AND role = 'owner' AND status = 'active'
     )`
  ).bind(makeId("audit"), entry.organizationId, entry.userId, entry.createdAt);
}

function requirePublicPost(request, env) {
  requireMethod(request, "POST");
  if (!env?.DB_V2) throw new AuthError(500, "DB_V2_NOT_CONFIGURED");
  requireSameOrigin(request, env);
  rejectOrganizationSelector(request);
}

function emailAuthRequired(env) {
  return String(env?.EMAIL_AUTH_REQUIRED || "0") === "1";
}

function schedule(ctx, promise) {
  const guarded = Promise.resolve(promise).catch(() => undefined);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(guarded);
  else return guarded;
}

function requireMethod(request, method) {
  if (request.method !== method) throw new AuthError(405, "METHOD_NOT_ALLOWED", { headers: { allow: method } });
}

function makeClaimMarker(now) {
  const base = new Date(now.getTime() + 1).toISOString();
  const nonce = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  return base.replace("Z", `${nonce}Z`);
}

function isEmailConflict(error) {
  const message = String(error?.message || error).toLowerCase();
  return message.includes("unique") && (message.includes("email") || message.includes("token_hash"));
}
