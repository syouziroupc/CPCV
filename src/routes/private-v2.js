import { auditStatement, writeAudit } from "../auth/audit.js";
import { requireSameOrigin, requireUnsafeRequestProtection } from "../auth/csrf.js";
import { AuthError } from "../auth/errors.js";
import { createToken, hashToken } from "../auth/passwords.js";
import { authJson } from "../auth/http.js";
import { requireAuth } from "../auth/middleware.js";
import { PERMISSIONS, hasPermission, requirePermission, requireRole } from "../auth/permissions.js";
import {
  assertOnlyFields,
  decodeCursor,
  encodeCursor,
  makeId,
  parseLimit,
  readJsonObject,
  rejectOrganizationSelector
} from "../auth/request.js";
import {
  createLegacyProjection,
  loadLegacyProjection,
  restoreLegacyProjection,
  stopLegacyProjection,
  updateLegacyProjection
} from "../db/live-session-projection.js";
import { buildCommentsCsv } from "../comments/csv.js";
import { scheduleAiForComment } from "../ai/processor.js";
import { retentionDays } from "../comments/validation.js";
import { listCommentsForExport, listSessionComments, runCommentRetention } from "../comments/repository.js";
import {
  listCommentModerationActions,
  moderateComment,
  sessionModerationUpsertStatement
} from "../moderation/repository.js";
import {
  normalizeBulkModerationItems,
  normalizeExpectedUpdatedAt,
  normalizeModerationAction,
  normalizeModerationMode,
  normalizeModerationReason,
  parseModerationStateFilter
} from "../moderation/validation.js";

import {
  appendRealtimeEvent,
  consumeConnectionTicket,
  findRealtimeEventForComment,
  getRealtimeEventById,
  issueConnectionTicket,
  realtimeEventStatements
} from "../realtime/repository.js";

import {
  getPrivateSessionAiSettings,
  retryPrivateCommentAi,
  updatePrivateSessionAiSettings
} from "./ai-settings.js";
import { BASE_SECURITY_HEADERS } from "../security-headers.js";
import {
  bindPrivatePdf,
  createPrivateAnalyticsSnapshot,
  exportPrivateAnalyticsSnapshot,
  getPrivateAnalytics,
  getPrivateAnalyticsSnapshots,
  getPrivatePdfState,
  updatePrivatePdfPage
} from "./pdf-analysis.js";
import {
  getPrivateSessionFilterSettings,
  updatePrivateSessionFilterSettings
} from "./content-filter.js";
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const PUBLIC_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DISPLAY_MODES = new Set(["stack3", "stack5", "stack7", "scroll"]);

export async function handlePrivateV2Api(request, env, ctx = { waitUntil() {} }) {
  requireDatabases(env);
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  rejectOrganizationSelector(request);

  if (parts[2] === "me" && request.method === "GET") {
    return authJson({
      ok: true,
      teacher: teacherResponse(auth),
      organization: {
        id: auth.organizationId,
        role: auth.role
      }
    });
  }
  if (parts[2] === "maintenance" && parts[3] === "comment-retention" && parts.length === 4) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    requireRole(auth, "owner");
    await requireUnsafeRequestProtection(request, env, auth);
    const result = await runCommentRetention(env.DB_V2, { now: Date.now(), limit: 500 });
    return authJson({ ok: true, ...result });
  }
  if (parts[2] !== "sessions") return authJson({ ok: false, error: "NOT_FOUND" }, 404);

  if (parts.length === 3) {
    if (request.method === "GET") return listSessions(env, auth);
    if (request.method === "POST") return createSession(request, env, auth);
    throw methodNotAllowed("GET, POST");
  }

  const sessionId = decodePathComponent(parts[3]);
  if (!validSessionId(sessionId)) throw new AuthError(404, "SESSION_NOT_FOUND");
  const session = await loadAuthorizedSession(env.DB_V2, auth, sessionId);
  if (!session) throw new AuthError(404, "SESSION_NOT_FOUND");

  if (parts.length === 4) {
    if (request.method === "GET") return getSession(env, session);
    if (request.method === "DELETE") return deleteSession(request, env, auth, session, ctx);
    throw methodNotAllowed("GET, DELETE");
  }
  if (parts[4] === "settings" && parts.length === 5) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    return updateSettings(request, env, auth, session, ctx);
  }
  if (parts[4] === "ai-settings" && parts.length === 5) {
    if (request.method === "GET") return getPrivateSessionAiSettings(env, auth, session);
    if (request.method === "PATCH") return updatePrivateSessionAiSettings(request, env, auth, session, ctx);
    throw methodNotAllowed("GET, PATCH");
  }
  if (parts[4] === "filter-settings" && parts.length === 5) {
    if (request.method === "GET") return getPrivateSessionFilterSettings(env, auth, session);
    if (request.method === "PATCH") return updatePrivateSessionFilterSettings(request, env, auth, session);
    throw methodNotAllowed("GET, PATCH");
  }
  if (parts[4] === "pdf" && parts[5] === "state" && parts.length === 6) {
    if (request.method === "GET") return getPrivatePdfState(env, auth, session);
    throw methodNotAllowed("GET");
  }
  if (parts[4] === "pdf" && parts[5] === "bind" && parts.length === 6) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    return bindPrivatePdf(request, env, auth, session);
  }
  if (parts[4] === "pdf" && parts[5] === "page" && parts.length === 6) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    return updatePrivatePdfPage(request, env, auth, session);
  }
  if (parts[4] === "analytics" && parts.length === 5) {
    if (request.method !== "GET") throw methodNotAllowed("GET");
    return getPrivateAnalytics(env, auth, session);
  }
  if (parts[4] === "analytics" && parts[5] === "snapshots" && parts.length === 6) {
    if (request.method === "GET") return getPrivateAnalyticsSnapshots(env, auth, session);
    if (request.method === "POST") return createPrivateAnalyticsSnapshot(request, env, auth, session);
    throw methodNotAllowed("GET, POST");
  }
  if (parts[4] === "analytics" && parts[5] === "snapshots" && parts[6] && parts[7] === "export" && parts.length === 8) {
    if (request.method !== "GET") throw methodNotAllowed("GET");
    return exportPrivateAnalyticsSnapshot(env, auth, session, parts[6]);
  }
  if (parts[4] === "comments" && parts.length === 5) {
    if (request.method !== "GET") throw methodNotAllowed("GET");
    return getComments(request, env, session);
  }
  if (parts[4] === "comments" && parts[5] === "moderate-bulk" && parts.length === 6) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    return moderateCommentsBulk(request, env, auth, session);
  }
  if (parts[4] === "comments" && parts[5] && parts[6] === "moderate" && parts.length === 7) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    return moderateSingleComment(request, env, auth, session, decodeCommentId(parts[5]));
  }
  if (parts[4] === "comments" && parts[5] && parts[6] === "moderation" && parts.length === 7) {
    if (request.method !== "GET") throw methodNotAllowed("GET");
    return getCommentModerationHistory(request, env, session, decodeCommentId(parts[5]));
  }
  if (parts[4] === "comments" && parts[5] && parts[6] === "ai-retry" && parts.length === 7) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    return retryPrivateCommentAi(request, env, auth, session, decodeCommentId(parts[5]), ctx);
  }
  if (parts[4] === "comments" && parts[5] === "export" && parts.length === 6) {
    if (request.method !== "GET") throw methodNotAllowed("GET");
    return exportComments(env, session);
  }
  if (parts[4] === "comments" && parts[5] === "clear" && parts.length === 6) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    return clearComments(request, env, auth, session);
  }
  if (parts[4] === "live-ticket" && parts.length === 5) {
    if (request.method !== "POST") throw methodNotAllowed("POST");
    return createLiveTicket(request, env, auth, session);
  }
  if (parts[4] === "live" && parts.length === 5) {
    if (request.method !== "GET") throw methodNotAllowed("GET");
    return connectLive(request, env, auth, session);
  }
  return authJson({ ok: false, error: "NOT_FOUND" }, 404);
}

