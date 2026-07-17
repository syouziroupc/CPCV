import { recordLoginFailure, isAccountLocked } from "../auth/account-lock.js";
import { auditStatement, writeAudit } from "../auth/audit.js";
import { serializeClearedSessionCookie, serializeSessionCookie } from "../auth/cookies.js";
import {
  requireCsrf,
  requireSameOrigin,
  requireJsonContentType,
  requireUnsafeRequestProtection
} from "../auth/csrf.js";
import { AuthError } from "../auth/errors.js";
import { authJson } from "../auth/http.js";
import { requireAuth } from "../auth/middleware.js";
import {
  PASSWORD_SCHEME,
  createSalt,
  createToken,
  hashPassword,
  hashToken,
  needsPasswordRehash,
  requireValidPassword,
  verifyPassword
} from "../auth/passwords.js";
import { buildRateLimitKey, checkRateLimit } from "../auth/rate-limit.js";
import {
  assertOnlyFields,
  makeId,
  normalizeLoginId,
  readJsonObject,
  readOptionalJsonObject,
  rejectOrganizationSelector
} from "../auth/request.js";
import { createSessionMaterial, getSessionInternal } from "../auth/sessions.js";
import { issueSessionCsrfToken } from "../auth/csrf-tokens.js";
import { normalizeEmail } from "../auth/email.js";
import { handleEmailAuthApi } from "./email-auth.js";
import { handleAccountLifecycleAuthApi } from "./account-lifecycle.js";

const DUMMY_SALT = "AAAAAAAAAAAAAAAAAAAAAA";
const DUMMY_PASSWORD = "not-a-real-account-password";
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
let dummyHashPromise;

export async function handleAuthApi(request, env, ctx) {
  const emailResponse = await handleEmailAuthApi(request, env, ctx);
  if (emailResponse) return emailResponse;
  const lifecycleResponse = await handleAccountLifecycleAuthApi(request, env, ctx);
  if (lifecycleResponse) return lifecycleResponse;
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/login") return handleLogin(request, env);
  if (path === "/api/auth/logout") return handleLogout(request, env);
  if (path === "/api/auth/session") return handleSession(request, env);
  if (path === "/api/auth/password/change") return handlePasswordChange(request, env);
  if (path === "/api/auth/password/reset") return handlePasswordReset(request, env);
  return authJson({ ok: false, error: "NOT_FOUND" }, 404);
}

