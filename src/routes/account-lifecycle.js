import { auditStatement } from "../auth/audit.js";
import { serializeClearedSessionCookie, serializeSessionCookie } from "../auth/cookies.js";
import {
  requireCsrf,
  requireJsonContentType,
  requireSameOrigin,
  requireUnsafeRequestProtection
} from "../auth/csrf.js";
import { normalizeEmail, requireEmail, maskEmail, internalLoginId } from "../auth/email.js";
import { AuthError } from "../auth/errors.js";
import { authJson } from "../auth/http.js";
import { requireAuth } from "../auth/middleware.js";
import {
  PASSWORD_SCHEME,
  createSalt,
  createToken,
  hashPassword,
  hashToken,
  requireValidPassword,
  verifyPassword
} from "../auth/passwords.js";
import { PERMISSIONS, requirePermission } from "../auth/permissions.js";
import {
  assertOnlyFields,
  makeId,
  normalizeDisplayName,
  normalizeRole,
  readJsonObject,
  readOptionalJsonObject,
  rejectOrganizationSelector
} from "../auth/request.js";
import { createSessionMaterial } from "../auth/sessions.js";
import { consumePublicEmailRateLimit } from "../auth/public-auth-rate.js";
import {
  sendEmailChangeConfirmation,
  sendEmailChangedNotice,
  sendOrganizationInvitation,
  sendPasswordReset
} from "../auth/email-service.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_CHANGE_TTL_MS = 30 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const ACCEPTED = Object.freeze({ ok: true, accepted: true });

export async function handleAccountLifecycleAuthApi(request, env, ctx) {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/account") return handleAccount(request, env);
  if (path === "/api/auth/invitations/inspect") return handleInvitationInspect(request, env);
  if (path === "/api/auth/invitations/accept") return handleInvitationAccept(request, env);
  if (path === "/api/auth/email-change/request") return handleEmailChangeRequest(request, env, ctx);
  if (path === "/api/auth/email-change/confirm") return handleEmailChangeConfirm(request, env, ctx);
  return null;
}

export async function handleOrganizationInvitationApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/org/invitations") {
    if (request.method === "GET") return handleInvitationList(request, env);
    if (request.method === "POST") return handleInvitationCreate(request, env, ctx);
    throw methodNotAllowed("GET, POST");
  }
  const resend = path.match(/^\/api\/org\/invitations\/([^/]+)\/resend$/);
  if (resend) return handleInvitationResend(request, env, ctx, decodePathComponent(resend[1]));
  const item = path.match(/^\/api\/org\/invitations\/([^/]+)$/);
  if (item) return handleInvitationRevoke(request, env, decodePathComponent(item[1]));
  return null;
}

async function handleAccount(request, env) {
  requireMethod(request, "GET");
  rejectOrganizationSelector(request);
  const auth = await requireAuth(request, env);
  const user = await env.DB_V2.prepare(
    `SELECT id, login_id, email, email_verified_at, display_name, status, created_at, updated_at
     FROM users WHERE id = ?1 LIMIT 1`
  ).bind(auth.userId).first();
  if (!user) throw new AuthError(401, "AUTH_REQUIRED");
  const memberships = rowsOf(await env.DB_V2.prepare(
    `SELECT m.organization_id, o.name AS organization_name, m.role, m.status
     FROM organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ?1 AND o.status <> 'deleted'
     ORDER BY o.name ASC, m.organization_id ASC`
  ).bind(auth.userId).all());
  const pending = await env.DB_V2.prepare(
    `SELECT new_email, expires_at, 'change' AS kind
     FROM email_change_requests
     WHERE user_id = ?1 AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
     UNION ALL
     SELECT new_email, expires_at, 'enrollment' AS kind
     FROM email_enrollment_requests
     WHERE user_id = ?1 AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
     LIMIT 1`
  ).bind(auth.userId, new Date().toISOString()).first();
  return authJson({
    ok: true,
    user: {
      id: user.id,
      email: user.email || null,
      emailVerified: Boolean(user.email_verified_at),
      displayName: user.display_name,
      status: user.status,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    },
    currentOrganizationId: auth.organizationId,
    organizations: memberships.map((row) => ({
      id: row.organization_id,
      name: row.organization_name,
      role: row.role,
      status: row.status
    })),
    pendingEmail: pending ? {
      email: pending.new_email,
      kind: pending.kind,
      expiresAt: pending.expires_at
    } : null
  });
}