async function getComments(request, env, session) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 50);
  const cursor = decodeCursor(url.searchParams.get("cursor"), 2);
  const states = parseModerationStateFilter(url.searchParams.get("state"));
  const result = await listSessionComments(env.DB_V2, {
    organizationId: session.organization_id,
    liveSessionId: session.id,
    limit,
    cursor,
    states
  });
  const last = result.rows.at(-1);
  return authJson({
    ok: true,
    comments: result.rows,
    nextCursor: result.hasMore && last ? encodeCursor([last.createdAt, last.id]) : null
  });
}

async function exportComments(env, session) {
  const result = await listCommentsForExport(env.DB_V2, session.organization_id, session.id);
  const csv = buildCommentsCsv({ id: session.id, title: session.title }, result.rows);
  const headers = new Headers({
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="comments-${session.id}.csv"`,
    "cache-control": "no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...BASE_SECURITY_HEADERS,
    "x-cpcv-export-truncated": result.truncated ? "true" : "false"
  });
  return new Response(csv, { status: 200, headers });
}

async function listSessions(env, auth) {
  requireSessionReadPermission(auth);
  const now = new Date().toISOString();
  let sql = `
    SELECT id, organization_id, created_by_user_id, public_code, title,
           posting_enabled, comments_visible, comment_display_seconds,
           comment_display_mode, status, created_at, updated_at,
           started_at, expires_at, ended_at, deleted_at,
           COALESCE((
             SELECT sms.moderation_mode
             FROM session_moderation_settings sms
             WHERE sms.organization_id = live_sessions.organization_id
               AND sms.live_session_id = live_sessions.id
           ), 'off') AS moderation_mode
    FROM live_sessions
    WHERE organization_id = ?1
      AND status = 'active'
      AND expires_at > ?2`;
  const values = [auth.organizationId, now];
  if (auth.role === "teacher") {
    sql += ` AND created_by_user_id = ?3`;
    values.push(auth.userId);
  }
  sql += ` ORDER BY created_at DESC, id DESC`;
  const result = await env.DB_V2.prepare(sql).bind(...values).all();
  return authJson({
    ok: true,
    sessions: rowsOf(result).map((row) => sessionResponse(env, row))
  });
}

async function createSession(request, env, auth) {
  requirePermission(auth, PERMISSIONS.SESSION_CREATE);
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["title", "moderationMode"]);
  await requireUnsafeRequestProtection(request, env, auth);

  const title = normalizeTitle(input.title || "Untitled class");
  if (!title) throw new AuthError(400, "SESSION_TITLE_INVALID");
  const moderationMode = normalizeModerationMode(input.moderationMode ?? "off");
  const sessionId = makeId("sess");
  const publicCode = await createUniquePublicCode(env);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const session = {
    id: sessionId,
    organizationId: auth.organizationId,
    createdByUserId: auth.userId,
    publicCode,
    title,
    postingEnabled: true,
    commentsVisible: true,
    commentDisplaySeconds: 60,
    commentDisplayMode: "stack3",
    moderationMode,
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    startedAt: nowIso,
    expiresAt,
    endedAt: null,
    deletedAt: null
  };

  await env.DB_V2.batch([
    env.DB_V2.prepare(
      `INSERT INTO live_sessions (
         id, organization_id, created_by_user_id, public_code, title,
         posting_enabled, comments_visible, comment_display_seconds,
         comment_display_mode, status, created_at, updated_at,
         started_at, expires_at, ended_at, deleted_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, 60, 'stack3', 'active', ?6, ?6, ?6, ?7, NULL, NULL)`
    ).bind(sessionId, auth.organizationId, auth.userId, publicCode, title, nowIso, expiresAt),
    sessionModerationUpsertStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      liveSessionId: sessionId,
      moderationMode,
      actorUserId: auth.userId,
      updatedAt: nowIso
    }),
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "session.created",
      targetType: "live_session",
      targetId: sessionId,
      details: { publicCode, moderationMode }
    })
  ]);

  try {
    const projectionResult = await createLegacyProjection(env.DB, session, auth);
    if (changesOf(projectionResult) !== 1) throw new Error("LEGACY_PROJECTION_INSERT_FAILED");
  } catch (error) {
    await compensateFailedCreate(env.DB_V2, auth, sessionId, error);
    throw new AuthError(500, "SESSION_PROJECTION_FAILED");
  }

  return authJson({
    ok: true,
    sessionId,
    publicCode,
    title,
    joinUrl: joinUrl(env, publicCode),
    session: publicSessionResponse(env, session)
  }, 201);
}

async function getSession(env, session) {
  if (session.status === "active" && isExpired(session)) {
    throw new AuthError(404, "SESSION_NOT_FOUND");
  }
  return authJson({ ok: true, session: sessionResponse(env, session) });
}

async function updateSettings(request, env, auth, current, ctx) {
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, [
    "postingEnabled",
    "commentsVisible",
    "commentDisplaySeconds",
    "commentDisplayMode",
    "moderationMode",
    "status"
  ]);
  await requireUnsafeRequestProtection(request, env, auth);
  if (current.status !== "active" || isExpired(current)) throw new AuthError(410, "SESSION_EXPIRED");

  const next = nextSessionState(current, input);
  if (next.status === "ended") return endSession(env, auth, current, next, ctx);

  const legacyBefore = await loadLegacyProjection(env.DB, current.id);
  if (!legacyBefore) {
    await recordProjectionInconsistency(env.DB_V2, auth, current.id, "update_missing_legacy");
    throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
  }
  const legacyResult = await updateLegacyProjection(env.DB, current.id, next);
  if (changesOf(legacyResult) !== 1) {
    await recordProjectionInconsistency(env.DB_V2, auth, current.id, "update_legacy_not_changed");
    throw new AuthError(500, "SESSION_PROJECTION_FAILED");
  }

  const updatedAt = new Date().toISOString();
  const realtime = realtimeEventStatements(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: current.id,
    eventType: "settings:update",
    payload: {
      type: "settings:update",
      postingEnabled: next.postingEnabled,
      commentsVisible: next.commentsVisible,
      commentDisplaySeconds: next.commentDisplaySeconds,
      commentDisplayMode: next.commentDisplayMode
    },
    now: Date.parse(updatedAt),
    requiredSessionUpdatedAt: updatedAt
  });
  let updateResults;
  try {
    updateResults = await env.DB_V2.batch([
      sessionUpdateStatement(env.DB_V2, auth, current, next, updatedAt),
      sessionModerationUpsertStatement(env.DB_V2, {
        organizationId: auth.organizationId,
        liveSessionId: current.id,
        moderationMode: next.moderationMode,
        actorUserId: auth.userId,
        updatedAt
      }),
      conditionalSessionAudit(env.DB_V2, {
        auth,
        sessionId: current.id,
        updatedAt,
        action: "session.updated",
        details: changedSettings(current, next)
      }),
      ...realtime.statements
    ]);
    if (changesOf(updateResults?.[0]) !== 1) throw new SessionConflictError();
    if (changesOf(updateResults?.[4]) !== 1 || changesOf(updateResults?.[5]) !== 1) {
      throw new AuthError(500, "REALTIME_EVENT_WRITE_INCONSISTENT");
    }
  } catch (error) {
    const restored = await tryRestoreLegacy(env, auth, current.id, legacyBefore, "update_v2_failed");
    if (!restored) throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
    if (error instanceof SessionConflictError) throw new AuthError(409, "SESSION_UPDATE_CONFLICT");
    throw error;
  }

  const event = await getRealtimeEventById(env.DB_V2, realtime.eventId);
  scheduleRealtimeDispatch(ctx, env, current.id, event, auth, false);
  return authJson({
    ok: true,
    postingEnabled: next.postingEnabled,
    commentsVisible: next.commentsVisible,
    commentDisplaySeconds: next.commentDisplaySeconds,
    commentDisplayMode: next.commentDisplayMode,
    moderationMode: next.moderationMode,
    status: next.status,
    sequence: event?.sequence || null
  });
}

async function endSession(env, auth, current, next, ctx) {
  const nowIso = new Date().toISOString();
  const legacyBefore = await loadLegacyProjection(env.DB, current.id);
  if (!legacyBefore) {
    await recordProjectionInconsistency(env.DB_V2, auth, current.id, "end_missing_legacy");
    throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
  }
  const stopped = await stopLegacyProjection(env.DB, current.id, "ended", nowIso);
  if (changesOf(stopped) !== 1) {
    await recordProjectionInconsistency(env.DB_V2, auth, current.id, "end_legacy_not_changed");
    throw new AuthError(500, "SESSION_PROJECTION_FAILED");
  }

  const ended = { ...next, postingEnabled: false, commentsVisible: false, status: "ended", endedAt: nowIso };
  const realtime = realtimeEventStatements(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: current.id,
    eventType: "room:closed",
    payload: { type: "room:closed", status: "ended", closedAt: nowIso },
    now: Date.parse(nowIso),
    requiredSessionUpdatedAt: nowIso
  });
  let results;
  try {
    results = await env.DB_V2.batch([
      sessionEndStatement(env.DB_V2, auth, current, ended, nowIso),
      conditionalSessionAudit(env.DB_V2, {
        auth,
        sessionId: current.id,
        updatedAt: nowIso,
        action: "session.ended",
        details: null
      }),
      ...realtime.statements
    ]);
  } catch (error) {
    const restored = await tryRestoreLegacy(env, auth, current.id, legacyBefore, "end_v2_failed");
    if (!restored) throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
    throw error;
  }
  if (changesOf(results?.[0]) !== 1 || changesOf(results?.[3]) !== 1 || changesOf(results?.[4]) !== 1) {
    const restored = await tryRestoreLegacy(env, auth, current.id, legacyBefore, "end_v2_conflict");
    if (!restored) throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
    throw new AuthError(409, "SESSION_UPDATE_CONFLICT");
  }
  const event = await getRealtimeEventById(env.DB_V2, realtime.eventId);
  scheduleRealtimeDispatch(ctx, env, current.id, event, auth, true);
  return authJson({
    ok: true,
    postingEnabled: false,
    commentsVisible: false,
    commentDisplaySeconds: ended.commentDisplaySeconds,
    commentDisplayMode: ended.commentDisplayMode,
    moderationMode: ended.moderationMode,
    status: "ended",
    sequence: event?.sequence || null
  });
}

async function deleteSession(request, env, auth, current, ctx) {
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, []);
  await requireUnsafeRequestProtection(request, env, auth);
  if (current.status === "deleted") return authJson({ ok: true });

  const nowIso = new Date().toISOString();
  const legacyBefore = await loadLegacyProjection(env.DB, current.id);
  if (!legacyBefore) {
    await recordProjectionInconsistency(env.DB_V2, auth, current.id, "delete_missing_legacy");
    throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
  }
  const stopped = await stopLegacyProjection(env.DB, current.id, "deleted", nowIso);
  if (changesOf(stopped) !== 1) {
    await recordProjectionInconsistency(env.DB_V2, auth, current.id, "delete_legacy_not_changed");
    throw new AuthError(500, "SESSION_PROJECTION_FAILED");
  }
  const realtime = realtimeEventStatements(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: current.id,
    eventType: "room:closed",
    payload: { type: "room:closed", status: "deleted", closedAt: nowIso },
    now: Date.parse(nowIso),
    requiredSessionUpdatedAt: nowIso
  });
  let results;
  try {
    results = await env.DB_V2.batch([
      sessionDeleteStatement(env.DB_V2, auth, current, nowIso),
      conditionalSessionAudit(env.DB_V2, {
        auth,
        sessionId: current.id,
        updatedAt: nowIso,
        action: "session.deleted",
        details: null
      }),
      ...realtime.statements
    ]);
  } catch (error) {
    const restored = await tryRestoreLegacy(env, auth, current.id, legacyBefore, "delete_v2_failed");
    if (!restored) throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
    throw error;
  }
  if (changesOf(results?.[0]) !== 1 || changesOf(results?.[3]) !== 1 || changesOf(results?.[4]) !== 1) {
    const restored = await tryRestoreLegacy(env, auth, current.id, legacyBefore, "delete_v2_conflict");
    if (!restored) throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
    throw new AuthError(409, "SESSION_UPDATE_CONFLICT");
  }
  const event = await getRealtimeEventById(env.DB_V2, realtime.eventId);
  scheduleRealtimeDispatch(ctx, env, current.id, event, auth, true);
  return authJson({ ok: true, sequence: event?.sequence || null });
}

async function moderateSingleComment(request, env, auth, session, commentId) {
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["action", "expectedUpdatedAt", "reason"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const result = await moderateComment(env.DB_V2, {
    organizationId: session.organization_id,
    liveSessionId: session.id,
    commentId,
    action: normalizeModerationAction(input.action),
    expectedUpdatedAt: normalizeExpectedUpdatedAt(input.expectedUpdatedAt),
    reason: normalizeModerationReason(input.reason),
    actorUserId: auth.userId,
    actorRole: auth.role,
    now: Date.now()
  });
  const delivery = await deliverCommentRealtime(env, session, result.comment, result.action);
  if (result.comment.moderationState === "visible") {
    void scheduleAiForComment(env, {
      organizationId: session.organization_id,
      liveSessionId: session.id,
      commentId: result.comment.id
    }).catch((error) => console.error("AI scheduling after moderation failed", safeErrorName(error)));
  }
  if (delivery.event && !delivery.delivered) {
    await recordModerationDeliveryFailure(env.DB_V2, auth, session.id, result.comment.id, result.comment.moderationState);
  }
  return authJson({ ok: true, ...result, realtimeDelivered: delivery.delivered, sequence: delivery.event?.sequence || null });
}

async function moderateCommentsBulk(request, env, auth, session) {
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["items"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const items = normalizeBulkModerationItems(input.items);
  const results = [];
  for (const item of items) {
    try {
      const result = await moderateComment(env.DB_V2, {
        organizationId: session.organization_id,
        liveSessionId: session.id,
        commentId: item.commentId,
        action: item.action,
        expectedUpdatedAt: item.expectedUpdatedAt,
        reason: item.reason,
        actorUserId: auth.userId,
        actorRole: auth.role,
        now: Date.now()
      });
      const delivery = await deliverCommentRealtime(env, session, result.comment, result.action);
      if (result.comment.moderationState === "visible") {
        void scheduleAiForComment(env, {
          organizationId: session.organization_id,
          liveSessionId: session.id,
          commentId: result.comment.id
        }).catch((error) => console.error("AI scheduling after bulk moderation failed", safeErrorName(error)));
      }
      if (delivery.event && !delivery.delivered) {
        await recordModerationDeliveryFailure(env.DB_V2, auth, session.id, result.comment.id, result.comment.moderationState);
      }
      results.push({
        commentId: item.commentId,
        ok: true,
        ...result,
        realtimeDelivered: delivery.delivered,
        sequence: delivery.event?.sequence || null
      });
    } catch (error) {
      if (error instanceof AuthError) {
        results.push({ commentId: item.commentId, ok: false, error: error.code, status: error.status });
      } else {
        console.error("Stage 5 bulk moderation item failed", safeErrorName(error));
        results.push({ commentId: item.commentId, ok: false, error: "INTERNAL_ERROR", status: 500 });
      }
    }
  }
  return authJson({
    ok: true,
    results,
    succeeded: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length
  });
}

async function getCommentModerationHistory(request, env, session, commentId) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 100);
  const actions = await listCommentModerationActions(env.DB_V2, {
    organizationId: session.organization_id,
    liveSessionId: session.id,
    commentId,
    limit
  });
  return authJson({ ok: true, actions });
}

async function deliverCommentRealtime(env, session, comment, action) {
  const expectedType = action?.toState === "visible"
    ? "message:restore"
    : action?.fromState === "visible" && ["hidden", "deleted"].includes(action?.toState)
      ? "message:remove"
      : null;
  if (!expectedType) return { event: null, delivered: true };
  const event = await findRealtimeEventForComment(env.DB_V2, {
    organizationId: session.organization_id,
    liveSessionId: session.id,
    commentId: comment.id,
    eventType: expectedType,
    createdAt: comment.updatedAt
  });
  if (!event) throw new AuthError(500, "REALTIME_EVENT_MISSING");
  const delivered = await dispatchRealtimeEvent(env, session.id, event, false);
  if (expectedType !== "message:restore") return { event, delivered };

  const translation = await env.DB_V2.prepare(
    `SELECT target_language, display_text
     FROM translations
     WHERE organization_id = ?1 AND live_session_id = ?2 AND comment_id = ?3
       AND filter_action IN ('allow', 'mask')
     ORDER BY created_at DESC, id DESC LIMIT 1`
  ).bind(session.organization_id, session.id, comment.id).first();
  if (!translation?.display_text) return { event, delivered };
  try {
    const translationEvent = await appendRealtimeEvent(env.DB_V2, {
      organizationId: session.organization_id,
      liveSessionId: session.id,
      eventType: "settings:update",
      sourceCommentId: comment.id,
      payload: {
        type: "translation:ready",
        commentId: comment.id,
        targetLanguage: translation.target_language,
        translation: translation.display_text,
        label: "AI翻訳"
      }
    });
    const translationDelivered = await dispatchRealtimeEvent(env, session.id, translationEvent, false);
    return { event, delivered: delivered && translationDelivered, translationEvent };
  } catch (error) {
    console.error("Translation restore delivery failed", String(error?.code || error?.name || "ERROR").slice(0, 80));
    return { event, delivered: false };
  }
}

async function dispatchRealtimeEvent(env, sessionId, event, closeAfter = false) {
  if (!event) return false;
  try {
    const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(sessionId));
    const path = closeAfter
      ? "/close"
      : event.type === "settings:update"
        ? "/settings"
        : event.type === "message:clear"
          ? "/clear"
          : ["message:remove", "message:restore"].includes(event.type)
            ? "/moderation"
            : "/event";
    const response = await stub.fetch(`https://comment-room${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-internal": "true"
      },
      body: JSON.stringify({
        organizationId: event.organizationId,
        liveSessionId: event.liveSessionId,
        sequence: event.sequence,
        ...event.payload,
        comment: event.payload
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function recordModerationDeliveryFailure(db, auth, sessionId, commentId, moderationState) {
  try {
    await writeAudit(db, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "comment.moderation.delivery_failed",
      targetType: "comment",
      targetId: commentId,
      details: { liveSessionId: sessionId, moderationState }
    });
  } catch (error) {
    console.error("Stage 5 moderation delivery audit failed", safeErrorName(error));
  }
}

function decodeCommentId(value) {
  const decoded = decodePathComponent(value);
  if (!/^cmt_[a-z0-9]{16,80}$/i.test(decoded)) throw new AuthError(404, "COMMENT_NOT_FOUND");
  return decoded;
}

async function clearComments(request, env, auth, session) {
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, []);
  await requireUnsafeRequestProtection(request, env, auth);
  if (session.status !== "active" || isExpired(session)) throw new AuthError(410, "SESSION_EXPIRED");

  const realtime = realtimeEventStatements(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    eventType: "message:clear",
    payload: { type: "message:clear", clearedAt: new Date().toISOString() },
    now: Date.now()
  });
  const results = await env.DB_V2.batch([
    ...realtime.statements,
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "comments.cleared",
      targetType: "live_session",
      targetId: session.id
    })
  ]);
  if (changesOf(results?.[1]) !== 1 || changesOf(results?.[2]) !== 1) {
    throw new AuthError(500, "REALTIME_EVENT_WRITE_INCONSISTENT");
  }
  const event = await getRealtimeEventById(env.DB_V2, realtime.eventId);
  const realtimeDelivered = await dispatchRealtimeEvent(env, session.id, event, false);
  return authJson({ ok: true, realtimeDelivered, sequence: event?.sequence || null });
}