async function handleLogin(request, env) {
  requireMethod(request, "POST");
  requireDatabase(env);
  requireSameOrigin(request, env);
  const input = await readJsonObject(request);
  assertOnlyFields(input, ["email", "loginId", "password", "organizationId"]);
  const email = normalizeEmail(input.email);
  const loginId = normalizeLoginId(input.loginId);
  const password = typeof input.password === "string" ? input.password : "";
  const requestedOrganizationId = typeof input.organizationId === "string" ? input.organizationId : "";
  const requireEmail = String(env?.EMAIL_AUTH_REQUIRED || "0") === "1";
  if (requireEmail && (!email || loginId)) throw new AuthError(400, "EMAIL_AUTH_REQUIRED");
  const accountKey = email || loginId;

  await enforceLoginRateLimits(request, env, accountKey);

  const user = email
    ? await env.DB_V2.prepare(
      `SELECT id, login_id, email, email_verified_at, display_name, password_scheme, password_hash, password_salt,
              status, failed_login_count, locked_until, require_password_change
       FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
    ).bind(email).first()
    : loginId
      ? await env.DB_V2.prepare(
        `SELECT id, login_id, email, email_verified_at, display_name, password_scheme, password_hash, password_salt,
                status, failed_login_count, locked_until, require_password_change
         FROM users WHERE login_id = ?1 LIMIT 1`
      ).bind(loginId).first()
      : null;

  if (!user) {
    await verifyPassword(password, DUMMY_SALT, await dummyPasswordHash(), PASSWORD_SCHEME);
    await safeAudit(env.DB_V2, {
      actorType: "system",
      action: "auth.login.failure",
      targetType: "auth",
      details: { reason: "USER_NOT_FOUND" }
    });
    throw invalidCredentials();
  }

  if (isAccountLocked(user)) {
    await safeAudit(env.DB_V2, {
      actorType: "system",
      action: "auth.login.failure",
      targetType: "user",
      targetId: user.id,
      details: { reason: "ACCOUNT_LOCKED" }
    });
    throw invalidCredentials();
  }

  const passwordValid = await verifyPassword(
    password,
    user.password_salt,
    user.password_hash,
    user.password_scheme
  );
  if (!passwordValid) {
    const failure = await recordLoginFailure(env.DB_V2, user.id);
    await safeAudit(env.DB_V2, {
      actorType: "system",
      action: "auth.login.failure",
      targetType: "user",
      targetId: user.id,
      details: {
        reason: failure.lockedUntil ? "PASSWORD_INVALID_LOCKED" : "PASSWORD_INVALID",
        failureCount: failure.failedLoginCount
      }
    });
    throw invalidCredentials();
  }

  if (email && !user.email_verified_at) {
    await safeAudit(env.DB_V2, {
      actorType: "system",
      action: "auth.login.failure",
      targetType: "user",
      targetId: user.id,
      details: { reason: "EMAIL_NOT_VERIFIED" }
    });
    throw invalidCredentials();
  }

  if (user.status !== "active") {
    await safeAudit(env.DB_V2, {
      actorType: "system",
      action: "auth.login.failure",
      targetType: "user",
      targetId: user.id,
      details: { reason: `USER_${String(user.status).toUpperCase()}` }
    });
    throw invalidCredentials();
  }

  const memberships = rowsOf(await env.DB_V2.prepare(
    `SELECT m.organization_id, m.role, o.name AS organization_name
     FROM organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ?1 AND m.status = 'active' AND o.status = 'active'
     ORDER BY o.name ASC, m.organization_id ASC`
  ).bind(user.id).all());

  if (memberships.length === 0) {
    await safeAudit(env.DB_V2, {
      actorType: "system",
      action: "auth.login.failure",
      targetType: "user",
      targetId: user.id,
      details: { reason: "NO_ACTIVE_MEMBERSHIP" }
    });
    throw invalidCredentials();
  }

  let membership;
  if (memberships.length === 1) {
    membership = memberships[0];
  } else if (!requestedOrganizationId) {
    return authJson({
      ok: false,
      error: "ORGANIZATION_SELECTION_REQUIRED",
      organizations: memberships.map(publicMembershipChoice)
    }, 409);
  } else {
    membership = memberships.find((item) => item.organization_id === requestedOrganizationId);
    if (!membership) {
      await safeAudit(env.DB_V2, {
        actorType: "system",
        action: "auth.login.failure",
        targetType: "user",
        targetId: user.id,
        details: { reason: "ORGANIZATION_SELECTION_INVALID" }
      });
      throw invalidCredentials();
    }
  }

  const now = new Date();
  const session = await createSessionMaterial(now);
  const sessionId = makeId("ses");
  const statements = [];

  if (needsPasswordRehash(user.password_scheme)) {
    const salt = createSalt();
    const passwordHash = await hashPassword(password, salt);
    statements.push(env.DB_V2.prepare(
      `UPDATE users
       SET password_scheme = ?1, password_hash = ?2, password_salt = ?3,
           updated_at = ?4, failed_login_count = 0, locked_until = NULL
       WHERE id = ?5`
    ).bind(PASSWORD_SCHEME, passwordHash, salt, now.toISOString(), user.id));
  } else {
    statements.push(env.DB_V2.prepare(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ?1 WHERE id = ?2`
    ).bind(now.toISOString(), user.id));
  }

  const sessionInsertIndex = statements.length;
  statements.push(sessionInsertStatement(env.DB_V2, {
    id: sessionId,
    organizationId: membership.organization_id,
    userId: user.id,
    session
  }));
  statements.push(sessionAuditStatement(env.DB_V2, {
    sessionId,
    organizationId: membership.organization_id,
    actorUserId: user.id,
    actorRole: membership.role,
    action: "auth.login.success",
    details: { rehashed: needsPasswordRehash(user.password_scheme) },
    createdAt: now.toISOString()
  }));
  const loginResults = await env.DB_V2.batch(statements);
  if (Number(loginResults?.[sessionInsertIndex]?.meta?.changes || 0) !== 1) {
    throw invalidCredentials();
  }

  return authJson(sessionResponse({
    user,
    membership,
    sessionId,
    session,
    csrfToken: session.rawCsrfToken
  }), 200, {
    "set-cookie": serializeSessionCookie(
      session.rawSessionToken,
      request,
      env,
      session.absoluteExpiresAt,
      now
    )
  });
}