async function handleInvitationList(request, env) {
  rejectOrganizationSelector(request);
  const auth = await requireAuth(request, env);
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  const now = new Date().toISOString();
  const invitations = rowsOf(await env.DB_V2.prepare(
    `SELECT id, email, role, created_at, expires_at, last_sent_at, resend_count
     FROM organization_invitations
     WHERE organization_id = ?1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
     ORDER BY created_at DESC, id DESC
     LIMIT 100`
  ).bind(auth.organizationId, now).all());
  const quota = await loadQuota(env.DB_V2, auth.organizationId);
  const counts = await loadOrganizationCounts(env.DB_V2, auth.organizationId, now);
  return authJson({
    ok: true,
    invitations: invitations.map(invitationResponse),
    quota: quota ? {
      activeMemberLimit: Number(quota.active_member_limit),
      pendingInvitationLimit: Number(quota.pending_invitation_limit),
      invitationEmailDailyLimit: Number(quota.invitation_email_daily_limit),
      activeMembers: counts.activeMembers,
      pendingInvitations: counts.pendingInvitations,
      invitationEmailsToday: counts.invitationEmailsToday
    } : null
  });
}

async function handleInvitationCreate(request, env, ctx) {
  requireMethod(request, "POST");
  const auth = await requireAuth(request, env, { refresh: false });
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["email", "role"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const email = requireEmail(input.email);
  const role = normalizeRole(input.role);
  if (!role) throw new AuthError(400, "ROLE_INVALID");
  requireRoleAssignment(auth.role, role);

  const existingUser = await env.DB_V2.prepare(
    `SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(email).first();
  if (existingUser) {
    const membership = await env.DB_V2.prepare(
      `SELECT status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2 LIMIT 1`
    ).bind(auth.organizationId, existingUser.id).first();
    if (membership && membership.status !== "removed") throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");
  }

  const organization = await env.DB_V2.prepare(
    `SELECT name FROM organizations WHERE id = ?1 AND status = 'active' LIMIT 1`
  ).bind(auth.organizationId).first();
  if (!organization) throw new AuthError(404, "ORGANIZATION_NOT_FOUND");

  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
  const invitationId = makeId("inv");
  const eventId = makeId("eme");
  try {
    await env.DB_V2.batch([
      env.DB_V2.prepare(
        `UPDATE organization_invitations SET revoked_at = ?1
         WHERE organization_id = ?2 AND email = ?3 COLLATE NOCASE
           AND accepted_at IS NULL AND revoked_at IS NULL`
      ).bind(nowIso, auth.organizationId, email),
      env.DB_V2.prepare(
        `INSERT INTO organization_invitations (
           id, organization_id, email, role, token_hash, invited_by_user_id,
           created_at, expires_at, accepted_at, accepted_user_id, revoked_at,
           last_sent_at, resend_count
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, NULL, ?7, 0)`
      ).bind(invitationId, auth.organizationId, email, role, tokenHash, auth.userId, nowIso, expiresAt),
      organizationEmailEventStatement(env.DB_V2, eventId, auth.organizationId, nowIso),
      auditStatement(env.DB_V2, {
        organizationId: auth.organizationId,
        actorType: "user",
        actorUserId: auth.userId,
        actorRole: auth.role,
        action: "organization.invitation.created",
        targetType: "organization_invitation",
        targetId: invitationId,
        details: { role, emailMask: maskEmail(email), expiresAt }
      })
    ]);
  } catch (error) {
    throw mapInvitationDatabaseError(error);
  }
  schedule(ctx, sendOrganizationInvitation(env, {
    organizationId: auth.organizationId,
    email,
    organizationName: organization.name,
    role,
    rawToken,
    requestId: makeId("req")
  }));
  return authJson({ ok: true, accepted: true, invitationId, expiresAt }, 202);
}

async function handleInvitationResend(request, env, ctx, invitationId) {
  requireMethod(request, "POST");
  const auth = await requireAuth(request, env, { refresh: false });
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  requireSameOrigin(request, env);
  requireJsonContentType(request);
  const input = await readOptionalJsonObject(request);
  rejectOrganizationSelector(request, input);
  if (input) assertOnlyFields(input, []);
  await requireCsrf(request, env, auth);
  const now = new Date();
  const nowIso = now.toISOString();
  const invitation = await env.DB_V2.prepare(
    `SELECT i.id, i.email, i.role, i.token_hash, i.last_sent_at, i.expires_at, o.name AS organization_name
     FROM organization_invitations i
     JOIN organizations o ON o.id = i.organization_id
     WHERE i.id = ?1 AND i.organization_id = ?2
       AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?3
     LIMIT 1`
  ).bind(invitationId, auth.organizationId, nowIso).first();
  if (!invitation) throw new AuthError(404, "INVITATION_NOT_FOUND");
  requireRoleAssignment(auth.role, invitation.role);
  if (Date.parse(invitation.last_sent_at) > now.getTime() - 60_000) {
    throw new AuthError(429, "RATE_LIMITED", { headers: { "retry-after": "60" } });
  }
  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const newExpiry = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
  const eventId = makeId("eme");
  let results;
  try {
    results = await env.DB_V2.batch([
      env.DB_V2.prepare(
        `UPDATE organization_invitations
         SET token_hash = ?1, last_sent_at = ?2, expires_at = ?3, resend_count = resend_count + 1
         WHERE id = ?4 AND organization_id = ?5 AND token_hash = ?6
           AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?2`
      ).bind(tokenHash, nowIso, newExpiry, invitationId, auth.organizationId, invitation.token_hash),
      conditionalOrganizationEmailEventStatement(env.DB_V2, {
        id: eventId,
        organizationId: auth.organizationId,
        createdAt: nowIso,
        invitationId,
        tokenHash
      }),
      conditionalInvitationAuditStatement(env.DB_V2, {
        organizationId: auth.organizationId,
        actorType: "user",
        actorUserId: auth.userId,
        actorRole: auth.role,
        action: "organization.invitation.resent",
        targetType: "organization_invitation",
        targetId: invitationId,
        details: { role: invitation.role, emailMask: maskEmail(invitation.email), expiresAt: newExpiry },
        invitationId,
        tokenHash
      })
    ]);
  } catch (error) {
    throw mapInvitationDatabaseError(error);
  }
  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[2]?.meta?.changes || 0) !== 1) {
    throw new AuthError(409, "INVITATION_UPDATE_CONFLICT");
  }
  schedule(ctx, sendOrganizationInvitation(env, {
    organizationId: auth.organizationId,
    email: invitation.email,
    organizationName: invitation.organization_name,
    role: invitation.role,
    rawToken,
    requestId: makeId("req")
  }));
  return authJson({ ok: true, accepted: true, invitationId, expiresAt: newExpiry }, 202);
}

async function handleInvitationRevoke(request, env, invitationId) {
  requireMethod(request, "DELETE");
  const auth = await requireAuth(request, env, { refresh: false });
  requirePermission(auth, PERMISSIONS.MEMBERS_LIST);
  rejectOrganizationSelector(request);
  await requireUnsafeRequestProtection(request, env, auth);
  const invitation = await env.DB_V2.prepare(
    `SELECT id, role FROM organization_invitations
     WHERE id = ?1 AND organization_id = ?2 LIMIT 1`
  ).bind(invitationId, auth.organizationId).first();
  if (!invitation) throw new AuthError(404, "INVITATION_NOT_FOUND");
  requireRoleAssignment(auth.role, invitation.role);
  const now = new Date().toISOString();
  const results = await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE organization_invitations SET revoked_at = ?1
       WHERE id = ?2 AND organization_id = ?3 AND accepted_at IS NULL AND revoked_at IS NULL`
    ).bind(now, invitationId, auth.organizationId),
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "organization.invitation.revoked",
      targetType: "organization_invitation",
      targetId: invitationId
    })
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1) throw new AuthError(409, "INVITATION_UPDATE_CONFLICT");
  return authJson(null, 204);
}