async function createLiveTicket(request, env, auth, session) {
  rejectOrganizationSelector(request);
  await requireUnsafeRequestProtection(request, env, auth);
  if (session.status !== "active" || isExpired(session)) throw new AuthError(410, "SESSION_EXPIRED");
  const input = await readJsonObject(request, { maxBytes: 4096 });
  assertOnlyFields(input, ["lastSequence"]);
  const lastSequence = normalizeRealtimeSequence(input.lastSequence);
  const token = createToken();
  const ticket = await issueConnectionTicket(env.DB_V2, {
    tokenHash: await hashToken(token),
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    userId: auth.userId,
    authSessionId: auth.sessionId,
    role: auth.role,
    lastSequence,
    now: Date.now()
  });
  return authJson({ ok: true, ticket: token, expiresAt: ticket.expiresAt });
}

async function connectLive(request, env, auth, session) {
  rejectOrganizationSelector(request);
  requireSameOrigin(request, env);
  if (session.status !== "active" || isExpired(session)) throw new AuthError(410, "SESSION_EXPIRED");
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    throw new AuthError(426, "WEBSOCKET_REQUIRED");
  }
  const url = new URL(request.url);
  const ticketToken = url.searchParams.get("ticket") || "";
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(ticketToken)) throw new AuthError(401, "REALTIME_TICKET_INVALID");
  const ticket = await consumeConnectionTicket(env.DB_V2, {
    tokenHash: await hashToken(ticketToken),
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    userId: auth.userId,
    now: Date.now()
  });

  const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(session.id));
  const headers = new Headers();
  headers.set("Upgrade", "websocket");
  headers.set("Origin", request.headers.get("Origin") || new URL(request.url).origin);
  headers.set("x-realtime-ticket-consumed", "true");
  headers.set("x-organization-id", auth.organizationId);
  headers.set("x-session-id", session.id);
  headers.set("x-user-id", auth.userId);
  headers.set("x-auth-session-id", ticket.authSessionId);
  headers.set("x-role", ticket.role);
  headers.set("x-last-sequence", String(ticket.lastSequence));
  return stub.fetch("https://comment-room/connect", { method: "GET", headers });
}

