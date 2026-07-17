import { AuthError } from "../auth/errors.js";
import { makeId } from "../auth/request.js";
import { filterMatchStatements } from "../content-filter/repository.js";
import { commentPageLinkStatement } from "../pdf-analysis/repository.js";

const EXISTING_TABLE_CACHE = new WeakMap();
const POST_INTERVAL_MS = 10_000;

export async function persistComment(db, input) {
  const now = new Date(input.now ?? Date.now());
  const nowIso = now.toISOString();
  await releaseExpiredIdempotencyKey(db, input.liveSessionId, input.idempotencyKey, nowIso);
  const existing = await findCommentByIdempotency(
    db,
    input.liveSessionId,
    input.idempotencyKey,
    input.participantTokenHash,
    nowIso
  );
  if (existing) return { comment: commentResponse(existing), duplicate: true };
  if (await activeIdempotencyKeyExists(db, input.liveSessionId, input.idempotencyKey, nowIso)) {
    throw new AuthError(409, "IDEMPOTENCY_KEY_CONFLICT");
  }

  const nextPostAt = new Date(now.getTime() + POST_INTERVAL_MS).toISOString();
  const retainedUntil = new Date(now.getTime() + input.retentionDays * 86_400_000).toISOString();
  const participantId = makeId("part");
  const commentId = makeId("cmt");
  const eventId = makeId("cevt");
  const filterDecision = input.filterDecision || { action: "allow", displayMessage: null, aiRequired: false, version: 0, matches: [] };

  const statements = [
    db.prepare(
      `INSERT INTO participants (
         id, organization_id, live_session_id, token_hash, status,
         post_claim_id, next_post_at, created_at, last_seen_at, deleted_at
       )
       SELECT ?1, ?2, ?3, ?4, 'active', NULL, ?5, ?5, ?5, NULL
       FROM live_sessions
       WHERE id = ?3 AND organization_id = ?2
         AND status = 'active' AND posting_enabled = 1 AND expires_at > ?5
       ON CONFLICT(live_session_id, token_hash) DO NOTHING`
    ).bind(participantId, input.organizationId, input.liveSessionId, input.participantTokenHash, nowIso),
    db.prepare(
      `UPDATE participants
       SET post_claim_id = ?1, next_post_at = ?2, last_seen_at = ?3
       WHERE organization_id = ?4 AND live_session_id = ?5 AND token_hash = ?6
         AND status = 'active' AND next_post_at <= ?3
         AND EXISTS (
           SELECT 1 FROM live_sessions ls
           WHERE ls.id = ?5 AND ls.organization_id = ?4
             AND ls.status = 'active' AND ls.posting_enabled = 1 AND ls.expires_at > ?3
         )`
    ).bind(commentId, nextPostAt, nowIso, input.organizationId, input.liveSessionId, input.participantTokenHash),
    db.prepare(
      `INSERT INTO comments (
         id, organization_id, live_session_id, participant_id,
         idempotency_key, nickname, message, message_length,
         moderation_state, created_at, updated_at, retained_until, deleted_at,
         display_message, filter_action, filter_ai_required, filter_version,
         detected_language, language_confidence_milli, unsupported_language
       )
       SELECT ?1, p.organization_id, p.live_session_id, p.id,
              ?2, ?3, ?4, ?5,
              CASE
                WHEN ?15 = 1 THEN 'pending'
                WHEN ?11 = 'review' THEN 'pending'
                WHEN COALESCE(sms.moderation_mode, 'off') = 'pre' THEN 'pending'
                ELSE 'visible'
              END,
              ?6, ?6, ?7, NULL, ?12, ?11, ?13, ?14, ?16, ?17, ?18
       FROM participants p
       LEFT JOIN session_moderation_settings sms
         ON sms.organization_id = p.organization_id AND sms.live_session_id = p.live_session_id
       WHERE p.organization_id = ?8 AND p.live_session_id = ?9
         AND p.token_hash = ?10 AND p.status = 'active' AND p.post_claim_id = ?1
       ON CONFLICT(live_session_id, idempotency_key) DO NOTHING`
    ).bind(
      commentId,
      input.idempotencyKey,
      input.nickname,
      input.message,
      input.messageLength,
      nowIso,
      retainedUntil,
      input.organizationId,
      input.liveSessionId,
      input.participantTokenHash,
      filterDecision.action || "allow",
      filterDecision.displayMessage || null,
      filterDecision.aiRequired ? 1 : 0,
      Number(filterDecision.version || 0),
      filterDecision.requiresReview ? 1 : 0,
      filterDecision.detectedLanguage || "und",
      Number(filterDecision.languageConfidenceMilli || 0),
      filterDecision.unsupportedLanguage ? 1 : 0
    ),
    db.prepare(
      `INSERT INTO comment_events (
         id, organization_id, live_session_id, comment_id,
         event_type, actor_type, actor_user_id, details_json, created_at
       )
       SELECT ?1, organization_id, live_session_id, id,
              'created', 'participant', NULL, NULL, created_at
       FROM comments WHERE id = ?2
       ON CONFLICT(id) DO NOTHING`
    ).bind(eventId, commentId)
  ];
  statements.push(...filterMatchStatements(
    db, commentId, input.organizationId, input.liveSessionId, filterDecision, nowIso
  ));
  if (await tableExists(db, "comment_page_links")) {
    statements.push(commentPageLinkStatement(db, {
      commentId,
      organizationId: input.organizationId,
      liveSessionId: input.liveSessionId
    }));
  }
  const results = await db.batch(statements);

  // D1 may report meta.changes=0 for an INSERT that fired SQLite triggers.
  // The generated comment ID is collision-resistant and uniquely identifies
  // this request's successful insert, so row existence is the reliable source.
  const inserted = await findCommentById(db, commentId);
  if (inserted) return { comment: commentResponse(inserted), duplicate: false };

  const racedDuplicate = await findCommentByIdempotency(
    db,
    input.liveSessionId,
    input.idempotencyKey,
    input.participantTokenHash,
    nowIso
  );
  if (racedDuplicate) return { comment: commentResponse(racedDuplicate), duplicate: true };
  if (await activeIdempotencyKeyExists(db, input.liveSessionId, input.idempotencyKey, nowIso)) {
    throw new AuthError(409, "IDEMPOTENCY_KEY_CONFLICT");
  }

  const session = await db.prepare(
    `SELECT status, posting_enabled, expires_at
     FROM live_sessions WHERE id = ?1 AND organization_id = ?2 LIMIT 1`
  ).bind(input.liveSessionId, input.organizationId).first();
  if (!session || session.status !== "active" || !session.posting_enabled || Date.parse(session.expires_at) <= now.getTime()) {
    throw new AuthError(403, "POSTING_CLOSED");
  }
  throw new AuthError(429, "RATE_LIMITED");
}