async function handleInvitationInspect(request, env) {
  requirePublicPost(request, env);
  const input = await readJsonObject(request);
  assertOnlyFields(input, ["token"]);
  const invitation = await loadInvitationByToken(env.DB_V2, input.token);
  const user = await env.DB_V2.prepare(
    `SELECT id, email_verified_at, status FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(invitation.email).first();
  return authJson({
    ok: true,
    invitation: {
      organizationName: invitation.organization_name,
      role: invitation.role,
      emailMask: maskEmail(invitation.email),
      expiresAt: invitation.expires_at,
      accountExists: Boolean(user && user.email_verified_at && user.status === "active")
    }
  });
}

async function handleInvitationAccept(request, env) {
  requirePublicPost(request, env);
  const input = await readJsonObject(request);
  assertOnlyFields(input, ["token", "displayName", "password"]);
  const invitation = await loadInvitationByToken(env.DB_V2, input.token);
  const auth = await optionalAuth(request, env);
  if (auth) return acceptInvitationForExistingUser(request, env, input, invitation, auth);
  return acceptInvitationForNewUser(request, env, input, invitation);
}

async function acceptInvitationForExistingUser(request, env, input, invitation, auth) {
  if (Object.hasOwn(input, "displayName") || Object.hasOwn(input, "password")) {
    throw new AuthError(400, "INVITATION_FORM_INVALID");
  }
  requireJsonContentType(request);
  await requireCsrf(request, env, auth);
  const user = await env.DB_V2.prepare(
    `SELECT id, email, email_verified_at, display_name
     FROM users WHERE id = ?1 AND status = 'active' LIMIT 1`
  ).bind(auth.userId).first();
  if (!user || !user.email_verified_at || normalizeEmail(user.email) !== invitation.email) {
    throw new AuthError(403, "INVITATION_EMAIL_MISMATCH");
  }
  const existing = await env.DB_V2.prepare(
    `SELECT role, status FROM organization_members
     WHERE organization_id = ?1 AND user_id = ?2 LIMIT 1`
  ).bind(invitation.organization_id, auth.userId).first();
  if (existing && existing.status !== "removed") throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");

  const now = new Date();
  const nowIso = now.toISOString();
  const claimMarker = makeClaimMarker(now);
  const session = await createSessionMaterial(now);
  const sessionId = makeId("ses");
  const statements = [
    env.DB_V2.prepare(
      `UPDATE organization_invitations
       SET accepted_at = ?1, accepted_user_id = ?2
       WHERE id = ?3 AND token_hash = ?4 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?5`
    ).bind(claimMarker, auth.userId, invitation.id, invitation.token_hash, nowIso)
  ];
  if (existing) {
    statements.push(env.DB_V2.prepare(
      `UPDATE organization_members
       SET role = ?1, status = 'active', updated_at = ?2, removed_at = NULL
       WHERE organization_id = ?3 AND user_id = ?4 AND status = 'removed'
         AND EXISTS (SELECT 1 FROM organization_invitations WHERE id = ?5 AND accepted_at = ?6)`
    ).bind(invitation.role, nowIso, invitation.organization_id, auth.userId, invitation.id, claimMarker));
  } else {
    statements.push(env.DB_V2.prepare(
      `INSERT INTO organization_members (
         organization_id, user_id, role, status, created_at, updated_at, removed_at
       ) SELECT ?1, ?2, ?3, 'active', ?4, ?4, NULL
         WHERE EXISTS (SELECT 1 FROM organization_invitations WHERE id = ?5 AND accepted_at = ?6)`
    ).bind(invitation.organization_id, auth.userId, invitation.role, nowIso, invitation.id, claimMarker));
  }
  statements.push(
    env.DB_V2.prepare(
      `UPDATE auth_sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL
       AND EXISTS (SELECT 1 FROM organization_invitations WHERE id = ?3 AND accepted_at = ?4)`
    ).bind(nowIso, auth.sessionId, invitation.id, claimMarker),
    sessionInsertConditional(env.DB_V2, {
      sessionId,
      organizationId: invitation.organization_id,
      userId: auth.userId,
      invitationId: invitation.id,
      claimMarker,
      session
    }),
    invitationAuditStatement(env.DB_V2, {
      invitationId: invitation.id,
      claimMarker,
      organizationId: invitation.organization_id,
      userId: auth.userId,
      role: invitation.role,
      action: "organization.invitation.accepted",
      createdAt: nowIso
    })
  );
  let results;
  try { results = await env.DB_V2.batch(statements); }
  catch (error) { throw mapInvitationDatabaseError(error); }
  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[3]?.meta?.changes || 0) !== 1) {
    throw new AuthError(409, "INVITATION_UPDATE_CONFLICT");
  }
  return invitationAcceptedResponse(request, env, {
    userId: auth.userId,
    email: invitation.email,
    displayName: user.display_name,
    organizationId: invitation.organization_id,
    organizationName: invitation.organization_name,
    role: invitation.role,
    sessionId,
    session,
    now
  });
}

async function acceptInvitationForNewUser(request, env, input, invitation) {
  const displayName = normalizeDisplayName(input.displayName);
  const password = typeof input.password === "string" ? input.password : "";
  if (!displayName) throw new AuthError(400, "DISPLAY_NAME_INVALID");
  requireValidPassword(password, invitation.email);
  if (await env.DB_V2.prepare(`SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`).bind(invitation.email).first()) {
    throw new AuthError(409, "INVITATION_LOGIN_REQUIRED");
  }
  const salt = createSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date();
  const nowIso = now.toISOString();
  const claimMarker = makeClaimMarker(now);
  const userId = makeId("usr");
  const loginId = internalLoginId();
  const session = await createSessionMaterial(now);
  const sessionId = makeId("ses");
  let results;
  try {
    results = await env.DB_V2.batch([
      env.DB_V2.prepare(
        `INSERT INTO users (
           id, login_id, display_name, password_scheme, password_hash, password_salt,
           password_changed_at, status, created_at, updated_at, deleted_at,
           failed_login_count, locked_until, require_password_change,
           email, email_verified_at, email_updated_at
         ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?7, ?7, NULL,
                  0, NULL, 0, i.email, ?7, ?7
           FROM organization_invitations i
           WHERE i.id = ?8 AND i.token_hash = ?9 AND i.accepted_at IS NULL
             AND i.revoked_at IS NULL AND i.expires_at > ?7`
      ).bind(userId, loginId, displayName, PASSWORD_SCHEME, passwordHash, salt, nowIso, invitation.id, invitation.token_hash),
      env.DB_V2.prepare(
        `UPDATE organization_invitations SET accepted_at = ?1, accepted_user_id = ?2
         WHERE id = ?3 AND token_hash = ?4 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?5
           AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND email = ?6 COLLATE NOCASE)`
      ).bind(claimMarker, userId, invitation.id, invitation.token_hash, nowIso, invitation.email),
      env.DB_V2.prepare(
        `INSERT INTO organization_members (
           organization_id, user_id, role, status, created_at, updated_at, removed_at
         ) SELECT ?1, ?2, ?3, 'active', ?4, ?4, NULL
           WHERE EXISTS (SELECT 1 FROM organization_invitations WHERE id = ?5 AND accepted_at = ?6)`
      ).bind(invitation.organization_id, userId, invitation.role, nowIso, invitation.id, claimMarker),
      sessionInsertConditional(env.DB_V2, {
        sessionId,
        organizationId: invitation.organization_id,
        userId,
        invitationId: invitation.id,
        claimMarker,
        session
      }),
      invitationAuditStatement(env.DB_V2, {
        invitationId: invitation.id,
        claimMarker,
        organizationId: invitation.organization_id,
        userId,
        role: invitation.role,
        action: "organization.invitation.accepted",
        createdAt: nowIso
      })
    ]);
  } catch (error) {
    if (isEmailConflict(error)) throw new AuthError(409, "INVITATION_LOGIN_REQUIRED");
    throw mapInvitationDatabaseError(error);
  }
  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[2]?.meta?.changes || 0) !== 1
      || Number(results?.[3]?.meta?.changes || 0) !== 1) {
    throw new AuthError(409, "INVITATION_UPDATE_CONFLICT");
  }
  return invitationAcceptedResponse(request, env, {
    userId,
    email: invitation.email,
    displayName,
    organizationId: invitation.organization_id,
    organizationName: invitation.organization_name,
    role: invitation.role,
    sessionId,
    session,
    now
  });
}

async function handleEmailChangeRequest(request, env, ctx) {
  requireMethod(request, "POST");
  const auth = await requireAuth(request, env, { refresh: false });
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["newEmail", "currentPassword"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const newEmail = requireEmail(input.newEmail);
  const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
  const user = await env.DB_V2.prepare(
    `SELECT id, email, email_verified_at, password_scheme, password_hash, password_salt, status
     FROM users WHERE id = ?1 LIMIT 1`
  ).bind(auth.userId).first();
  if (!user || user.status !== "active"
      || !await verifyPassword(currentPassword, user.password_salt, user.password_hash, user.password_scheme)) {
    throw new AuthError(401, "CURRENT_PASSWORD_INVALID");
  }
  if (normalizeEmail(user.email) === newEmail) throw new AuthError(409, "EMAIL_UNCHANGED");
  await consumePublicEmailRateLimit(request, env, newEmail, "email-change");
  if (await emailUnavailable(env.DB_V2, newEmail, auth.userId)) throw new AuthError(409, "EMAIL_UNAVAILABLE");

  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS).toISOString();
  const requestId = makeId(user.email ? "emc" : "eme");
  try {
    if (user.email && user.email_verified_at) {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `UPDATE email_change_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`
        ).bind(nowIso, auth.userId),
        env.DB_V2.prepare(
          `INSERT INTO email_change_requests (
             id, user_id, old_email, new_email, token_hash, created_at, expires_at, confirmed_at, revoked_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL)`
        ).bind(requestId, auth.userId, user.email, newEmail, tokenHash, nowIso, expiresAt),
        auditStatement(env.DB_V2, {
          organizationId: auth.organizationId,
          actorType: "user",
          actorUserId: auth.userId,
          actorRole: auth.role,
          action: "auth.email_change.requested",
          targetType: "user",
          targetId: auth.userId,
          details: { newEmailMask: maskEmail(newEmail), expiresAt }
        })
      ]);
    } else {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `UPDATE email_enrollment_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`
        ).bind(nowIso, auth.userId),
        env.DB_V2.prepare(
          `INSERT INTO email_enrollment_requests (
             id, user_id, new_email, token_hash, created_at, expires_at, confirmed_at, revoked_at
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL)`
        ).bind(requestId, auth.userId, newEmail, tokenHash, nowIso, expiresAt),
        auditStatement(env.DB_V2, {
          organizationId: auth.organizationId,
          actorType: "user",
          actorUserId: auth.userId,
          actorRole: auth.role,
          action: "auth.email_enrollment.requested",
          targetType: "user",
          targetId: auth.userId,
          details: { newEmailMask: maskEmail(newEmail), expiresAt }
        })
      ]);
    }
  } catch (error) {
    if (isEmailConflict(error)) throw new AuthError(409, "EMAIL_UNAVAILABLE");
    throw error;
  }
  schedule(ctx, sendEmailChangeConfirmation(env, {
    organizationId: auth.organizationId,
    email: newEmail,
    rawToken,
    enrollment: !(user.email && user.email_verified_at),
    requestId: makeId("req")
  }));
  return authJson(ACCEPTED, 202);
}

async function handleEmailChangeConfirm(request, env, ctx) {
  requirePublicPost(request, env);
  const input = await readJsonObject(request);
  assertOnlyFields(input, ["token"]);
  const rawToken = typeof input.token === "string" ? input.token : "";
  if (!rawToken || rawToken.length > 512) throw new AuthError(400, "EMAIL_CHANGE_TOKEN_INVALID");
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const change = await env.DB_V2.prepare(
    `SELECT r.id, r.user_id, r.old_email, r.new_email, r.expires_at, r.confirmed_at, r.revoked_at,
            u.email AS current_email, u.status AS user_status
     FROM email_change_requests r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = ?1 LIMIT 1`
  ).bind(tokenHash).first();
  const enrollment = change ? null : await env.DB_V2.prepare(
    `SELECT r.id, r.user_id, NULL AS old_email, r.new_email, r.expires_at, r.confirmed_at, r.revoked_at,
            u.email AS current_email, u.status AS user_status
     FROM email_enrollment_requests r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = ?1 LIMIT 1`
  ).bind(tokenHash).first();
  const record = change || enrollment;
  if (!record || record.confirmed_at || record.revoked_at || record.user_status !== "active") {
    throw new AuthError(400, "EMAIL_CHANGE_TOKEN_INVALID");
  }
  if (Date.parse(record.expires_at) <= now.getTime()) throw new AuthError(400, "EMAIL_CHANGE_TOKEN_EXPIRED");
  if (change && normalizeEmail(record.current_email) !== normalizeEmail(record.old_email)) {
    throw new AuthError(400, "EMAIL_CHANGE_TOKEN_INVALID");
  }
  if (enrollment && record.current_email) throw new AuthError(400, "EMAIL_CHANGE_TOKEN_INVALID");
  if (await emailUnavailable(env.DB_V2, record.new_email, record.user_id)) throw new AuthError(409, "EMAIL_UNAVAILABLE");

  const claimMarker = makeClaimMarker(now);
  const table = change ? "email_change_requests" : "email_enrollment_requests";
  let results;
  try {
    results = await env.DB_V2.batch([
      env.DB_V2.prepare(
        `UPDATE ${table} SET confirmed_at = ?1
         WHERE id = ?2 AND token_hash = ?3 AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?4`
      ).bind(claimMarker, record.id, tokenHash, nowIso),
      env.DB_V2.prepare(
        `UPDATE users SET email = ?1, email_verified_at = ?2, email_updated_at = ?2, updated_at = ?2
         WHERE id = ?3 AND status = 'active'
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?4 AND confirmed_at = ?5)`
      ).bind(record.new_email, nowIso, record.user_id, record.id, claimMarker),
      env.DB_V2.prepare(
        `UPDATE auth_sessions SET revoked_at = ?1
         WHERE user_id = ?2 AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?3 AND confirmed_at = ?4)`
      ).bind(nowIso, record.user_id, record.id, claimMarker),
      env.DB_V2.prepare(
        `UPDATE password_reset_tokens SET revoked_at = ?1
         WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?3 AND confirmed_at = ?4)`
      ).bind(nowIso, record.user_id, record.id, claimMarker),
      emailConfirmationAuditStatement(env.DB_V2, {
        table,
        requestId: record.id,
        claimMarker,
        userId: record.user_id,
        action: change ? "auth.email_change.confirmed" : "auth.email_enrollment.confirmed",
        createdAt: nowIso
      })
    ]);
  } catch (error) {
    if (isEmailConflict(error)) throw new AuthError(409, "EMAIL_UNAVAILABLE");
    throw error;
  }
  if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) {
    throw new AuthError(400, "EMAIL_CHANGE_TOKEN_INVALID");
  }
  if (change && record.old_email) {
    schedule(ctx, sendEmailChangedNotice(env, {
      email: record.old_email,
      newEmail: record.new_email,
      requestId: makeId("req")
    }));
  }
  return authJson({ ok: true, email: record.new_email }, 200, {
    "set-cookie": serializeClearedSessionCookie(request, env)
  });
}

export async function issueMemberPasswordResetEmail(request, env, ctx, auth, target) {
  if (!target.email || !target.email_verified_at) throw new AuthError(409, "MEMBER_EMAIL_REQUIRED");
  const activeMemberships = await env.DB_V2.prepare(
    `SELECT COUNT(*) AS count FROM organization_members
     WHERE user_id = ?1 AND status = 'active'`
  ).bind(target.user_id).first();
  if (Number(activeMemberships?.count || 0) > 1) {
    throw new AuthError(409, "RESET_REQUIRES_SYSTEM_OPERATOR");
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const tokenId = makeId("prt");
  await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET revoked_at = ?1
       WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, target.user_id),
    env.DB_V2.prepare(
      `INSERT INTO password_reset_tokens (
         id, user_id, token_hash, created_by_user_id, created_at, expires_at,
         used_at, revoked_at, email_snapshot, delivery_requested_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?5)`
    ).bind(tokenId, target.user_id, tokenHash, auth.userId, nowIso, expiresAt, target.email),
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "auth.password_reset.email_requested",
      targetType: "user",
      targetId: target.user_id,
      details: { targetRole: target.role, expiresAt, emailMask: maskEmail(target.email) }
    })
  ]);
  schedule(ctx, sendPasswordReset(env, {
    organizationId: auth.organizationId,
    email: target.email,
    rawToken,
    requestId: makeId("req")
  }));
  return authJson(ACCEPTED, 202);
}

function invitationAcceptedResponse(request, env, entry) {
  return authJson({
    ok: true,
    csrfToken: entry.session.rawCsrfToken,
    session: {
      id: entry.sessionId,
      idleExpiresAt: entry.session.idleExpiresAt,
      absoluteExpiresAt: entry.session.absoluteExpiresAt
    },
    user: {
      id: entry.userId,
      email: entry.email,
      emailVerified: true,
      displayName: entry.displayName,
      requirePasswordChange: false
    },
    organization: {
      id: entry.organizationId,
      name: entry.organizationName,
      role: entry.role
    }
  }, 201, {
    "set-cookie": serializeSessionCookie(
      entry.session.rawSessionToken,
      request,
      env,
      entry.session.absoluteExpiresAt,
      entry.now
    )
  });
}

async function loadInvitationByToken(db, rawTokenValue) {
  const rawToken = typeof rawTokenValue === "string" ? rawTokenValue : "";
  if (!rawToken || rawToken.length > 512) throw new AuthError(400, "INVITATION_INVALID");
  const tokenHash = await hashToken(rawToken);
  const nowIso = new Date().toISOString();
  const row = await db.prepare(
    `SELECT i.id, i.organization_id, i.email, i.role, i.token_hash, i.expires_at,
            i.accepted_at, i.revoked_at, o.name AS organization_name, o.status AS organization_status
     FROM organization_invitations i
     JOIN organizations o ON o.id = i.organization_id
     WHERE i.token_hash = ?1 LIMIT 1`
  ).bind(tokenHash).first();
  if (!row || row.accepted_at || row.revoked_at || row.organization_status !== "active") {
    throw new AuthError(400, "INVITATION_INVALID");
  }
  if (row.expires_at <= nowIso) throw new AuthError(400, "INVITATION_EXPIRED");
  return row;
}

async function optionalAuth(request, env) {
  try { return await requireAuth(request, env, { refresh: false }); }
  catch (error) {
    if (error instanceof AuthError && error.status === 401) return null;
    throw error;
  }
}

async function emailUnavailable(db, email, userId) {
  const user = await db.prepare(
    `SELECT id FROM users WHERE email = ?1 COLLATE NOCASE AND id <> ?2 LIMIT 1`
  ).bind(email, userId).first();
  if (user) return true;
  const pending = await db.prepare(
    `SELECT 1 AS found FROM email_change_requests
     WHERE new_email = ?1 COLLATE NOCASE AND user_id <> ?2
       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?3
     UNION ALL
     SELECT 1 AS found FROM email_enrollment_requests
     WHERE new_email = ?1 COLLATE NOCASE AND user_id <> ?2
       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?3
     LIMIT 1`
  ).bind(email, userId, new Date().toISOString()).first();
  return Boolean(pending);
}

function sessionInsertConditional(db, entry) {
  return db.prepare(
    `INSERT INTO auth_sessions (
       id, organization_id, user_id, token_hash, csrf_token_hash,
       created_at, last_seen_at, idle_expires_at, absolute_expires_at, revoked_at
     ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL
       WHERE EXISTS (SELECT 1 FROM organization_invitations WHERE id = ?10 AND accepted_at = ?11)
         AND EXISTS (
           SELECT 1 FROM organization_members
           WHERE organization_id = ?2 AND user_id = ?3 AND status = 'active'
         )`
  ).bind(
    entry.sessionId, entry.organizationId, entry.userId,
    entry.session.tokenHash, entry.session.csrfTokenHash,
    entry.session.createdAt, entry.session.lastSeenAt,
    entry.session.idleExpiresAt, entry.session.absoluteExpiresAt,
    entry.invitationId, entry.claimMarker
  );
}

function invitationAuditStatement(db, entry) {
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     ) SELECT ?1, ?2, 'user', ?3, ?4, ?5, 'organization_invitation', ?6, '{}', ?7
       WHERE EXISTS (SELECT 1 FROM organization_invitations WHERE id = ?6 AND accepted_at = ?8)`
  ).bind(
    makeId("aud"), entry.organizationId, entry.userId, entry.role,
    entry.action, entry.invitationId, entry.createdAt, entry.claimMarker
  );
}