function normalizeRealtimeSequence(value) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) throw new AuthError(400, "REALTIME_SEQUENCE_INVALID");
  return number;
}

async function loadAuthorizedSession(db, auth, sessionId) {
  let sql = `
    SELECT id, organization_id, created_by_user_id, public_code, title,
           posting_enabled, comments_visible, comment_display_seconds,
           comment_display_mode, status, created_at, updated_at,
           started_at, expires_at, ended_at, deleted_at,
           COALESCE((
             SELECT sms.moderation_mode
             FROM session_moderation_settings sms
             WHERE sms.organization_id = live_sessions.organization_id
               AND sms.live_session_id = live_sessions.id
           ), 'off') AS moderation_mode
    FROM live_sessions
    WHERE id = ?1 AND organization_id = ?2`;
  const values = [sessionId, auth.organizationId];
  if (auth.role === "teacher") {
    sql += ` AND created_by_user_id = ?3`;
    values.push(auth.userId);
  } else if (!hasPermission(auth.role, PERMISSIONS.SESSION_MANAGE_ALL)) {
    throw new AuthError(403, "ROLE_FORBIDDEN");
  }
  sql += ` LIMIT 1`;
  return db.prepare(sql).bind(...values).first();
}

function sessionUpdateStatement(db, auth, current, next, updatedAt) {
  return db.prepare(
    `UPDATE live_sessions
     SET posting_enabled = ?1,
         comments_visible = ?2,
         comment_display_seconds = ?3,
         comment_display_mode = ?4,
         updated_at = ?5
     WHERE id = ?6 AND organization_id = ?7
       AND status = 'active' AND updated_at = ?8
       AND (?9 <> 'teacher' OR created_by_user_id = ?10)`
  ).bind(
    next.postingEnabled ? 1 : 0,
    next.commentsVisible ? 1 : 0,
    next.commentDisplaySeconds,
    next.commentDisplayMode,
    updatedAt,
    current.id,
    auth.organizationId,
    current.updated_at,
    auth.role,
    auth.userId
  );
}