export async function listSessionComments(db, input) {
  const limit = input.limit;
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const pdfPageSelect = await pdfPageSelectExpression(db, "c");
  let sql = `
    SELECT c.id, c.nickname, c.message, c.display_message, c.message_length, c.moderation_state,
           c.filter_action, c.filter_ai_required, c.filter_version,
           c.detected_language, c.language_confidence_milli, c.unsupported_language,
           c.created_at, c.updated_at, c.retained_until, c.deleted_at,
           ${pdfPageSelect} AS pdf_page_number,
           COALESCE((SELECT json_group_array(json_object(
             'termId', fm.term_id, 'category', fm.category, 'severity', fm.severity,
             'matchKind', fm.match_kind, 'confidence', fm.confidence_milli / 1000.0,
             'obfuscationScore', fm.obfuscation_score
           )) FROM comment_filter_matches fm WHERE fm.comment_id = c.id), '[]') AS filter_matches_json,
           (SELECT j.status FROM ai_jobs j
            WHERE j.comment_id = c.id AND j.job_type = 'moderation'
            ORDER BY j.created_at DESC, j.id DESC LIMIT 1) AS ai_moderation_status,
           (SELECT j.last_error_code FROM ai_jobs j
            WHERE j.comment_id = c.id AND j.job_type = 'moderation'
            ORDER BY j.created_at DESC, j.id DESC LIMIT 1) AS ai_moderation_error,
           (SELECT r.recommendation FROM ai_results r
            WHERE r.comment_id = c.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS ai_recommendation,
           (SELECT r.confidence_milli FROM ai_results r
            WHERE r.comment_id = c.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS ai_confidence_milli,
           (SELECT r.categories_json FROM ai_results r
            WHERE r.comment_id = c.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS ai_categories_json,
           (SELECT r.source FROM ai_results r
            WHERE r.comment_id = c.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS ai_result_source,
           (SELECT j.status FROM ai_jobs j
            WHERE j.comment_id = c.id AND j.job_type = 'translation'
            ORDER BY j.created_at DESC, j.id DESC LIMIT 1) AS translation_status,
           (SELECT j.last_error_code FROM ai_jobs j
            WHERE j.comment_id = c.id AND j.job_type = 'translation'
            ORDER BY j.created_at DESC, j.id DESC LIMIT 1) AS translation_error,
           (SELECT t.target_language FROM translations t
            WHERE t.comment_id = c.id ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS translation_language,
           (SELECT t.display_text FROM translations t
            WHERE t.comment_id = c.id AND t.filter_action IN ('allow', 'mask')
            ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS translation_text,
           (SELECT t.filter_action FROM translations t
            WHERE t.comment_id = c.id ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS translation_filter_action
    FROM comments c
    WHERE c.organization_id = ?1 AND c.live_session_id = ?2
      AND c.retained_until > ?3`;
  const values = [input.organizationId, input.liveSessionId, nowIso];
  if (Array.isArray(input.states) && input.states.length) {
    const placeholders = input.states.map((_, index) => `?${values.length + index + 1}`).join(", ");
    sql += ` AND c.moderation_state IN (${placeholders})`;
    values.push(...input.states);
  }
  if (input.cursor) {
    const createdIndex = values.length + 1;
    const idIndex = values.length + 2;
    sql += ` AND (c.created_at < ?${createdIndex} OR (c.created_at = ?${createdIndex} AND c.id < ?${idIndex}))`;
    values.push(input.cursor[0], input.cursor[1]);
  }
  sql += ` ORDER BY c.created_at DESC, c.id DESC LIMIT ?${values.length + 1}`;
  values.push(limit + 1);
  const result = await db.prepare(sql).bind(...values).all();
  const rows = rowsOf(result);
  const hasMore = rows.length > limit;
  return {
    rows: rows.slice(0, limit).map(commentResponse),
    hasMore
  };
}

