import { AuthError } from "../auth/errors.js";
import { makeId } from "../auth/request.js";

const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const TICKET_TTL_MS = 60_000;
const MAX_CATCH_UP_EVENTS = 500;
const MAX_SNAPSHOT_COMMENTS = 500;

export async function issueConnectionTicket(db, input) {
  const now = new Date(input.now ?? Date.now());
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + TICKET_TTL_MS).toISOString();
  const id = makeId("rtkt");
  await db.prepare(
    `INSERT INTO realtime_connection_tickets (
       id, token_hash, organization_id, live_session_id,
       user_id, auth_session_id, role, last_sequence, issued_at, expires_at, consumed_at
     )
     SELECT ?1, ?2, ls.organization_id, ls.id,
            ?3, a.id, ?4, ?5, ?6, ?7, NULL
     FROM live_sessions ls
     JOIN auth_sessions a
       ON a.id = ?8 AND a.organization_id = ls.organization_id AND a.user_id = ?3
     JOIN users u ON u.id = a.user_id
     JOIN organizations o ON o.id = a.organization_id
     JOIN organization_members m
       ON m.organization_id = a.organization_id AND m.user_id = a.user_id
     WHERE ls.id = ?9 AND ls.organization_id = ?10
       AND ls.status = 'active' AND ls.expires_at > ?6
       AND a.revoked_at IS NULL AND a.idle_expires_at > ?6 AND a.absolute_expires_at > ?6
       AND u.status = 'active' AND o.status = 'active' AND m.status = 'active' AND m.role = ?4`
  ).bind(
    id,
    input.tokenHash,
    input.userId,
    input.role,
    normalizeSequence(input.lastSequence),
    issuedAt,
    expiresAt,
    input.authSessionId,
    input.liveSessionId,
    input.organizationId
  ).run().then((result) => {
    if (changesOf(result) !== 1) throw new AuthError(410, "SESSION_EXPIRED");
  });
  return { id, expiresAt };
}

export async function consumeConnectionTicket(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const row = await db.prepare(
    `UPDATE realtime_connection_tickets
     SET consumed_at = ?1
     WHERE token_hash = ?2
       AND organization_id = ?3
       AND live_session_id = ?4
       AND user_id = ?5
       AND consumed_at IS NULL
       AND expires_at > ?1
       AND EXISTS (
         SELECT 1
         FROM auth_sessions a
         JOIN users u ON u.id = a.user_id
         JOIN organizations o ON o.id = a.organization_id
         JOIN organization_members m
           ON m.organization_id = a.organization_id AND m.user_id = a.user_id
         WHERE a.id = realtime_connection_tickets.auth_session_id
           AND a.organization_id = realtime_connection_tickets.organization_id
           AND a.user_id = realtime_connection_tickets.user_id
           AND a.revoked_at IS NULL
           AND a.idle_expires_at > ?1 AND a.absolute_expires_at > ?1
           AND u.status = 'active' AND o.status = 'active' AND m.status = 'active'
           AND m.role = realtime_connection_tickets.role
       )
       AND EXISTS (
         SELECT 1 FROM live_sessions ls
         WHERE ls.id = realtime_connection_tickets.live_session_id
           AND ls.organization_id = realtime_connection_tickets.organization_id
           AND ls.status = 'active' AND ls.expires_at > ?1
       )
     RETURNING id, organization_id, live_session_id, user_id, auth_session_id, role,
               last_sequence, issued_at, expires_at, consumed_at`
  ).bind(nowIso, input.tokenHash, input.organizationId, input.liveSessionId, input.userId).first();
  if (!row) throw new AuthError(401, "REALTIME_TICKET_INVALID");
  return {
    id: row.id,
    organizationId: row.organization_id,
    liveSessionId: row.live_session_id,
    userId: row.user_id,
    authSessionId: row.auth_session_id,
    role: row.role,
    lastSequence: Number(row.last_sequence || 0),
    consumedAt: row.consumed_at
  };
}

