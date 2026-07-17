import { AuthError } from "../auth/errors.js";
import { makeId } from "../auth/request.js";
import { nextModerationState } from "./validation.js";

export async function moderateComment(db, input) {
  const current = await loadCommentForModeration(db, input);
  if (!current) throw new AuthError(404, "COMMENT_NOT_FOUND");
  if (current.updated_at !== input.expectedUpdatedAt) throw new AuthError(409, "COMMENT_VERSION_CONFLICT");

  const toState = nextModerationState(current.moderation_state, input.action);
  const resultUpdatedAt = nextTimestamp(current.updated_at, input.now);
  const deletedAt = toState === "deleted" ? resultUpdatedAt : null;
  const actionId = makeId("mod");
  const eventType = moderationEventType(input.action);
  const statements = [
    db.prepare(
      `UPDATE comments
       SET moderation_state = ?1, updated_at = ?2, deleted_at = ?3
       WHERE id = ?4 AND organization_id = ?5 AND live_session_id = ?6
         AND moderation_state = ?7 AND updated_at = ?8`
    ).bind(
      toState,
      resultUpdatedAt,
      deletedAt,
      current.id,
      input.organizationId,
      input.liveSessionId,
      current.moderation_state,
      input.expectedUpdatedAt
    ),
    db.prepare(
      `INSERT INTO comment_moderation_actions (
         id, organization_id, live_session_id, comment_id,
         actor_user_id, actor_role, action, from_state, to_state,
         reason, expected_updated_at, result_updated_at, created_at
       )
       SELECT ?1, organization_id, live_session_id, id,
              ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9
       FROM comments
       WHERE id = ?10 AND organization_id = ?11 AND live_session_id = ?12
         AND moderation_state = ?6 AND updated_at = ?9`
    ).bind(
      actionId,
      input.actorUserId,
      input.actorRole,
      input.action,
      current.moderation_state,
      toState,
      input.reason,
      input.expectedUpdatedAt,
      resultUpdatedAt,
      current.id,
      input.organizationId,
      input.liveSessionId
    )
  ];

  if (eventType) {
    statements.push(
      db.prepare(
        `INSERT INTO comment_events (
           id, organization_id, live_session_id, comment_id,
           event_type, actor_type, actor_user_id, details_json, created_at
         )
         SELECT ?1, organization_id, live_session_id, id,
                ?2, 'user', ?3, ?4, ?5
         FROM comments
         WHERE id = ?6 AND organization_id = ?7 AND live_session_id = ?8
           AND moderation_state = ?9 AND updated_at = ?5`
      ).bind(
        makeId("cevt"),
        eventType,
        input.actorUserId,
        JSON.stringify({ action: input.action, reason: input.reason }),
        resultUpdatedAt,
        current.id,
        input.organizationId,
        input.liveSessionId,
        toState
      )
    );
  }

  statements.push(
    db.prepare(
      `INSERT INTO audit_logs (
         id, organization_id, actor_type, actor_user_id, actor_role,
         action, target_type, target_id, details_json, created_at
       )
       SELECT ?1, ?2, 'user', ?3, ?4, ?5, 'comment', ?6, ?7, ?8
       WHERE EXISTS (
         SELECT 1 FROM comments
         WHERE id = ?6 AND organization_id = ?2 AND live_session_id = ?9
           AND moderation_state = ?10 AND updated_at = ?8
       )`
    ).bind(
      makeId("aud"),
      input.organizationId,
      input.actorUserId,
      input.actorRole,
      `comment.moderation.${input.action}`,
      current.id,
      JSON.stringify({
        liveSessionId: input.liveSessionId,
        fromState: current.moderation_state,
        toState,
        reason: input.reason
      }),
      resultUpdatedAt,
      input.liveSessionId,
      toState
    )
  );

  let results;
  try {
    results = await db.batch(statements);
  } catch (error) {
    if (isModerationVersionConflict(error)) {
      throw new AuthError(409, "COMMENT_VERSION_CONFLICT");
    }
    throw error;
  }
  if (changesOf(results?.[0]) !== 1 || changesOf(results?.[1]) !== 1) {
    throw new AuthError(409, "COMMENT_VERSION_CONFLICT");
  }

  const updated = await loadCommentForModeration(db, input);
  if (!updated || updated.updated_at !== resultUpdatedAt || updated.moderation_state !== toState) {
    throw new AuthError(500, "COMMENT_MODERATION_INCONSISTENT");
  }
  return {
    comment: commentResponse(updated),
    action: {
      id: actionId,
      action: input.action,
      fromState: current.moderation_state,
      toState,
      reason: input.reason,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      createdAt: resultUpdatedAt
    }
  };
}