function sessionEndStatement(db, auth, current, next, updatedAt) {
  return db.prepare(
    `UPDATE live_sessions
     SET posting_enabled = 0, comments_visible = 0,
         comment_display_seconds = ?1, comment_display_mode = ?2,
         status = 'ended', updated_at = ?3, ended_at = ?3
     WHERE id = ?4 AND organization_id = ?5
       AND status = 'active' AND updated_at = ?6
       AND (?7 <> 'teacher' OR created_by_user_id = ?8)`
  ).bind(
    next.commentDisplaySeconds,
    next.commentDisplayMode,
    updatedAt,
    current.id,
    auth.organizationId,
    current.updated_at,
    auth.role,
    auth.userId
  );
}

function sessionDeleteStatement(db, auth, current, updatedAt) {
  return db.prepare(
    `UPDATE live_sessions
     SET posting_enabled = 0, comments_visible = 0,
         status = 'deleted', updated_at = ?1,
         ended_at = COALESCE(ended_at, ?1), deleted_at = ?1
     WHERE id = ?2 AND organization_id = ?3
       AND status <> 'deleted' AND updated_at = ?4
       AND (?5 <> 'teacher' OR created_by_user_id = ?6)`
  ).bind(updatedAt, current.id, auth.organizationId, current.updated_at, auth.role, auth.userId);
}

