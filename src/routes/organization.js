import { auditStatement } from "../auth/audit.js";
import {
  requireCsrf,
  requireJsonContentType,
  requireSameOrigin,
  requireUnsafeRequestProtection
} from "../auth/csrf.js";
import { AuthError } from "../auth/errors.js";
import { authJson } from "../auth/http.js";
import { requireAuth } from "../auth/middleware.js";
import {
  PASSWORD_SCHEME,
  createSalt,
  hashPassword,
  requireValidPassword
} from "../auth/passwords.js";
import {
  PERMISSIONS,
  canManageMember,
  requirePermission
} from "../auth/permissions.js";
import {
  assertOnlyFields,
  decodeCursor,
  encodeCursor,
  makeId,
  normalizeDisplayName,
  normalizeLoginId,
  normalizeMembershipStatus,
  normalizeRole,
  parseLimit,
  readJsonObject,
  readOptionalJsonObject,
  rejectOrganizationSelector
} from "../auth/request.js";
import {
  handleOrganizationInvitationApi,
  issueMemberPasswordResetEmail
} from "./account-lifecycle.js";
import { handleOrganizationAiApi } from "./ai-settings.js";
import { handleOrganizationContentFilterApi } from "./content-filter.js";

export async function handleOrganizationApi(request, env, ctx) {
  const filterResponse = await handleOrganizationContentFilterApi(request, env, ctx);
  if (filterResponse) return filterResponse;
  const aiResponse = await handleOrganizationAiApi(request, env, ctx);
  if (aiResponse) return aiResponse;
  const invitationResponse = await handleOrganizationInvitationApi(request, env, ctx);
  if (invitationResponse) return invitationResponse;
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/org") return handleOrganization(request, env);
  if (path === "/api/org/members") {
    if (request.method === "GET") return handleMembersList(request, env);
    if (request.method === "POST") return handleMemberCreate(request, env);
    throw methodNotAllowed("GET, POST");
  }
  if (path === "/api/org/audit-logs") return handleAuditLogs(request, env);

  const resetMatch = path.match(/^\/api\/org\/members\/([^/]+)\/password-reset$/);
  if (resetMatch) return handlePasswordResetIssue(request, env, ctx, decodePathComponent(resetMatch[1]));
  const memberMatch = path.match(/^\/api\/org\/members\/([^/]+)$/);
  if (memberMatch) {
    const userId = decodePathComponent(memberMatch[1]);
    if (request.method === "PATCH") return handleMemberUpdate(request, env, userId);
    if (request.method === "DELETE") return handleMemberDelete(request, env, userId);
    throw methodNotAllowed("PATCH, DELETE");
  }
  return authJson({ ok: false, error: "NOT_FOUND" }, 404);
}

async function handleOrganization(request, env) {
  requireMethod(request, "GET");
  rejectOrganizationSelector(request);
  const auth = await requireAuth(request, env);
  const organization = await env.DB_V2.prepare(
    `SELECT id, name, status, created_at, updated_at
     FROM organizations WHERE id = ?1 LIMIT 1`
  ).bind(auth.organizationId).first();
  if (!organization) throw new AuthError(404, "ORGANIZATION_NOT_FOUND");
  return authJson({
    ok: true,
    organization: {
      id: organization.id,
      name: organization.name,
      status: organization.status,
      createdAt: organization.created_at,
      updatedAt: organization.updated_at,
      role: auth.role
    }
  });
}

async function handleMembersList(request, env) {
  rejectOrganizationSelector(request);
  const auth = await requireAuth(request, env);
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"), 4);
  let sql = `
    SELECT m.user_id, u.login_id, u.email, u.email_verified_at, u.display_name, m.role, m.status,
           m.created_at, m.updated_at
    FROM organization_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = ?1`;
  const values = [auth.organizationId];
  if (cursor) {
    sql += ` AND (
      m.role > ?2 OR
      (m.role = ?2 AND m.status > ?3) OR
      (m.role = ?2 AND m.status = ?3 AND m.created_at > ?4) OR
      (m.role = ?2 AND m.status = ?3 AND m.created_at = ?4 AND m.user_id > ?5)
    )`;
    values.push(...cursor);
  }
  sql += ` ORDER BY m.role ASC, m.status ASC, m.created_at ASC, m.user_id ASC LIMIT ?${values.length + 1}`;
  values.push(limit + 1);
  const rows = rowsOf(await env.DB_V2.prepare(sql).bind(...values).all());
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit
    ? encodeCursor([
      page.at(-1).role,
      page.at(-1).status,
      page.at(-1).created_at,
      page.at(-1).user_id
    ])
    : null;
  return authJson({
    ok: true,
    members: page.map(memberResponse),
    nextCursor
  });
}