export function realtimeEventStatements(db, input) {
  const createdAt = new Date(input.now ?? Date.now()).toISOString();
  const expiresAt = new Date(Date.parse(createdAt) + EVENT_TTL_MS).toISOString();
  const eventId = input.eventId || makeId("rte");
  const payloadJson = JSON.stringify(input.payload);
  const requiredUpdatedAt = input.requiredSessionUpdatedAt || null;
  const requiredAiJob = input.requiredAiJob || null;
  const requiredAiJobId = requiredAiJob?.id || null;
  const requiredAiClaimedAt = requiredAiJob?.claimedAt || null;
  const requiredAiAttemptCount = requiredAiJob ? Number(requiredAiJob.attemptCount) : null;
  const requiredAiFinishedAt = requiredAiJob?.finishedAt || null;
  return {
    eventId,
    createdAt,
    statements: [
      db.prepare(
        `INSERT INTO realtime_session_state (
           organization_id, live_session_id, last_sequence, last_clear_sequence,
           last_event_at, created_at, updated_at
         )
         SELECT organization_id, id, 0, 0, NULL, created_at, ?1
         FROM live_sessions
         WHERE id = ?2 AND organization_id = ?3
           AND (?4 IS NULL OR updated_at = ?4)
           AND (?5 IS NULL OR EXISTS (
             SELECT 1 FROM ai_jobs j
             WHERE j.id = ?5 AND j.status = 'succeeded'
               AND j.claimed_at = ?6 AND j.attempt_count = ?7 AND j.finished_at = ?8
           ))
         ON CONFLICT(live_session_id) DO NOTHING`
      ).bind(
        createdAt, input.liveSessionId, input.organizationId, requiredUpdatedAt,
        requiredAiJobId, requiredAiClaimedAt, requiredAiAttemptCount, requiredAiFinishedAt
      ),
      db.prepare(
        `UPDATE realtime_session_state
         SET last_clear_sequence = CASE WHEN ?9 = 'message:clear' THEN last_sequence + 1 ELSE last_clear_sequence END,
             last_sequence = last_sequence + 1,
             last_event_at = ?1,
             updated_at = ?1
         WHERE live_session_id = ?2 AND organization_id = ?3
           AND EXISTS (
             SELECT 1 FROM live_sessions
             WHERE id = ?2 AND organization_id = ?3
               AND (?4 IS NULL OR updated_at = ?4)
           )
           AND (?5 IS NULL OR EXISTS (
             SELECT 1 FROM ai_jobs j
             WHERE j.id = ?5 AND j.status = 'succeeded'
               AND j.claimed_at = ?6 AND j.attempt_count = ?7 AND j.finished_at = ?8
           ))`
      ).bind(
        createdAt, input.liveSessionId, input.organizationId, requiredUpdatedAt,
        requiredAiJobId, requiredAiClaimedAt, requiredAiAttemptCount, requiredAiFinishedAt,
        input.eventType
      ),
      db.prepare(
        `INSERT INTO realtime_events (
           id, organization_id, live_session_id, sequence,
           event_type, payload_json, source_comment_id,
           created_at, expires_at
         )
         SELECT ?1, organization_id, live_session_id, last_sequence,
                ?2, ?3, ?4, ?5, ?6
         FROM realtime_session_state
         WHERE live_session_id = ?7 AND organization_id = ?8
           AND last_event_at = ?5
           AND (?9 IS NULL OR EXISTS (
             SELECT 1 FROM ai_jobs j
             WHERE j.id = ?9 AND j.status = 'succeeded'
               AND j.claimed_at = ?10 AND j.attempt_count = ?11 AND j.finished_at = ?12
           ))`
      ).bind(
        eventId,
        input.eventType,
        payloadJson,
        input.sourceCommentId || null,
        createdAt,
        expiresAt,
        input.liveSessionId,
        input.organizationId,
        requiredAiJobId,
        requiredAiClaimedAt,
        requiredAiAttemptCount,
        requiredAiFinishedAt
      )
    ]
  };
}

export async function appendRealtimeEvent(db, input) {
  const built = realtimeEventStatements(db, input);
  const results = await db.batch(built.statements);
  if (changesOf(results?.[1]) !== 1 || changesOf(results?.[2]) !== 1) {
    throw new AuthError(500, "REALTIME_EVENT_WRITE_INCONSISTENT");
  }
  return getRealtimeEventById(db, built.eventId, input.now);
}