export async function listCommentsForExport(db, organizationId, liveSessionId, limit = 10_000, now = Date.now()) {
  const pdfPageSelect = await pdfPageSelectExpression(db, "comments");
  const nowIso = new Date(now).toISOString();
  const result = await db.prepare(
    `SELECT id, nickname, message, display_message, message_length, moderation_state,
            filter_action, filter_ai_required, filter_version,
            detected_language, language_confidence_milli, unsupported_language,
            created_at, updated_at, retained_until, deleted_at,
            ${pdfPageSelect} AS pdf_page_number
     FROM comments
     WHERE organization_id = ?1 AND live_session_id = ?2
       AND retained_until > ?3
     ORDER BY created_at ASC, id ASC
     LIMIT ?4`
  ).bind(organizationId, liveSessionId, nowIso, limit + 1).all();
  const rows = rowsOf(result);
  return { rows: rows.slice(0, limit).map(commentResponse), truncated: rows.length > limit };
}

export async function runCommentRetention(db, options = {}) {
  const nowIso = new Date(options.now ?? Date.now()).toISOString();
  const limit = normalizeCleanupLimit(options.limit);
  const hasUnderstandingSignals = await tableExists(db, "understanding_signals");
  const signalGuard = hasUnderstandingSignals
    ? `AND NOT EXISTS (SELECT 1 FROM understanding_signals us WHERE us.participant_id = p.id)`
    : "";
  const results = await db.batch([
    db.prepare(
      `DELETE FROM comments
       WHERE id IN (
         SELECT id FROM comments
         WHERE retained_until <= ?1
         ORDER BY retained_until ASC, id ASC
         LIMIT ?2
       )`
    ).bind(nowIso, limit),
    db.prepare(
      `DELETE FROM participants
       WHERE id IN (
         SELECT p.id FROM participants p
         WHERE p.last_seen_at <= ?1
           AND NOT EXISTS (
             SELECT 1 FROM comments c WHERE c.participant_id = p.id
           )
           ${signalGuard}
         ORDER BY p.last_seen_at ASC, p.id ASC
         LIMIT ?2
       )`
    ).bind(nowIso, limit)
  ]);
  return {
    commentsDeleted: changesOf(results?.[0]),
    participantsDeleted: changesOf(results?.[1]),
    limit
  };
}