async function handleMemberCreate(request, env) {
  requireMethod(request, "POST");
  if (String(env?.EMAIL_AUTH_REQUIRED || "0") === "1") {
    throw new AuthError(410, "MEMBER_INVITATION_REQUIRED");
  }
  const auth = await requireAuth(request, env, { refresh: false });
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  await requireUnsafeRequestProtection(request, env, auth);

  const newUserForm = Object.hasOwn(input, "loginId") || Object.hasOwn(input, "displayName") || Object.hasOwn(input, "temporaryPassword");
  const existingUserForm = Object.hasOwn(input, "existingUserId");
  if (newUserForm === existingUserForm) throw new AuthError(400, "MEMBER_FORM_INVALID");

  const role = normalizeRole(input.role);
  if (!role) throw new AuthError(400, "ROLE_INVALID");
  requireRoleAssignment(auth.role, role);
  const now = new Date().toISOString();
  let userId;

  if (newUserForm) {
    assertOnlyFields(input, ["loginId", "displayName", "role", "temporaryPassword"]);
    const loginId = normalizeLoginId(input.loginId);
    const displayName = normalizeDisplayName(input.displayName);
    const temporaryPassword = typeof input.temporaryPassword === "string" ? input.temporaryPassword : "";
    if (!loginId) throw new AuthError(400, "LOGIN_ID_INVALID");
    if (!displayName) throw new AuthError(400, "DISPLAY_NAME_INVALID");
    requireValidPassword(temporaryPassword, loginId);
    const existing = await env.DB_V2.prepare(
      `SELECT id FROM users WHERE login_id = ?1 LIMIT 1`
    ).bind(loginId).first();
    if (existing) throw new AuthError(409, "LOGIN_ID_ALREADY_EXISTS");

    userId = makeId("usr");
    const salt = createSalt();
    const passwordHash = await hashPassword(temporaryPassword, salt);
    try {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `INSERT INTO users (
           id, login_id, display_name, password_scheme, password_hash, password_salt,
           password_changed_at, status, created_at, updated_at, deleted_at,
           failed_login_count, locked_until, require_password_change
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?7, ?7, NULL, 0, NULL, 1)`
      ).bind(userId, loginId, displayName, PASSWORD_SCHEME, passwordHash, salt, now),
      membershipInsertStatement(env.DB_V2, auth.organizationId, userId, role, now),
      auditStatement(env.DB_V2, {
        organizationId: auth.organizationId,
        actorType: "user",
        actorUserId: auth.userId,
        actorRole: auth.role,
        action: "member.created",
        targetType: "user",
        targetId: userId,
        details: { role, existingUser: false }
        })
      ]);
    } catch (error) {
      if (isUniqueConstraint(error, "users.login_id")) throw new AuthError(409, "LOGIN_ID_ALREADY_EXISTS");
      if (isUniqueConstraint(error, "organization_members")) throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");
      throw error;
    }
  } else {
    assertOnlyFields(input, ["existingUserId", "role"]);
    userId = normalizeUserId(input.existingUserId);
    const user = userId ? await env.DB_V2.prepare(
      `SELECT id, status FROM users WHERE id = ?1 LIMIT 1`
    ).bind(userId).first() : null;
    if (!user) throw new AuthError(404, "USER_NOT_FOUND");
    if (user.status !== "active") throw new AuthError(409, "USER_INACTIVE");
    const existingMembership = await env.DB_V2.prepare(
      `SELECT status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2 LIMIT 1`
    ).bind(auth.organizationId, userId).first();
    if (existingMembership) throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");
    try {
      await env.DB_V2.batch([
        membershipInsertStatement(env.DB_V2, auth.organizationId, userId, role, now),
        auditStatement(env.DB_V2, {
          organizationId: auth.organizationId,
          actorType: "user",
          actorUserId: auth.userId,
          actorRole: auth.role,
          action: "member.created",
          targetType: "user",
          targetId: userId,
          details: { role, existingUser: true }
        })
      ]);
    } catch (error) {
      if (isUniqueConstraint(error, "organization_members")) throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");
      throw error;
    }
  }

  const member = await loadMember(env.DB_V2, auth.organizationId, userId);
  return authJson({ ok: true, member: memberResponse(member) }, 201);
}