export async function getRealtimeEventById(db, eventId, now = Date.now()) {
  const nowIso = new Date(now ?? Date.now()).toISOString();
  const row = await db.prepare(
    `SELECT id, organization_id, live_session_id, sequence,
            event_type, payload_json, source_comment_id,
            created_at, expires_at
     FROM realtime_events WHERE id = ?1 AND expires_at > ?2 LIMIT 1`
  ).bind(eventId, nowIso).first();
  return row ? realtimeEventResponse(row) : null;
}

export async function getRealtimeEvent(db, organizationId, liveSessionId, sequence, now = Date.now()) {
  const nowIso = new Date(now ?? Date.now()).toISOString();
  const row = await db.prepare(
    `SELECT id, organization_id, live_session_id, sequence,
            event_type, payload_json, source_comment_id,
            created_at, expires_at
     FROM realtime_events
     WHERE organization_id = ?1 AND live_session_id = ?2 AND sequence = ?3
       AND expires_at > ?4
     LIMIT 1`
  ).bind(organizationId, liveSessionId, normalizeSequence(sequence), nowIso).first();
  return row ? realtimeEventResponse(row) : null;
}

export async function findRealtimeEventForComment(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const row = await db.prepare(
    `SELECT id, organization_id, live_session_id, sequence,
            event_type, payload_json, source_comment_id,
            created_at, expires_at
     FROM realtime_events
     WHERE organization_id = ?1 AND live_session_id = ?2
       AND source_comment_id = ?3
       AND (?4 IS NULL OR event_type = ?4)
       AND (?5 IS NULL OR created_at = ?5)
       AND expires_at > ?6
     ORDER BY sequence DESC LIMIT 1`
  ).bind(
    input.organizationId,
    input.liveSessionId,
    input.commentId,
    input.eventType || null,
    input.createdAt || null,
    nowIso
  ).first();
  return row ? realtimeEventResponse(row) : null;
}