function conditionalSessionAudit(db, { auth, sessionId, updatedAt, action, details }) {
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     )
     SELECT ?1, ?2, 'user', ?3, ?4, ?5, 'live_session', ?6, ?7, ?8
     WHERE EXISTS (
       SELECT 1 FROM live_sessions
       WHERE id = ?6 AND organization_id = ?2 AND updated_at = ?8
     )`
  ).bind(
    makeId("aud"),
    auth.organizationId,
    auth.userId,
    auth.role,
    action,
    sessionId,
    details ? JSON.stringify(details) : null,
    updatedAt
  );
}

async function compensateFailedCreate(db, auth, sessionId, sourceError) {
  const nowIso = new Date().toISOString();
  try {
    const results = await db.batch([
      failedCreateSafeSideStatement(db, auth, sessionId, nowIso),
      conditionalSessionAudit(db, {
        auth,
        sessionId,
        updatedAt: nowIso,
        action: "session.projection_failed",
        details: { phase: "create", reason: safeErrorName(sourceError) }
      })
    ]);
    if (changesOf(results?.[0]) !== 1) throw new Error("CREATE_COMPENSATION_NOT_APPLIED");
    return;
  } catch (compensationError) {
    console.error("Stage 3-C atomic create compensation failed", safeErrorName(compensationError));
  }

  // The audit insert may fail independently.  Do not leave an active V2 row
  // without a legacy projection merely to preserve audit atomicity.
  try {
    const fallback = await failedCreateSafeSideStatement(db, auth, sessionId, nowIso).run();
    if (changesOf(fallback) !== 1) throw new Error("CREATE_SAFE_SIDE_FALLBACK_NOT_APPLIED");
  } catch (fallbackError) {
    console.error("Stage 3-C create safe-side fallback failed", safeErrorName(fallbackError));
    throw new AuthError(500, "SESSION_PROJECTION_INCONSISTENT");
  }

  await recordProjectionInconsistency(db, auth, sessionId, "create_compensation_audit_failed");
}

function failedCreateSafeSideStatement(db, auth, sessionId, nowIso) {
  return db.prepare(
    `UPDATE live_sessions
     SET posting_enabled = 0, comments_visible = 0,
         status = 'deleted', updated_at = ?1,
         ended_at = ?1, deleted_at = ?1
     WHERE id = ?2 AND organization_id = ?3 AND status = 'active'`
  ).bind(nowIso, sessionId, auth.organizationId);
}

async function tryRestoreLegacy(env, auth, sessionId, snapshot, reason) {
  try {
    const restored = await restoreLegacyProjection(env.DB, snapshot);
    if (changesOf(restored) !== 1) throw new Error("LEGACY_ROLLBACK_NOT_APPLIED");
    return true;
  } catch (error) {
    await recordProjectionInconsistency(env.DB_V2, auth, sessionId, `${reason}_rollback_failed`);
    return false;
  }
}

async function recordProjectionInconsistency(db, auth, sessionId, reason) {
  try {
    await writeAudit(db, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "session.projection_inconsistent",
      targetType: "live_session",
      targetId: sessionId,
      details: { reason }
    });
  } catch (error) {
    console.error("Stage 3-C inconsistency audit failed", safeErrorName(error));
  }
}

function scheduleRealtimeDispatch(ctx, env, sessionId, event, auth, closeAfter) {
  const task = async () => {
    const delivered = await dispatchRealtimeEvent(env, sessionId, event, closeAfter);
    if (!delivered) {
      await recordProjectionInconsistency(
        env.DB_V2,
        auth,
        sessionId,
        closeAfter ? "durable_object_close_delivery_failed" : "durable_object_event_delivery_failed"
      );
    }
  };
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(task());
  else void task();
}

async function createUniquePublicCode(env) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = randomPublicCode();
    const [v2, legacy] = await Promise.all([
      env.DB_V2.prepare(`SELECT id FROM live_sessions WHERE public_code = ?1 LIMIT 1`).bind(code).first(),
      env.DB.prepare(`SELECT id FROM sessions WHERE public_code = ?1 LIMIT 1`).bind(code).first()
    ]);
    if (!v2 && !legacy) return code;
  }
  throw new AuthError(503, "PUBLIC_CODE_UNAVAILABLE");
}

function nextSessionState(current, input) {
  const requestedStatus = Object.hasOwn(input, "status") ? String(input.status) : current.status;
  if (!new Set(["active", "ended"]).has(requestedStatus)) throw new AuthError(400, "SESSION_STATUS_INVALID");
  return {
    title: current.title,
    postingEnabled: Object.hasOwn(input, "postingEnabled") ? requireBoolean(input.postingEnabled, "POSTING_ENABLED_INVALID") : Boolean(current.posting_enabled),
    commentsVisible: Object.hasOwn(input, "commentsVisible") ? requireBoolean(input.commentsVisible, "COMMENTS_VISIBLE_INVALID") : Boolean(current.comments_visible),
    commentDisplaySeconds: Object.hasOwn(input, "commentDisplaySeconds")
      ? normalizeDisplaySeconds(input.commentDisplaySeconds)
      : normalizeDisplaySeconds(current.comment_display_seconds),
    commentDisplayMode: Object.hasOwn(input, "commentDisplayMode")
      ? requireDisplayMode(input.commentDisplayMode)
      : normalizeDisplayMode(current.comment_display_mode),
    moderationMode: Object.hasOwn(input, "moderationMode")
      ? normalizeModerationMode(input.moderationMode)
      : normalizeModerationMode(current.moderation_mode || "off"),
    status: requestedStatus,
    endedAt: requestedStatus === "ended" ? new Date().toISOString() : null
  };
}

function changedSettings(current, next) {
  return {
    postingEnabled: [Boolean(current.posting_enabled), next.postingEnabled],
    commentsVisible: [Boolean(current.comments_visible), next.commentsVisible],
    commentDisplaySeconds: [normalizeDisplaySeconds(current.comment_display_seconds), next.commentDisplaySeconds],
    commentDisplayMode: [normalizeDisplayMode(current.comment_display_mode), next.commentDisplayMode],
    moderationMode: [normalizeModerationMode(current.moderation_mode || "off"), next.moderationMode]
  };
}

function sessionResponse(env, row) {
  return {
    id: row.id,
    publicCode: row.public_code,
    title: row.title,
    createdByUserId: row.created_by_user_id,
    postingEnabled: Boolean(row.posting_enabled) && row.status === "active" && !isExpired(row),
    commentsVisible: Boolean(row.comments_visible),
    commentDisplaySeconds: normalizeDisplaySeconds(row.comment_display_seconds),
    commentDisplayMode: normalizeDisplayMode(row.comment_display_mode),
    moderationMode: normalizeModerationMode(row.moderation_mode || "off"),
    status: row.status === "active" && isExpired(row) ? "expired" : row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startsAt: row.started_at,
    endsAt: row.expires_at,
    endedAt: row.ended_at,
    joinUrl: joinUrl(env, row.public_code),
    commentRetentionDays: retentionDays(env)
  };
}

function publicSessionResponse(env, session) {
  return {
    id: session.id,
    publicCode: session.publicCode,
    title: session.title,
    createdByUserId: session.createdByUserId,
    postingEnabled: session.postingEnabled,
    commentsVisible: session.commentsVisible,
    commentDisplaySeconds: session.commentDisplaySeconds,
    commentDisplayMode: session.commentDisplayMode,
    moderationMode: normalizeModerationMode(session.moderationMode || "off"),
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    startsAt: session.startedAt,
    endsAt: session.expiresAt,
    endedAt: session.endedAt,
    joinUrl: joinUrl(env, session.publicCode),
    commentRetentionDays: retentionDays(env)
  };
}

function teacherResponse(auth) {
  return {
    id: auth.userId,
    loginId: auth.loginId,
    email: auth.email || null,
    name: auth.displayName,
    role: auth.role
  };
}

function requireSessionReadPermission(auth) {
  if (auth.role === "teacher") return requirePermission(auth, PERMISSIONS.SESSION_MANAGE_OWN);
  return requirePermission(auth, PERMISSIONS.SESSION_READ_ALL);
}

function requireDatabases(env) {
  if (!env?.DB_V2) throw new AuthError(500, "DB_V2_NOT_CONFIGURED");
  if (!env?.DB) throw new AuthError(500, "DB_NOT_CONFIGURED");
}

function normalizeTitle(value) {
  const title = String(value ?? "").trim();
  return Array.from(title).length >= 1 && Array.from(title).length <= 80 ? title : "";
}

function normalizeDisplaySeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 10 || number > 300) {
    throw new AuthError(400, "COMMENT_DISPLAY_SECONDS_INVALID");
  }
  return number;
}

function normalizeDisplayMode(value) {
  return DISPLAY_MODES.has(value) ? value : "stack3";
}

function requireDisplayMode(value) {
  if (!DISPLAY_MODES.has(value)) throw new AuthError(400, "COMMENT_DISPLAY_MODE_INVALID");
  return value;
}

function requireBoolean(value, code) {
  if (typeof value !== "boolean") throw new AuthError(400, code);
  return value;
}

function isExpired(row) {
  const expiresAt = Date.parse(row?.expires_at || "");
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

function validSessionId(value) {
  return /^[A-Za-z0-9_-]{4,128}$/.test(String(value || ""));
}

function decodePathComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AuthError(400, "INVALID_PATH_PARAMETER");
  }
}

function joinUrl(env, publicCode) {
  const origin = String(env.PUBLIC_ORIGIN || env.AUTH_ORIGIN || "").replace(/\/$/, "");
  return `${origin}/j/${publicCode}`;
}

function randomPublicCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PUBLIC_CODE_ALPHABET[value % PUBLIC_CODE_ALPHABET.length]).join("");
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}

function safeErrorName(error) {
  return String(error?.name || "Error").slice(0, 64);
}

function methodNotAllowed(allow) {
  return new AuthError(405, "METHOD_NOT_ALLOWED", { headers: { allow } });
}

class SessionConflictError extends Error {}