function emailConfirmationAuditStatement(db, entry) {
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     ) SELECT ?1, NULL, 'system', NULL, NULL, ?2, 'user', ?3, '{}', ?4
       WHERE EXISTS (SELECT 1 FROM ${entry.table} WHERE id = ?5 AND confirmed_at = ?6)`
  ).bind(makeId("aud"), entry.action, entry.userId, entry.createdAt, entry.requestId, entry.claimMarker);
}

function conditionalOrganizationEmailEventStatement(db, entry) {
  return db.prepare(
    `INSERT INTO organization_email_events (id, organization_id, kind, day_key, created_at)
     SELECT ?1, ?2, 'organization_invitation', substr(?3, 1, 10), ?3
     WHERE EXISTS (
       SELECT 1 FROM organization_invitations
       WHERE id = ?4 AND organization_id = ?2 AND token_hash = ?5
         AND accepted_at IS NULL AND revoked_at IS NULL
     )`
  ).bind(entry.id, entry.organizationId, entry.createdAt, entry.invitationId, entry.tokenHash);
}

function conditionalInvitationAuditStatement(db, entry) {
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
       WHERE EXISTS (
         SELECT 1 FROM organization_invitations
         WHERE id = ?11 AND organization_id = ?2 AND token_hash = ?12
           AND accepted_at IS NULL AND revoked_at IS NULL
       )`
  ).bind(
    makeId("aud"), entry.organizationId, entry.actorType, entry.actorUserId,
    entry.actorRole, entry.action, entry.targetType, entry.targetId,
    JSON.stringify(entry.details || {}), new Date().toISOString(),
    entry.invitationId, entry.tokenHash
  );
}