export async function getRealtimeSync(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const session = await db.prepare(
    `SELECT ls.id, ls.organization_id, ls.title, ls.posting_enabled,
            ls.comments_visible, ls.comment_display_seconds,
            ls.comment_display_mode, ls.status, ls.expires_at,
            COALESCE(rss.last_sequence, 0) AS last_sequence,
            COALESCE(rss.last_clear_sequence, 0) AS last_clear_sequence
     FROM live_sessions ls
     LEFT JOIN realtime_session_state rss ON rss.live_session_id = ls.id
     WHERE ls.id = ?1 AND ls.organization_id = ?2 LIMIT 1`
  ).bind(input.liveSessionId, input.organizationId).first();
  if (!session) throw new AuthError(404, "SESSION_NOT_FOUND");

  const currentSequence = Number(session.last_sequence || 0);
  const requestedSequence = normalizeSequence(input.lastSequence);
  const oldest = await db.prepare(
    `SELECT MIN(sequence) AS min_sequence
     FROM realtime_events
     WHERE live_session_id = ?1 AND organization_id = ?2
       AND expires_at > ?3`
  ).bind(input.liveSessionId, input.organizationId, nowIso).first();
  const oldestAvailableSequence = oldest?.min_sequence == null ? currentSequence + 1 : Number(oldest.min_sequence);
  const resetRequired = requestedSequence > currentSequence
    || (requestedSequence < currentSequence && requestedSequence < oldestAvailableSequence - 1)
    || currentSequence - requestedSequence > MAX_CATCH_UP_EVENTS;

  let events = [];
  let snapshot = [];
  if (resetRequired) {
    const result = await db.prepare(
      `SELECT c.id, c.nickname, COALESCE(c.display_message, c.message) AS message, c.message_length, c.moderation_state,
              c.created_at, c.updated_at, c.retained_until, c.deleted_at,
              (SELECT t.target_language FROM translations t
               WHERE t.comment_id = c.id ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS translation_language,
              (SELECT t.display_text FROM translations t
               WHERE t.comment_id = c.id AND t.filter_action IN ('allow', 'mask')
               ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS translation_text
       FROM comments c
       WHERE c.organization_id = ?1 AND c.live_session_id = ?2
         AND c.moderation_state = 'visible'
         AND c.retained_until > ?4
         AND EXISTS (
           SELECT 1 FROM realtime_events re
           WHERE re.organization_id = c.organization_id
             AND re.live_session_id = c.live_session_id
             AND re.source_comment_id = c.id
             AND re.event_type IN ('message:new', 'message:restore')
             AND re.sequence > ?3
             AND re.expires_at > ?4
         )
       ORDER BY c.created_at DESC, c.id DESC LIMIT ?5`
    ).bind(
      input.organizationId,
      input.liveSessionId,
      Number(session.last_clear_sequence || 0),
      nowIso,
      MAX_SNAPSHOT_COMMENTS
    ).all();
    snapshot = (result.results || []).reverse().map(commentSnapshotResponse);
  } else if (requestedSequence < currentSequence) {
    const result = await db.prepare(
      `SELECT id, organization_id, live_session_id, sequence,
              event_type, payload_json, source_comment_id,
              created_at, expires_at
       FROM realtime_events
       WHERE organization_id = ?1 AND live_session_id = ?2
         AND sequence > ?3
         AND expires_at > ?4
       ORDER BY sequence ASC LIMIT ?5`
    ).bind(input.organizationId, input.liveSessionId, requestedSequence, nowIso, MAX_CATCH_UP_EVENTS).all();
    events = (result.results || []).map(realtimeEventResponse);
  }

  return {
    currentSequence,
    oldestAvailableSequence,
    resetRequired,
    room: {
      postingEnabled: Boolean(session.posting_enabled),
      commentsVisible: Boolean(session.comments_visible),
      commentDisplaySeconds: Number(session.comment_display_seconds || 60),
      commentDisplayMode: session.comment_display_mode || "stack3",
      status: session.status,
      expiresAt: session.expires_at
    },
    events,
    snapshot
  };
}

export async function pruneRealtimeRecords(db, input = {}) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const limit = Math.max(1, Math.min(500, Number(input.limit) || 500));
  const results = await db.batch([
    db.prepare(
      `DELETE FROM realtime_events
       WHERE id IN (
         SELECT id FROM realtime_events
         WHERE expires_at <= ?1
         ORDER BY expires_at ASC, id ASC LIMIT ?2
       )`
    ).bind(nowIso, limit),
    db.prepare(
      `DELETE FROM realtime_connection_tickets
       WHERE id IN (
         SELECT id FROM realtime_connection_tickets
         WHERE expires_at <= ?1 OR consumed_at IS NOT NULL
         ORDER BY expires_at ASC, id ASC LIMIT ?2
       )`
    ).bind(nowIso, limit)
  ]);
  return {
    eventsDeleted: changesOf(results?.[0]),
    ticketsDeleted: changesOf(results?.[1]),
    backlogRemains: changesOf(results?.[0]) >= limit || changesOf(results?.[1]) >= limit
  };
}

export function realtimeEventResponse(row) {
  let payload;
  try { payload = JSON.parse(row.payload_json); } catch { payload = { type: row.event_type }; }
  return {
    id: row.id,
    organizationId: row.organization_id,
    liveSessionId: row.live_session_id,
    sequence: Number(row.sequence),
    type: row.event_type,
    payload,
    sourceCommentId: row.source_comment_id || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

function commentSnapshotResponse(row) {
  return {
    id: row.id,
    nickname: row.nickname || "",
    message: row.message,
    messageLength: Number(row.message_length),
    moderationState: row.moderation_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retainedUntil: row.retained_until,
    deletedAt: row.deleted_at || null,
    translation: row.translation_text ? {
      targetLanguage: row.translation_language,
      text: row.translation_text,
      label: "AI翻訳"
    } : null
  };
}

function normalizeSequence(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return 0;
  return number;
}

function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}

function firstRow(result) {
  return result?.results?.[0] || null;
}