async function handleMemberUpdate(request, env, userIdValue) {
  requireMethod(request, "PATCH");
  const auth = await requireAuth(request, env, { refresh: false });
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["role", "status"]);
  await requireUnsafeRequestProtection(request, env, auth);
  if (!Object.hasOwn(input, "role") && !Object.hasOwn(input, "status")) {
    throw new AuthError(400, "MEMBER_UPDATE_REQUIRED");
  }
  const userId = normalizeUserId(userIdValue);
  if (!userId) throw new AuthError(404, "MEMBER_NOT_FOUND");
  const current = await loadMember(env.DB_V2, auth.organizationId, userId);
  if (!current) throw new AuthError(404, "MEMBER_NOT_FOUND");
  if (current.status === "removed") throw new AuthError(409, "MEMBERSHIP_REMOVED");
  if (!canManageMember(auth.role, current.role, "update")) throw new AuthError(403, "ROLE_FORBIDDEN");

  const role = Object.hasOwn(input, "role") ? normalizeRole(input.role) : current.role;
  const status = Object.hasOwn(input, "status") ? normalizeMembershipStatus(input.status) : current.status;
  if (!role) throw new AuthError(400, "ROLE_INVALID");
  if (!status) throw new AuthError(400, "MEMBERSHIP_STATUS_INVALID");
  requireRoleAssignment(auth.role, role);
  if (auth.role === "admin" && current.role !== "teacher") throw new AuthError(403, "ROLE_FORBIDDEN");

  if (role === current.role && status === current.status) {
    return authJson({ ok: true, member: memberResponse(current) });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const operationMarker = makeOperationMarker(now);
  const statements = [
    guardedMembershipUpdate(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role,
      status,
      removedAt: null,
      updatedAt: operationMarker
    }),
    conditionalSessionRevocation(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role,
      status,
      operationMarker,
      revokedAt: nowIso
    }),
    conditionalMembershipAudit(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role,
      status,
      operationMarker,
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "auth.session.revoked",
      details: { reason: "membership_changed" },
      createdAt: nowIso
    })
  ];
  if (role !== current.role) {
    statements.push(conditionalMembershipAudit(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role,
      status,
      operationMarker,
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "member.role_changed",
      details: { oldRole: current.role, newRole: role },
      createdAt: nowIso
    }));
  }
  if (status !== current.status) {
    statements.push(conditionalMembershipAudit(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role,
      status,
      operationMarker,
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: status === "active" ? "member.activated" : "member.suspended",
      details: { oldStatus: current.status, newStatus: status },
      createdAt: nowIso
    }));
  }
  const results = await env.DB_V2.batch(statements);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
    await throwMembershipUpdateFailure(env.DB_V2, auth.organizationId, userId, current, role, status);
  }

  const member = await loadMember(env.DB_V2, auth.organizationId, userId);
  return authJson({ ok: true, member: memberResponse(member) });
}