async function findCommentByIdempotency(db, liveSessionId, key, participantTokenHash, nowIso) {
  const pdfPageSelect = await pdfPageSelectExpression(db, "comments");
  return db.prepare(
    `SELECT id, nickname, message, display_message, message_length, moderation_state,
            filter_action, filter_ai_required, filter_version,
            detected_language, language_confidence_milli, unsupported_language,
            created_at, updated_at, retained_until, deleted_at,
            ${pdfPageSelect} AS pdf_page_number
     FROM comments
     WHERE live_session_id = ?1 AND idempotency_key = ?2
       AND retained_until > ?3
       AND participant_id = (
         SELECT id FROM participants
         WHERE live_session_id = ?1 AND token_hash = ?4 LIMIT 1
       )
     LIMIT 1`
  ).bind(liveSessionId, key, nowIso, participantTokenHash).first();
}

async function activeIdempotencyKeyExists(db, liveSessionId, key, nowIso) {
  const row = await db.prepare(
    `SELECT 1 AS present FROM comments
     WHERE live_session_id = ?1 AND idempotency_key = ?2 AND retained_until > ?3
     LIMIT 1`
  ).bind(liveSessionId, key, nowIso).first();
  return Boolean(row?.present);
}

async function releaseExpiredIdempotencyKey(db, liveSessionId, key, nowIso) {
  await db.prepare(
    `DELETE FROM comments
     WHERE live_session_id = ?1 AND idempotency_key = ?2 AND retained_until <= ?3`
  ).bind(liveSessionId, key, nowIso).run();
}

async function findCommentById(db, id) {
  const pdfPageSelect = await pdfPageSelectExpression(db, "comments");
  return db.prepare(
    `SELECT id, nickname, message, display_message, message_length, moderation_state,
            filter_action, filter_ai_required, filter_version,
            detected_language, language_confidence_milli, unsupported_language,
            created_at, updated_at, retained_until, deleted_at,
            ${pdfPageSelect} AS pdf_page_number
     FROM comments WHERE id = ?1 LIMIT 1`
  ).bind(id).first();
}

function commentResponse(row) {
  return {
    id: row.id,
    nickname: row.nickname || "",
    message: row.message,
    displayMessage: row.display_message || null,
    messageLength: Number(row.message_length),
    moderationState: row.moderation_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retainedUntil: row.retained_until,
    deletedAt: row.deleted_at || null,
    pdfPageNumber: row.pdf_page_number == null ? null : Number(row.pdf_page_number),
    language: {
      code: row.detected_language || "und",
      confidence: Number(row.language_confidence_milli || 0) / 1000,
      unsupported: Boolean(row.unsupported_language)
    },
    filter: {
      action: row.filter_action || "allow",
      aiRequired: Boolean(row.filter_ai_required),
      version: Number(row.filter_version || 0),
      matches: parseJsonArray(row.filter_matches_json)
    },
    ai: {
      moderation: row.ai_moderation_status || row.ai_recommendation ? {
        status: row.ai_moderation_status || null,
        error: row.ai_moderation_error || null,
        recommendation: row.ai_recommendation || null,
        confidence: row.ai_confidence_milli == null ? null : Number(row.ai_confidence_milli) / 1000,
        categories: parseJsonArray(row.ai_categories_json),
        source: row.ai_result_source || null
      } : null,
      translation: row.translation_status || row.translation_text ? {
        status: row.translation_status || null,
        error: row.translation_error || null,
        targetLanguage: row.translation_language || null,
        text: row.translation_text || null,
        filterAction: row.translation_filter_action || "allow"
      } : null
    }
  };
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function pdfPageSelectExpression(db, alias) {
  if (!await tableExists(db, "comment_page_links")) return "NULL";
  const safeAlias = alias === "c" ? "c" : "comments";
  return `(SELECT l.page_number FROM comment_page_links l WHERE l.comment_id = ${safeAlias}.id LIMIT 1)`;
}

async function tableExists(db, name) {
  let known = EXISTING_TABLE_CACHE.get(db);
  if (known?.has(name)) return true;
  try {
    const row = await db.prepare(
      `SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1`
    ).bind(name).first();
    if (!row?.present) return false;
    if (!known) {
      known = new Set();
      EXISTING_TABLE_CACHE.set(db, known);
    }
    known.add(name);
    return true;
  } catch {
    return false;
  }
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}

function normalizeCleanupLimit(value) {
  const number = Number(value ?? 500);
  if (!Number.isInteger(number) || number < 1 || number > 5000) return 500;
  return number;
}