function organizationEmailEventStatement(db, id, organizationId, createdAt) {
  return db.prepare(
    `INSERT INTO organization_email_events (id, organization_id, kind, day_key, created_at)
     VALUES (?1, ?2, 'organization_invitation', substr(?3, 1, 10), ?3)`
  ).bind(id, organizationId, createdAt);
}


async function loadQuota(db, organizationId) {
  return db.prepare(
    `SELECT active_member_limit, pending_invitation_limit, invitation_email_daily_limit
     FROM organization_quotas WHERE organization_id = ?1 LIMIT 1`
  ).bind(organizationId).first();
}

async function loadOrganizationCounts(db, organizationId, nowIso) {
  const dayKey = nowIso.slice(0, 10);
  const row = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM organization_members WHERE organization_id = ?1 AND status = 'active') AS active_members,
       (SELECT COUNT(*) FROM organization_invitations
        WHERE organization_id = ?1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?2) AS pending_invitations,
       (SELECT COUNT(*) FROM organization_email_events
        WHERE organization_id = ?1 AND kind = 'organization_invitation' AND day_key = ?3) AS invitation_emails_today`
  ).bind(organizationId, nowIso, dayKey).first();
  return {
    activeMembers: Number(row?.active_members || 0),
    pendingInvitations: Number(row?.pending_invitations || 0),
    invitationEmailsToday: Number(row?.invitation_emails_today || 0)
  };
}

function invitationResponse(row) {
  return {
    id: row.id,
    email: row.email,
    emailMask: maskEmail(row.email),
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSentAt: row.last_sent_at,
    resendCount: Number(row.resend_count || 0)
  };
}

function requireRoleAssignment(actorRole, targetRole) {
  if (actorRole === "owner") return;
  if (actorRole === "admin" && targetRole === "teacher") return;
  throw new AuthError(403, "ROLE_FORBIDDEN");
}

function mapInvitationDatabaseError(error) {
  const message = String(error?.message || error);
  if (message.includes("MEMBER_LIMIT_REACHED")) return new AuthError(409, "MEMBER_LIMIT_REACHED");
  if (message.includes("INVITATION_LIMIT_REACHED")) return new AuthError(409, "INVITATION_LIMIT_REACHED");
  if (message.includes("INVITATION_EMAIL_DAILY_LIMIT_REACHED")) return new AuthError(429, "INVITATION_EMAIL_DAILY_LIMIT_REACHED");
  if (/UNIQUE constraint failed/i.test(message)) return new AuthError(409, "INVITATION_CONFLICT");
  return error;
}

function isEmailConflict(error) {
  const message = String(error?.message || error).toLowerCase();
  return message.includes("unique") && (message.includes("email") || message.includes("new_email"));
}

function requirePublicPost(request, env) {
  requireMethod(request, "POST");
  if (!env?.DB_V2) throw new AuthError(500, "DB_V2_NOT_CONFIGURED");
  requireSameOrigin(request, env);
  requireJsonContentType(request);
  rejectOrganizationSelector(request);
}

function schedule(ctx, promise) {
  const guarded = Promise.resolve(promise).catch(() => undefined);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(guarded);
  else return guarded;
}

function makeClaimMarker(now) {
  const base = new Date(now.getTime() + 1).toISOString();
  const nonce = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  return base.replace("Z", `${nonce}Z`);
}

function decodePathComponent(value) {
  try { return decodeURIComponent(value); }
  catch { throw new AuthError(400, "INVALID_PATH_PARAMETER"); }
}

function requireMethod(request, method) {
  if (request.method !== method) throw methodNotAllowed(method);
}

function methodNotAllowed(allow) {
  return new AuthError(405, "METHOD_NOT_ALLOWED", { headers: { allow } });
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}