async function handleMemberDelete(request, env, userIdValue) {
  requireMethod(request, "DELETE");
  const auth = await requireAuth(request, env, { refresh: false });
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  rejectOrganizationSelector(request);
  await requireUnsafeRequestProtection(request, env, auth);
  const userId = normalizeUserId(userIdValue);
  const current = userId ? await loadMember(env.DB_V2, auth.organizationId, userId) : null;
  if (!current) throw new AuthError(404, "MEMBER_NOT_FOUND");
  if (!canManageMember(auth.role, current.role, "remove")) throw new AuthError(403, "ROLE_FORBIDDEN");
  if (current.status === "removed") return authJson(null, 204);

  const now = new Date();
  const nowIso = now.toISOString();
  const operationMarker = makeOperationMarker(now);
  const results = await env.DB_V2.batch([
    guardedMembershipUpdate(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role: current.role,
      status: "removed",
      removedAt: operationMarker,
      updatedAt: operationMarker
    }),
    conditionalSessionRevocation(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role: current.role,
      status: "removed",
      operationMarker,
      revokedAt: nowIso
    }),
    conditionalMembershipAudit(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role: current.role,
      status: "removed",
      operationMarker,
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "auth.session.revoked",
      details: { reason: "membership_removed" },
      createdAt: nowIso
    }),
    conditionalMembershipAudit(env.DB_V2, {
      organizationId: auth.organizationId,
      userId,
      role: current.role,
      status: "removed",
      operationMarker,
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "member.removed",
      details: { oldStatus: current.status },
      createdAt: nowIso
    })
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
    await throwMembershipUpdateFailure(env.DB_V2, auth.organizationId, userId, current, current.role, "removed");
  }
  return authJson(null, 204);
}

async function handlePasswordResetIssue(request, env, ctx, userIdValue) {
  requireMethod(request, "POST");
  const auth = await requireAuth(request, env, { refresh: false });
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  requireSameOrigin(request, env);
  requireJsonContentType(request);
  const input = await readOptionalJsonObject(request);
  rejectOrganizationSelector(request, input);
  if (input) assertOnlyFields(input, []);
  await requireCsrf(request, env, auth);
  const userId = normalizeUserId(userIdValue);
  const target = userId ? await loadMember(env.DB_V2, auth.organizationId, userId) : null;
  if (!target || target.status !== "active" || target.user_status !== "active") {
    throw new AuthError(404, "MEMBER_NOT_FOUND");
  }
  if (!canManageMember(auth.role, target.role, "password-reset")) throw new AuthError(403, "ROLE_FORBIDDEN");
  return issueMemberPasswordResetEmail(request, env, ctx, auth, target);
}

async function handleAuditLogs(request, env) {
  requireMethod(request, "GET");
  rejectOrganizationSelector(request);
  const auth = await requireAuth(request, env);
  requirePermission(auth, PERMISSIONS.AUDIT_READ);
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"), 2);
  const action = url.searchParams.get("action");
  if (action !== null && (action.length < 1 || action.length > 100)) throw new AuthError(400, "ACTION_INVALID");

  let sql = `
    SELECT id, organization_id, actor_type, actor_user_id, actor_role,
           action, target_type, target_id, details_json, created_at
    FROM audit_logs
    WHERE organization_id = ?1`;
  const values = [auth.organizationId];
  if (action !== null) {
    sql += ` AND action = ?${values.length + 1}`;
    values.push(action);
  }
  if (cursor) {
    sql += ` AND (created_at < ?${values.length + 1} OR (created_at = ?${values.length + 1} AND id < ?${values.length + 2}))`;
    values.push(...cursor);
  }
  sql += ` ORDER BY created_at DESC, id DESC LIMIT ?${values.length + 1}`;
  values.push(limit + 1);
  const rows = rowsOf(await env.DB_V2.prepare(sql).bind(...values).all());
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit
    ? encodeCursor([page.at(-1).created_at, page.at(-1).id])
    : null;
  return authJson({
    ok: true,
    logs: page.map(auditResponse),
    nextCursor
  });
}

function guardedMembershipUpdate(db, { organizationId, userId, role, status, removedAt, updatedAt }) {
  return db.prepare(
    `UPDATE organization_members
     SET role = ?1, status = ?2, updated_at = ?3, removed_at = ?4
     WHERE organization_id = ?5 AND user_id = ?6
       AND NOT (
         role = 'owner' AND status = 'active'
         AND NOT (?1 = 'owner' AND ?2 = 'active')
         AND (
           SELECT COUNT(*) FROM organization_members owners
           WHERE owners.organization_id = ?5
             AND owners.role = 'owner'
             AND owners.status = 'active'
         ) <= 1
       )`
  ).bind(role, status, updatedAt, removedAt, organizationId, userId);
}