async function handleSession(request, env) {
  requireMethod(request, "GET");
  rejectOrganizationSelector(request);
  const auth = await requireAuth(request, env);
  const internal = getSessionInternal(auth);
  const context = await loadSessionContext(env.DB_V2, auth.sessionId);
  if (!context) throw new AuthError(401, "AUTH_REQUIRED");
  const issued = await issueSessionCsrfToken(
    env.DB_V2,
    auth.sessionId,
    context.absolute_expires_at || internal?.absoluteExpiresAt
  );
  return authJson(sessionResponseFromContext(context, issued.rawToken));
}

async function handleLogout(request, env) {
  requireMethod(request, "POST");
  const auth = await requireAuth(request, env, { refresh: false });
  requireSameOrigin(request, env);
  requireJsonContentType(request);
  const input = await readOptionalJsonObject(request);
  rejectOrganizationSelector(request, input);
  if (input) assertOnlyFields(input, []);
  await requireCsrf(request, env, auth);
  const now = new Date().toISOString();
  await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE auth_sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL`
    ).bind(now, auth.sessionId),
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "auth.logout",
      targetType: "auth_session",
      targetId: auth.sessionId,
      createdAt: now,
      condition: {
        sql: "EXISTS (SELECT 1 FROM auth_sessions WHERE id = ?11 AND revoked_at = ?12)",
        bindings: [auth.sessionId, now]
      }
    })
  ]);
  return authJson({ ok: true }, 200, {
    "set-cookie": serializeClearedSessionCookie(request, env)
  });
}

async function handlePasswordChange(request, env) {
  requireMethod(request, "POST");
  const auth = await requireAuth(request, env, { refresh: false });
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["currentPassword", "newPassword"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  const user = await env.DB_V2.prepare(
    `SELECT id, login_id, email, email_verified_at, display_name, password_scheme, password_hash, password_salt,
            require_password_change
     FROM users WHERE id = ?1 AND status = 'active' LIMIT 1`
  ).bind(auth.userId).first();
  if (!user || !await verifyPassword(currentPassword, user.password_salt, user.password_hash, user.password_scheme)) {
    throw new AuthError(401, "CURRENT_PASSWORD_INVALID");
  }
  requireValidPassword(newPassword, user.email || user.login_id);
  const organization = await env.DB_V2.prepare(
    `SELECT name FROM organizations
     WHERE id = ?1 AND status = 'active'
       AND EXISTS (
         SELECT 1 FROM organization_members
         WHERE organization_id = ?1 AND user_id = ?2 AND status = 'active'
       )
     LIMIT 1`
  ).bind(auth.organizationId, auth.userId).first();
  if (!organization) throw new AuthError(401, "AUTH_REQUIRED");

  const now = new Date();
  const nowIso = now.toISOString();
  const changeMarker = makeClaimMarker(now);
  const salt = createSalt();
  const passwordHash = await hashPassword(newPassword, salt);
  const session = await createSessionMaterial(now);
  const sessionId = makeId("ses");
  const changeResults = await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE users
       SET password_scheme = ?1, password_hash = ?2, password_salt = ?3,
           password_changed_at = ?4, updated_at = ?5,
           require_password_change = 0, failed_login_count = 0, locked_until = NULL
       WHERE id = ?6 AND status = 'active'
         AND EXISTS (
           SELECT 1
           FROM organization_members m
           JOIN organizations o ON o.id = m.organization_id
           WHERE m.organization_id = ?7 AND m.user_id = ?6
             AND m.status = 'active' AND o.status = 'active'
         )`
    ).bind(PASSWORD_SCHEME, passwordHash, salt, nowIso, changeMarker, auth.userId, auth.organizationId),
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET revoked_at = ?1
       WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL
         AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND updated_at = ?3)`
    ).bind(nowIso, auth.userId, changeMarker),
    env.DB_V2.prepare(
      `UPDATE auth_sessions SET revoked_at = ?1
       WHERE user_id = ?2 AND revoked_at IS NULL
         AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND updated_at = ?3)`
    ).bind(nowIso, auth.userId, changeMarker),
    sessionInsertStatement(env.DB_V2, {
      id: sessionId,
      organizationId: auth.organizationId,
      userId: auth.userId,
      userUpdatedAt: changeMarker,
      session
    }),
    userAuditStatement(env.DB_V2, {
      userId: auth.userId,
      userUpdatedAt: changeMarker,
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "auth.password.changed",
      targetType: "user",
      targetId: auth.userId,
      createdAt: nowIso
    })
  ]);
  if (Number(changeResults?.[0]?.meta?.changes || 0) !== 1
      || Number(changeResults?.[3]?.meta?.changes || 0) !== 1) {
    throw new AuthError(401, "AUTH_REQUIRED");
  }

  const membership = {
    organization_id: auth.organizationId,
    organization_name: organization.name,
    role: auth.role
  };
  user.password_scheme = PASSWORD_SCHEME;
  user.require_password_change = 0;
  return authJson(sessionResponse({
    user,
    membership,
    sessionId,
    session,
    csrfToken: session.rawCsrfToken
  }), 200, {
    "set-cookie": serializeSessionCookie(
      session.rawSessionToken,
      request,
      env,
      session.absoluteExpiresAt,
      now
    )
  });
}

async function handlePasswordReset(request, env) {
  requireMethod(request, "POST");
  requireDatabase(env);
  requireSameOrigin(request, env);
  requireJsonContentType(request);
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["token", "newPassword"]);
  const rawToken = typeof input.token === "string" ? input.token : "";
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  if (!rawToken) throw new AuthError(400, "RESET_TOKEN_INVALID");
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const record = await env.DB_V2.prepare(
    `SELECT r.id, r.user_id, r.expires_at, r.used_at, r.revoked_at, r.email_snapshot,
            u.login_id, u.email, u.status AS user_status
     FROM password_reset_tokens r
     JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = ?1 LIMIT 1`
  ).bind(tokenHash).first();
  if (!record || record.used_at || record.revoked_at || record.user_status !== "active"
      || (record.email_snapshot && record.email_snapshot !== record.email)) {
    throw new AuthError(400, "RESET_TOKEN_INVALID");
  }
  if (Date.parse(record.expires_at) <= now.getTime()) {
    throw new AuthError(400, "RESET_TOKEN_EXPIRED");
  }
  requireValidPassword(newPassword, record.email || record.login_id);

  // Hash before entering the atomic update. A hashing failure must not consume the token.
  const salt = createSalt();
  const passwordHash = await hashPassword(newPassword, salt);
  const nowIso = now.toISOString();
  const claimMarker = makeClaimMarker(now);
  const results = await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE users
       SET password_scheme = ?1, password_hash = ?2, password_salt = ?3,
           password_changed_at = ?4, updated_at = ?4,
           require_password_change = 0, failed_login_count = 0, locked_until = NULL
       WHERE id = ?5 AND status = 'active'
         AND EXISTS (
           SELECT 1 FROM password_reset_tokens
           WHERE id = ?6 AND user_id = ?5
             AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?4
         )`
    ).bind(PASSWORD_SCHEME, passwordHash, salt, nowIso, record.user_id, record.id),
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET used_at = ?1
       WHERE id = ?2 AND user_id = ?3
         AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?4`
    ).bind(claimMarker, record.id, record.user_id, nowIso),
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET revoked_at = ?1
       WHERE user_id = ?2 AND id <> ?3 AND used_at IS NULL AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1 FROM password_reset_tokens
           WHERE id = ?3 AND used_at = ?4
         )`
    ).bind(nowIso, record.user_id, record.id, claimMarker),
    env.DB_V2.prepare(
      `UPDATE auth_sessions SET revoked_at = ?1
       WHERE user_id = ?2 AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1 FROM password_reset_tokens
           WHERE id = ?3 AND used_at = ?4
         )`
    ).bind(nowIso, record.user_id, record.id, claimMarker),
    conditionalAuditStatement(env.DB_V2, {
      claimTokenId: record.id,
      claimMarker,
      actorType: "system",
      action: "auth.password_reset.used",
      targetType: "user",
      targetId: record.user_id,
      createdAt: nowIso
    })
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    throw new AuthError(400, "RESET_TOKEN_INVALID");
  }
  return authJson({ ok: true });
}