export async function listCommentModerationActions(db, input) {
  const comment = await loadCommentForModeration(db, input);
  if (!comment) throw new AuthError(404, "COMMENT_NOT_FOUND");
  const result = await db.prepare(
    `SELECT id, action, from_state, to_state, reason,
            actor_user_id, actor_role, expected_updated_at,
            result_updated_at, created_at
     FROM comment_moderation_actions
     WHERE organization_id = ?1 AND live_session_id = ?2 AND comment_id = ?3
     ORDER BY created_at DESC, id DESC
     LIMIT ?4`
  ).bind(input.organizationId, input.liveSessionId, input.commentId, input.limit || 100).all();
  return rowsOf(result).map((row) => ({
    id: row.id,
    action: row.action,
    fromState: row.from_state,
    toState: row.to_state,
    reason: row.reason || null,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    expectedUpdatedAt: row.expected_updated_at,
    resultUpdatedAt: row.result_updated_at,
    createdAt: row.created_at
  }));
}

export async function getSessionModerationMode(db, organizationId, liveSessionId) {
  const row = await db.prepare(
    `SELECT moderation_mode
     FROM session_moderation_settings
     WHERE organization_id = ?1 AND live_session_id = ?2 LIMIT 1`
  ).bind(organizationId, liveSessionId).first();
  return row?.moderation_mode === "pre" ? "pre" : "off";
}

export function sessionModerationUpsertStatement(db, input) {
  return db.prepare(
    `INSERT INTO session_moderation_settings (
       organization_id, live_session_id, moderation_mode,
       updated_by_user_id, created_at, updated_at
     )
     SELECT ?1, ?2, ?3, ?4, ?5, ?5
     FROM live_sessions
     WHERE organization_id = ?1 AND id = ?2 AND updated_at = ?5
     ON CONFLICT(organization_id, live_session_id) DO UPDATE SET
       moderation_mode = excluded.moderation_mode,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = excluded.updated_at`
  ).bind(
    input.organizationId,
    input.liveSessionId,
    input.moderationMode,
    input.actorUserId,
    input.updatedAt
  );
}

async function loadCommentForModeration(db, input) {
  return db.prepare(
    `SELECT id, organization_id, live_session_id, nickname, message,
            message_length, moderation_state, created_at, updated_at,
            retained_until, deleted_at
     FROM comments
     WHERE id = ?1 AND organization_id = ?2 AND live_session_id = ?3 LIMIT 1`
  ).bind(input.commentId, input.organizationId, input.liveSessionId).first();
}

function moderationEventType(action) {
  if (action === "hide") return "hidden";
  if (action === "delete") return "deleted";
  if (action === "restore") return "restored";
  return null;
}

function nextTimestamp(previousIso, now = Date.now()) {
  const previous = Date.parse(previousIso);
  const candidate = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return new Date(Math.max(candidate, previous + 1)).toISOString();
}

function commentResponse(row) {
  return {
    id: row.id,
    nickname: row.nickname || "",
    message: row.message,
    messageLength: Number(row.message_length),
    moderationState: row.moderation_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retainedUntil: row.retained_until,
    deletedAt: row.deleted_at || null
  };
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}

function isModerationVersionConflict(error) {
  const message = String(error?.message || error || "");
  return message.includes("comment_moderation_actions.comment_id")
    && message.includes("comment_moderation_actions.result_updated_at")
    && /unique constraint/i.test(message);
}