function conditionalSessionRevocation(db, state) {
  return db.prepare(
    `UPDATE auth_sessions SET revoked_at = ?1
     WHERE organization_id = ?2 AND user_id = ?3 AND revoked_at IS NULL
       AND EXISTS (
         SELECT 1 FROM organization_members
         WHERE organization_id = ?2 AND user_id = ?3
           AND role = ?4 AND status = ?5 AND updated_at = ?6
       )`
  ).bind(
    state.revokedAt, state.organizationId, state.userId,
    state.role, state.status, state.operationMarker
  );
}

function conditionalMembershipAudit(db, entry) {
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     )
     SELECT ?1, ?2, 'user', ?3, ?4, ?5, 'user', ?6, ?7, ?8
     WHERE EXISTS (
       SELECT 1 FROM organization_members
       WHERE organization_id = ?2 AND user_id = ?6
         AND role = ?9 AND status = ?10 AND updated_at = ?11
     )`
  ).bind(
    makeId("aud"), entry.organizationId, entry.actorUserId, entry.actorRole,
    entry.action, entry.userId, JSON.stringify(entry.details || {}), entry.createdAt,
    entry.role, entry.status, entry.operationMarker
  );
}

function makeOperationMarker(now) {
  const base = new Date(now.getTime() + 1).toISOString();
  const nonce = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  return base.replace("Z", `${nonce}Z`);
}

async function throwMembershipUpdateFailure(db, organizationId, userId, current, nextRole, nextStatus) {
  const fresh = await loadMember(db, organizationId, userId);
  if (!fresh) throw new AuthError(404, "MEMBER_NOT_FOUND");
  if (
    current.role === "owner" && current.status === "active"
    && !(nextRole === "owner" && nextStatus === "active")
  ) {
    const owners = await db.prepare(
      `SELECT COUNT(*) AS count FROM organization_members
       WHERE organization_id = ?1 AND role = 'owner' AND status = 'active'`
    ).bind(organizationId).first();
    if (Number(owners?.count || 0) <= 1) throw new AuthError(409, "LAST_OWNER_REQUIRED");
  }
  throw new AuthError(409, "MEMBER_UPDATE_CONFLICT");
}

function membershipInsertStatement(db, organizationId, userId, role, now) {
  return db.prepare(
    `INSERT INTO organization_members (
       organization_id, user_id, role, status, created_at, updated_at, removed_at
     ) VALUES (?1, ?2, ?3, 'active', ?4, ?4, NULL)`
  ).bind(organizationId, userId, role, now);
}

async function loadMember(db, organizationId, userId) {
  return db.prepare(
    `SELECT m.user_id, u.login_id, u.email, u.email_verified_at, u.display_name, u.status AS user_status,
            m.role, m.status, m.created_at, m.updated_at
     FROM organization_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = ?1 AND m.user_id = ?2 LIMIT 1`
  ).bind(organizationId, userId).first();
}

function memberResponse(row) {
  return {
    userId: row.user_id,
    loginId: row.login_id,
    email: row.email || null,
    emailVerified: Boolean(row.email_verified_at),
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function auditResponse(row) {
  let details = null;
  if (row.details_json) {
    try {
      details = JSON.parse(row.details_json);
    } catch {
      details = null;
    }
  }
  return {
    id: row.id,
    actorType: row.actor_type,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details,
    createdAt: row.created_at
  };
}

function requireRoleAssignment(actorRole, targetRole) {
  if (actorRole === "owner") return;
  if (actorRole === "admin" && targetRole === "teacher") return;
  throw new AuthError(403, "ROLE_FORBIDDEN");
}

function decodePathComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AuthError(400, "INVALID_PATH_PARAMETER");
  }
}

function normalizeUserId(value) {
  const normalized = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{4,128}$/.test(normalized) ? normalized : "";
}

function requireMethod(request, method) {
  if (request.method !== method) throw methodNotAllowed(method);
}

function methodNotAllowed(allow) {
  return new AuthError(405, "METHOD_NOT_ALLOWED", { headers: { allow } });
}

function isUniqueConstraint(error, target) {
  const message = String(error?.message || error);
  return /UNIQUE constraint failed/i.test(message) && message.includes(target);
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}