function makeClaimMarker(now) {
  const base = new Date(now.getTime() + 1).toISOString();
  const nonce = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  return base.replace("Z", `${nonce}Z`);
}

function conditionalAuditStatement(db, entry) {
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     )
     SELECT ?1, NULL, ?2, NULL, NULL, ?3, ?4, ?5, NULL, ?6
     WHERE EXISTS (
       SELECT 1 FROM password_reset_tokens
       WHERE id = ?7 AND used_at = ?8
     )`
  ).bind(
    makeId("aud"),
    entry.actorType,
    entry.action,
    entry.targetType,
    entry.targetId,
    entry.createdAt,
    entry.claimTokenId,
    entry.claimMarker
  );
}

async function enforceLoginRateLimits(request, env, loginId) {
  const pepper = env?.AUTH_RATE_LIMIT_PEPPER;
  const production = String(env?.APP_ENV || "").toLowerCase() === "production";
  const cloudflareIp = request.headers.get("cf-connecting-ip") || "";
  if (production && !cloudflareIp) throw new AuthError(500, "AUTH_CLIENT_IP_UNAVAILABLE");
  if (production && (typeof env?.AUTH_LOGIN_IP_LIMITER?.limit !== "function"
      || typeof env?.AUTH_LOGIN_ACCOUNT_LIMITER?.limit !== "function")) {
    throw new AuthError(500, "AUTH_RATE_LIMITER_NOT_CONFIGURED");
  }
  const ipValue = cloudflareIp
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local-unknown";
  const ipKey = await buildRateLimitKey(ipValue, pepper, "login-ip");
  const accountKey = await buildRateLimitKey(loginId || "invalid", pepper, "login-account");
  const onFailure = async (source) => {
    await safeAudit(env.DB_V2, {
      actorType: "system",
      action: "auth.rate_limiter.unavailable",
      targetType: "auth",
      details: { source }
    });
  };
  const ip = await checkRateLimit(env.AUTH_LOGIN_IP_LIMITER, ipKey, {
    onFailure: () => onFailure("ip")
  });
  const account = await checkRateLimit(env.AUTH_LOGIN_ACCOUNT_LIMITER, accountKey, {
    onFailure: () => onFailure("account")
  });
  if (ip.unavailable || account.unavailable) {
    throw new AuthError(503, "RATE_LIMIT_UNAVAILABLE", { headers: { "retry-after": "60" }, expose: true });
  }
  if (!ip.success || !account.success) {
    await safeAudit(env.DB_V2, {
      actorType: "system",
      action: "auth.login.rate_limited",
      targetType: "auth",
      details: { source: !ip.success ? "ip" : "account" }
    });
    throw new AuthError(429, "RATE_LIMITED", { headers: { "retry-after": "60" } });
  }
}

function sessionInsertStatement(db, { id, organizationId, userId, userUpdatedAt = null, session }) {
  return db.prepare(
    `INSERT INTO auth_sessions (
       id, organization_id, user_id, token_hash, csrf_token_hash,
       created_at, last_seen_at, idle_expires_at, absolute_expires_at, revoked_at
     )
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL
     WHERE EXISTS (
       SELECT 1
       FROM users u
       JOIN organizations o ON o.id = ?2
       JOIN organization_members m
         ON m.organization_id = ?2 AND m.user_id = u.id
       WHERE u.id = ?3
         AND u.status = 'active'
         AND o.status = 'active'
         AND m.status = 'active'
         AND (?10 IS NULL OR u.updated_at = ?10)
     )`
  ).bind(
    id,
    organizationId,
    userId,
    session.tokenHash,
    session.csrfTokenHash,
    session.createdAt,
    session.lastSeenAt,
    session.idleExpiresAt,
    session.absoluteExpiresAt,
    userUpdatedAt
  );
}

function userAuditStatement(db, entry) {
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     )
     SELECT ?1, ?2, 'user', ?3, ?4, ?5, ?6, ?7, NULL, ?8
     WHERE EXISTS (SELECT 1 FROM users WHERE id = ?9 AND updated_at = ?10)`
  ).bind(
    makeId("aud"), entry.organizationId, entry.actorUserId, entry.actorRole,
    entry.action, entry.targetType, entry.targetId, entry.createdAt,
    entry.userId, entry.userUpdatedAt
  );
}

