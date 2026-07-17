import { readSessionToken } from "./cookies.js";
import { AuthError } from "./errors.js";
import { hashToken } from "./passwords.js";
import { requireRole as enforceRole } from "./permissions.js";
import {
  attachSessionInternal,
  refreshedIdleExpiry,
  shouldRefreshSession
} from "./sessions.js";

const SESSION_LOOKUP_SQL = `
SELECT
  s.id AS session_id,
  s.organization_id,
  s.user_id,
  s.csrf_token_hash,
  s.created_at AS session_created_at,
  s.last_seen_at,
  s.idle_expires_at,
  s.absolute_expires_at,
  s.revoked_at,
  u.login_id,
  u.email,
  u.display_name,
  u.status AS user_status,
  o.status AS organization_status,
  m.role,
  m.status AS membership_status
FROM auth_sessions s
JOIN users u
  ON u.id = s.user_id
JOIN organizations o
  ON o.id = s.organization_id
JOIN organization_members m
  ON m.organization_id = s.organization_id
 AND m.user_id = s.user_id
WHERE s.token_hash = ?1
LIMIT 1`;

export async function requireAuth(request, env, options = {}) {
  if (!env?.DB_V2) throw new AuthError(500, "DB_V2_NOT_CONFIGURED");
  const rawToken = readSessionToken(request, env);
  if (!rawToken) throw new AuthError(401, "AUTH_REQUIRED");
  const tokenHash = await hashToken(rawToken);
  const row = await env.DB_V2.prepare(SESSION_LOOKUP_SQL).bind(tokenHash).first();
  if (!row) throw new AuthError(401, "AUTH_REQUIRED");

  const now = options.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError("Invalid middleware clock.");
  if (row.revoked_at) throw new AuthError(401, "SESSION_REVOKED");
  if (!Number.isFinite(Date.parse(row.last_seen_at || ""))) throw new AuthError(401, "SESSION_EXPIRED");
  if (dateAtOrBefore(row.idle_expires_at, nowMs) || dateAtOrBefore(row.absolute_expires_at, nowMs)) {
    throw new AuthError(401, "SESSION_EXPIRED");
  }
  if (row.user_status !== "active") throw new AuthError(401, "MEMBERSHIP_INACTIVE");
  if (row.organization_status !== "active") throw new AuthError(401, "MEMBERSHIP_INACTIVE");
  if (row.membership_status !== "active") throw new AuthError(401, "MEMBERSHIP_INACTIVE");
  if (!new Set(["owner", "admin", "teacher"]).has(row.role)) {
    throw new AuthError(403, "ROLE_FORBIDDEN");
  }

  if (options.refresh !== false && shouldRefreshSession(row.last_seen_at, now)) {
    const idleExpiresAt = refreshedIdleExpiry(row.absolute_expires_at, now);
    if (idleExpiresAt) {
      await env.DB_V2.prepare(
        `UPDATE auth_sessions
         SET last_seen_at = ?1, idle_expires_at = ?2
         WHERE id = ?3
           AND revoked_at IS NULL
           AND last_seen_at = ?4`
      ).bind(now.toISOString(), idleExpiresAt, row.session_id, row.last_seen_at).run();
      row.last_seen_at = now.toISOString();
      row.idle_expires_at = idleExpiresAt;
    }
  }

  return attachSessionInternal({
    sessionId: row.session_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    loginId: row.login_id,
    email: row.email || null,
    displayName: row.display_name
  }, {
    csrfTokenHash: row.csrf_token_hash,
    absoluteExpiresAt: row.absolute_expires_at,
    idleExpiresAt: row.idle_expires_at,
    tokenHash
  });
}

export function requireRole(auth, allowedRoles) {
  return enforceRole(auth, allowedRoles);
}

export function authSessionLookupSql() {
  return SESSION_LOOKUP_SQL;
}

function dateAtOrBefore(value, nowMs) {
  const parsed = Date.parse(value || "");
  return !Number.isFinite(parsed) || parsed <= nowMs;
}