function sessionAuditStatement(db, entry) {
  const details = entry.details ? JSON.stringify(entry.details) : null;
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     )
     SELECT ?1, ?2, 'user', ?3, ?4, ?5, 'auth_session', ?6, ?7, ?8
     WHERE EXISTS (SELECT 1 FROM auth_sessions WHERE id = ?6)`
  ).bind(
    makeId("aud"), entry.organizationId, entry.actorUserId, entry.actorRole,
    entry.action, entry.sessionId, details, entry.createdAt
  );
}

async function loadSessionContext(db, sessionId) {
  return db.prepare(
    `SELECT s.id AS session_id, s.organization_id, s.user_id,
            s.idle_expires_at, s.absolute_expires_at,
            u.login_id, u.email, u.email_verified_at, u.display_name, u.require_password_change,
            o.name AS organization_name, m.role
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = s.organization_id
     JOIN organization_members m ON m.organization_id = s.organization_id AND m.user_id = s.user_id
     WHERE s.id = ?1 AND s.revoked_at IS NULL
       AND u.status = 'active' AND o.status = 'active' AND m.status = 'active'
     LIMIT 1`
  ).bind(sessionId).first();
}

function sessionResponse({ user, membership, sessionId, session, csrfToken }) {
  return {
    ok: true,
    csrfToken,
    session: {
      id: sessionId,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt
    },
    user: {
      id: user.id,
      loginId: user.login_id,
      email: user.email || null,
      emailVerified: Boolean(user.email_verified_at),
      displayName: user.display_name,
      requirePasswordChange: Boolean(user.require_password_change)
    },
    organization: {
      id: membership.organization_id,
      name: membership.organization_name,
      role: membership.role
    }
  };
}

function sessionResponseFromContext(context, csrfToken) {
  return {
    ok: true,
    csrfToken,
    session: {
      id: context.session_id,
      idleExpiresAt: context.idle_expires_at,
      absoluteExpiresAt: context.absolute_expires_at
    },
    user: {
      id: context.user_id,
      loginId: context.login_id,
      email: context.email || null,
      emailVerified: Boolean(context.email_verified_at),
      displayName: context.display_name,
      requirePasswordChange: Boolean(context.require_password_change)
    },
    organization: {
      id: context.organization_id,
      name: context.organization_name,
      role: context.role
    }
  };
}

function publicMembershipChoice(row) {
  return {
    id: row.organization_id,
    name: row.organization_name,
    role: row.role
  };
}

function invalidCredentials() {
  return new AuthError(401, "INVALID_CREDENTIALS");
}

function requireMethod(request, method) {
  if (request.method !== method) throw new AuthError(405, "METHOD_NOT_ALLOWED", { headers: { allow: method } });
}

function requireDatabase(env) {
  if (!env?.DB_V2) throw new AuthError(500, "DB_V2_NOT_CONFIGURED");
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

async function dummyPasswordHash() {
  dummyHashPromise ||= hashPassword(DUMMY_PASSWORD, DUMMY_SALT, PASSWORD_SCHEME);
  return dummyHashPromise;
}

async function safeAudit(db, entry) {
  try {
    await writeAudit(db, entry);
  } catch {
    // Authentication responses must not reveal whether audit storage was temporarily unavailable.
  }
}

export const AUTH_ROUTE_INTERNALS = Object.freeze({
  RESET_TOKEN_TTL_MS,
  sessionInsertStatement,
  sessionResponse,
  rowsOf
});
