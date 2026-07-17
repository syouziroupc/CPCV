import { AuthError } from "../auth/errors.js";
import { detectCommentLanguage } from "../content-filter/language.js";
import { makeId } from "../auth/request.js";
import { getRealtimeEventById, realtimeEventStatements } from "../realtime/repository.js";
import { normalizeAiJobTypes } from "./validation.js";

const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MS = 15 * 60 * 1000;

export async function getOrganizationAiSettings(db, organizationId) {
  await ensureOrganizationAiSettings(db, organizationId);
  const row = await db.prepare(
    `SELECT organization_id, enabled, moderation_daily_limit, translation_daily_limit,
            updated_by_user_id, created_at, updated_at
     FROM organization_ai_settings WHERE organization_id = ?1 LIMIT 1`
  ).bind(organizationId).first();
  if (!row) throw new AuthError(404, "ORGANIZATION_NOT_FOUND");
  return organizationSettingsResponse(row);
}

export async function updateOrganizationAiSettings(db, input) {
  await ensureOrganizationAiSettings(db, input.organizationId);
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const result = await db.prepare(
    `UPDATE organization_ai_settings
     SET enabled = ?1, moderation_daily_limit = ?2, translation_daily_limit = ?3,
         updated_by_user_id = ?4, updated_at = ?5
     WHERE organization_id = ?6`
  ).bind(
    input.enabled ? 1 : 0,
    input.moderationDailyLimit,
    input.translationDailyLimit,
    input.actorUserId,
    nowIso,
    input.organizationId
  ).run();
  if (changesOf(result) !== 1) throw new AuthError(404, "ORGANIZATION_NOT_FOUND");
  return getOrganizationAiSettings(db, input.organizationId);
}

export async function getSessionAiSettings(db, organizationId, liveSessionId) {
  await ensureSessionAiSettings(db, organizationId, liveSessionId);
  const row = await db.prepare(
    `SELECT s.organization_id, s.live_session_id, s.moderation_enabled,
            s.translation_enabled, s.target_language, s.updated_by_user_id,
            s.created_at, s.updated_at,
            COALESCE(o.enabled, 0) AS organization_enabled
     FROM session_ai_settings s
     LEFT JOIN organization_ai_settings o ON o.organization_id = s.organization_id
     WHERE s.organization_id = ?1 AND s.live_session_id = ?2 LIMIT 1`
  ).bind(organizationId, liveSessionId).first();
  if (!row) throw new AuthError(404, "SESSION_NOT_FOUND");
  return sessionSettingsResponse(row);
}

export async function updateSessionAiSettings(db, input) {
  await ensureSessionAiSettings(db, input.organizationId, input.liveSessionId);
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const result = await db.prepare(
    `UPDATE session_ai_settings
     SET moderation_enabled = ?1, translation_enabled = ?2,
         target_language = ?3, updated_by_user_id = ?4, updated_at = ?5
     WHERE organization_id = ?6 AND live_session_id = ?7`
  ).bind(
    input.moderationEnabled ? 1 : 0,
    input.translationEnabled ? 1 : 0,
    input.targetLanguage,
    input.actorUserId,
    nowIso,
    input.organizationId,
    input.liveSessionId
  ).run();
  if (changesOf(result) !== 1) throw new AuthError(404, "SESSION_NOT_FOUND");
  return getSessionAiSettings(db, input.organizationId, input.liveSessionId);
}

export async function createAiJobsForComment(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const context = await db.prepare(
    `SELECT c.id, c.organization_id, c.live_session_id, c.message, c.moderation_state,
            COALESCE(c.filter_ai_required, 0) AS filter_ai_required,
            COALESCE(c.detected_language, 'und') AS detected_language,
            COALESCE(c.unsupported_language, 0) AS unsupported_language,
            COALESCE(o.enabled, 0) AS organization_enabled,
            COALESCE(s.moderation_enabled, 0) AS moderation_enabled,
            COALESCE(s.translation_enabled, 0) AS translation_enabled,
            COALESCE(s.target_language, 'ja') AS target_language,
            COALESCE(f.enabled, 0) AS filter_enabled,
            COALESCE(f.ai_routing_mode, 'ambiguous') AS filter_ai_routing_mode,
            COALESCE(f.unsupported_language_mode, 'ai_review') AS unsupported_language_mode
     FROM comments c
     LEFT JOIN organization_ai_settings o ON o.organization_id = c.organization_id
     LEFT JOIN session_ai_settings s
       ON s.organization_id = c.organization_id AND s.live_session_id = c.live_session_id
     LEFT JOIN session_content_filter_settings f
       ON f.organization_id = c.organization_id AND f.live_session_id = c.live_session_id
     WHERE c.id = ?1 AND c.organization_id = ?2 AND c.live_session_id = ?3
       AND c.moderation_state <> 'deleted' AND c.retained_until > ?4
     LIMIT 1`
  ).bind(input.commentId, input.organizationId, input.liveSessionId, nowIso).first();
  if (!context || !context.organization_enabled) return [];
  if (!context.detected_language || context.detected_language === "und") {
    const detected = detectCommentLanguage(context.message);
    context.detected_language = detected.code === "neutral" ? "und" : detected.code;
    context.unsupported_language = detected.supported ? 0 : 1;
    await db.prepare(
      `UPDATE comments SET detected_language = ?1, language_confidence_milli = ?2, unsupported_language = ?3
       WHERE id = ?4 AND detected_language = 'und' AND retained_until > ?5`
    ).bind(context.detected_language, detected.confidenceMilli, context.unsupported_language, context.id, nowIso).run();
  }
  const statements = [];
  const unsupportedAiReview = Boolean(context.filter_enabled)
    && Boolean(context.unsupported_language)
    && context.unsupported_language_mode === "ai_review";
  const moderationRouted = unsupportedAiReview
    || !context.filter_enabled
    || context.filter_ai_routing_mode === "all"
    || (context.filter_ai_routing_mode === "ambiguous" && context.filter_ai_required);
  if ((context.moderation_enabled || unsupportedAiReview) && moderationRouted) {
    statements.push(aiJobInsertStatement(db, {
      id: makeId("aij"), organizationId: input.organizationId, liveSessionId: input.liveSessionId,
      commentId: input.commentId, jobType: "moderation", targetLanguage: "", nowIso
    }));
  }
  const sourceLanguage = String(context.detected_language || "und");
  const translationUseful = context.translation_enabled
    && context.moderation_state === "visible"
    && sourceLanguage !== "und"
    && sourceLanguage !== "neutral"
    && sourceLanguage !== context.target_language;
  if (translationUseful) {
    statements.push(aiJobInsertStatement(db, {
      id: makeId("aij"), organizationId: input.organizationId, liveSessionId: input.liveSessionId,
      commentId: input.commentId, jobType: "translation", targetLanguage: context.target_language, nowIso
    }));
  }
  if (!statements.length) return [];
  await db.batch(statements);
  const result = await db.prepare(
    `SELECT id, job_type, target_language, status
     FROM ai_jobs
     WHERE comment_id = ?1 AND organization_id = ?2 AND live_session_id = ?3
       AND status IN ('queued', 'retry')
     ORDER BY created_at ASC, id ASC`
  ).bind(input.commentId, input.organizationId, input.liveSessionId).all();
  return rowsOf(result).map(jobDispatchResponse);
}

export async function backfillAiJobsForSession(db, input) {
  const result = await db.prepare(
    `SELECT id FROM comments
     WHERE organization_id = ?1 AND live_session_id = ?2
       AND moderation_state <> 'deleted' AND retained_until > ?3
     ORDER BY created_at DESC, id DESC LIMIT ?4`
  ).bind(input.organizationId, input.liveSessionId, new Date(input.now ?? Date.now()).toISOString(), input.limit || 100).all();
  const jobs = [];
  for (const row of rowsOf(result).reverse()) {
    jobs.push(...await createAiJobsForComment(db, {
      organizationId: input.organizationId,
      liveSessionId: input.liveSessionId,
      commentId: row.id,
      now: input.now
    }));
  }
  return dedupeJobs(jobs);
}

export async function claimAiJob(db, jobId, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const result = await db.prepare(
    `UPDATE ai_jobs
     SET status = 'processing', attempt_count = attempt_count + 1,
         claimed_at = ?1, finished_at = NULL, last_error_code = NULL, updated_at = ?1
     WHERE id = ?2 AND status IN ('queued', 'retry')
       AND run_after <= ?1 AND attempt_count < ?3
       AND EXISTS (
         SELECT 1 FROM comments c
         WHERE c.id = ai_jobs.comment_id
           AND c.organization_id = ai_jobs.organization_id
           AND c.live_session_id = ai_jobs.live_session_id
           AND c.moderation_state <> 'deleted'
           AND c.retained_until > ?1
       )`
  ).bind(nowIso, jobId, MAX_ATTEMPTS).run();
  if (changesOf(result) !== 1) return null;
  return loadAiJobContext(db, jobId, now);
}

export async function loadAiJobContext(db, jobId, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  return db.prepare(
    `SELECT j.id, j.organization_id, j.live_session_id, j.comment_id,
            j.job_type, j.target_language, j.status, j.attempt_count,
            j.run_after, j.claimed_at, j.created_at, j.updated_at,
            c.message, c.nickname, c.moderation_state, c.retained_until, c.updated_at AS comment_updated_at,
            c.filter_action, c.filter_ai_required,
            COALESCE(c.detected_language, 'und') AS detected_language,
            COALESCE(c.unsupported_language, 0) AS unsupported_language,
            COALESCE((SELECT json_group_array(json_object(
              'category', fm.category, 'severity', fm.severity,
              'matchKind', fm.match_kind, 'confidence', fm.confidence_milli / 1000.0,
              'obfuscationScore', fm.obfuscation_score
            )) FROM comment_filter_matches fm WHERE fm.comment_id = c.id), '[]') AS filter_context_json,
            ls.status AS session_status, ls.expires_at AS session_expires_at,
            o.status AS organization_status,
            COALESCE(oas.enabled, 0) AS organization_ai_enabled,
            COALESCE(sas.moderation_enabled, 0) AS session_moderation_enabled,
            COALESCE(sas.translation_enabled, 0) AS session_translation_enabled,
            COALESCE(sas.target_language, 'ja') AS session_target_language,
            COALESCE(scfs.enabled, 0) AS session_filter_enabled,
            COALESCE(scfs.ai_routing_mode, 'ambiguous') AS session_filter_ai_routing_mode,
            COALESCE(scfs.translation_filter_enabled, 1) AS translation_filter_enabled,
            COALESCE(scfs.unsupported_language_mode, 'ai_review') AS unsupported_language_mode
     FROM ai_jobs j
     JOIN comments c
       ON c.id = j.comment_id AND c.organization_id = j.organization_id
          AND c.live_session_id = j.live_session_id
     JOIN live_sessions ls
       ON ls.id = j.live_session_id AND ls.organization_id = j.organization_id
     JOIN organizations o ON o.id = j.organization_id
     LEFT JOIN organization_ai_settings oas ON oas.organization_id = j.organization_id
     LEFT JOIN session_ai_settings sas
       ON sas.organization_id = j.organization_id AND sas.live_session_id = j.live_session_id
     LEFT JOIN session_content_filter_settings scfs
       ON scfs.organization_id = j.organization_id AND scfs.live_session_id = j.live_session_id
     WHERE j.id = ?1 AND c.retained_until > ?2 AND c.moderation_state <> 'deleted' LIMIT 1`
  ).bind(jobId, nowIso).first();
}

export async function reserveAiUsage(db, job, now = Date.now(), model = "") {
  const nowIso = new Date(now).toISOString();
  const normalizedModel = String(model || "").trim();
  if (!normalizedModel) throw new AuthError(500, "AI_MODEL_NOT_CONFIGURED");
  const eventId = makeId("aiu");
  try {
    await db.prepare(
      `INSERT INTO ai_usage_events (
         id, organization_id, job_id, attempt_number, job_type, provider, model, day_key,
         input_characters, output_characters, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, 'workers_ai', ?6, ?7, ?8, 0, ?9, ?9)`
    ).bind(
      eventId,
      job.organization_id,
      job.id,
      Math.max(1, Number(job.attempt_count) || 1),
      job.job_type,
      normalizedModel,
      nowIso.slice(0, 10),
      Array.from(String(job.message || "")).length,
      nowIso
    ).run();
  } catch (error) {
    const text = String(error?.message || error || "");
    if (text.includes("AI_DAILY_LIMIT_REACHED")) throw new AuthError(429, "AI_DAILY_LIMIT_REACHED");
    throw error;
  }
  return eventId;
}

export async function completeModerationJob(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const statements = [
    db.prepare(
      `INSERT INTO ai_results (
         id, job_id, organization_id, live_session_id, comment_id,
         recommendation, confidence_milli, categories_json, source,
         provider, model, prompt_version, created_at
       )
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
       FROM ai_jobs j
       WHERE j.id = ?2 AND j.organization_id = ?3 AND j.live_session_id = ?4 AND j.comment_id = ?5
         AND j.job_type = 'moderation' AND j.status = 'processing'
         AND j.claimed_at = ?14 AND j.attempt_count = ?15
         AND EXISTS (
           SELECT 1 FROM comments c
           WHERE c.id = j.comment_id AND c.organization_id = j.organization_id
             AND c.live_session_id = j.live_session_id AND c.retained_until > ?13
             AND c.moderation_state <> 'deleted'
         )
       ON CONFLICT(job_id) DO UPDATE SET
         recommendation = excluded.recommendation,
         confidence_milli = excluded.confidence_milli,
         categories_json = excluded.categories_json,
         source = excluded.source,
         provider = excluded.provider,
         model = excluded.model,
         prompt_version = excluded.prompt_version,
         created_at = excluded.created_at`
    ).bind(
      input.resultId || makeId("air"), input.job.id, input.job.organization_id,
      input.job.live_session_id, input.job.comment_id, input.recommendation,
      input.confidenceMilli, JSON.stringify(input.categories), input.source,
      input.provider, input.model, input.promptVersion, nowIso,
      input.job.claimed_at, Number(input.job.attempt_count)
    ),
    finishJobStatement(db, input.job, "succeeded", null, nowIso, { requireRetainedComment: true })
  ];
  if (input.usageEventId) statements.push(usageOutputStatement(db, input.usageEventId, input.outputCharacters || 0, nowIso));
  let results;
  try {
    results = await db.batch(statements);
  } catch (error) {
    throw aiPersistenceError(error);
  }
  if (changesOf(results?.[0]) !== 1 || changesOf(results?.[1]) !== 1) {
    throw new AuthError(409, "AI_JOB_STATE_CONFLICT");
  }
}

export async function completeTranslationJob(db, input) {
  const now = input.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const filter = input.filterDecision || { action: "allow", displayMessage: null, matches: [], version: 0 };
  const displayText = filter.action === "allow"
    ? input.translatedText
    : filter.action === "mask"
      ? (filter.displayMessage || input.translatedText)
      : null;
  const statements = [
    db.prepare(
      `INSERT INTO translations (
         id, job_id, organization_id, live_session_id, comment_id,
         target_language, translated_text, provider, model, prompt_version, created_at,
         source_language, display_text, filter_action, filter_matches_json, filter_version
       )
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
       FROM ai_jobs j
       WHERE j.id = ?2 AND j.organization_id = ?3 AND j.live_session_id = ?4 AND j.comment_id = ?5
         AND j.job_type = 'translation' AND j.target_language = ?6 AND j.status = 'processing'
         AND j.claimed_at = ?17 AND j.attempt_count = ?18
         AND EXISTS (
           SELECT 1 FROM comments c
           WHERE c.id = j.comment_id AND c.organization_id = j.organization_id
             AND c.live_session_id = j.live_session_id AND c.retained_until > ?11
             AND c.moderation_state = 'visible'
         )
       ON CONFLICT(comment_id, target_language) DO UPDATE SET
         job_id = excluded.job_id,
         translated_text = excluded.translated_text,
         provider = excluded.provider,
         model = excluded.model,
         prompt_version = excluded.prompt_version,
         created_at = excluded.created_at,
         source_language = excluded.source_language,
         display_text = excluded.display_text,
         filter_action = excluded.filter_action,
         filter_matches_json = excluded.filter_matches_json,
         filter_version = excluded.filter_version`
    ).bind(
      input.translationId || makeId("trn"), input.job.id, input.job.organization_id,
      input.job.live_session_id, input.job.comment_id, input.job.target_language,
      input.translatedText, input.provider, input.model, input.promptVersion, nowIso,
      input.job.detected_language || "und", displayText, filter.action || "allow",
      JSON.stringify(filter.matches || []), Number(filter.version || 0),
      input.job.claimed_at, Number(input.job.attempt_count)
    ),
    finishJobStatement(db, input.job, "succeeded", null, nowIso, { requireRetainedComment: true })
  ];
  if (input.usageEventId) statements.push(usageOutputStatement(db, input.usageEventId, input.outputCharacters || 0, nowIso));
  if (!displayText) {
    let results;
    try { results = await db.batch(statements); } catch (error) { throw aiPersistenceError(error); }
    if (changesOf(results?.[0]) !== 1 || changesOf(results?.[1]) !== 1) {
      throw new AuthError(409, "AI_JOB_STATE_CONFLICT");
    }
    return null;
  }
  const realtime = realtimeEventStatements(db, {
    organizationId: input.job.organization_id,
    liveSessionId: input.job.live_session_id,
    eventType: "settings:update",
    sourceCommentId: input.job.comment_id,
    payload: {
      type: "translation:ready",
      commentId: input.job.comment_id,
      targetLanguage: input.job.target_language,
      translation: displayText,
      label: "AI翻訳"
    },
    requiredAiJob: {
      id: input.job.id,
      claimedAt: input.job.claimed_at,
      attemptCount: Number(input.job.attempt_count),
      finishedAt: nowIso
    },
    now
  });
  const realtimeOffset = statements.length;
  statements.push(...realtime.statements);
  let results;
  try {
    results = await db.batch(statements);
  } catch (error) {
    throw aiPersistenceError(error);
  }
  if (changesOf(results?.[0]) !== 1 || changesOf(results?.[1]) !== 1) {
    throw new AuthError(409, "AI_JOB_STATE_CONFLICT");
  }
  if (changesOf(results?.[realtimeOffset + 1]) !== 1 || changesOf(results?.[realtimeOffset + 2]) !== 1) {
    throw new AuthError(500, "REALTIME_EVENT_WRITE_INCONSISTENT");
  }
  return getRealtimeEventById(db, realtime.eventId, now);
}

export async function completePrivacyGuardModeration(db, input) {
  await completeModerationJob(db, {
    job: input.job,
    recommendation: "review",
    confidenceMilli: 1000,
    categories: ["personal_data", ...(input.promptInjection ? ["prompt_injection"] : [])],
    source: "local_privacy_guard",
    provider: "local",
    model: "privacy-guard-v1",
    promptVersion: "privacy-guard-v1",
    outputCharacters: 0,
    now: input.now
  });
}

export async function skipAiJob(db, job, code, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const result = await db.prepare(
    `UPDATE ai_jobs
     SET status = 'skipped', finished_at = ?1, last_error_code = ?2, updated_at = ?1
     WHERE id = ?3 AND status = 'processing'
       AND claimed_at = ?4 AND attempt_count = ?5`
  ).bind(nowIso, code, job.id, job.claimed_at, Number(job.attempt_count)).run();
  if (changesOf(result) !== 1) throw new AuthError(409, "AI_JOB_STATE_CONFLICT");
}

export async function failOrRetryAiJob(db, job, code, retryable, now = Date.now()) {
  const nowMs = Number(now);
  const finalFailure = !retryable || Number(job.attempt_count || 0) >= MAX_ATTEMPTS;
  const nextStatus = finalFailure ? "failed" : "retry";
  const runAfter = finalFailure
    ? new Date(nowMs).toISOString()
    : new Date(nowMs + retryDelayMs(job.attempt_count)).toISOString();
  const finishedAt = finalFailure ? new Date(nowMs).toISOString() : null;
  const result = await db.prepare(
    `UPDATE ai_jobs
     SET status = ?1, run_after = ?2, finished_at = ?3,
         claimed_at = CASE WHEN ?1 = 'retry' THEN NULL ELSE claimed_at END,
         last_error_code = ?4, updated_at = ?5
     WHERE id = ?6 AND status = 'processing'
       AND claimed_at = ?7 AND attempt_count = ?8`
  ).bind(
    nextStatus, runAfter, finishedAt, code, new Date(nowMs).toISOString(),
    job.id, job.claimed_at, Number(job.attempt_count)
  ).run();
  if (changesOf(result) !== 1) throw new AuthError(409, "AI_JOB_STATE_CONFLICT");
  return { retry: !finalFailure, delaySeconds: Math.max(0, Math.ceil((Date.parse(runAfter) - nowMs) / 1000)) };
}

export async function retryAiJobsForComment(db, input) {
  const types = normalizeAiJobTypes(input.jobTypes);
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const placeholders = types.map((_, index) => `?${index + 4}`).join(", ");
  await db.prepare(
    `UPDATE ai_jobs
     SET status = 'queued', attempt_count = 0, run_after = ?1,
         claimed_at = NULL, finished_at = NULL, last_error_code = NULL, updated_at = ?1
     WHERE organization_id = ?2 AND comment_id = ?3
       AND job_type IN (${placeholders})
       AND status IN ('failed', 'skipped')
       AND COALESCE(last_error_code, '') NOT IN ('PII_DETECTED', 'AI_DISABLED')`
  ).bind(nowIso, input.organizationId, input.commentId, ...types).run();
  const result = await db.prepare(
    `SELECT id, job_type, target_language, status FROM ai_jobs
     WHERE organization_id = ?1 AND comment_id = ?2
       AND status IN ('queued', 'retry')
     ORDER BY created_at ASC, id ASC`
  ).bind(input.organizationId, input.commentId).all();
  return rowsOf(result).map(jobDispatchResponse);
}

export async function listDueAiJobs(db, input = {}) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const limit = Math.max(1, Math.min(200, Number(input.limit) || 100));
  const staleIso = new Date(Date.parse(nowIso) - STALE_PROCESSING_MS).toISOString();
  await db.batch([
    db.prepare(
      `UPDATE ai_jobs
       SET status = 'skipped', finished_at = ?1, last_error_code = 'COMMENT_EXPIRED', updated_at = ?1
       WHERE status IN ('queued', 'retry', 'processing')
         AND EXISTS (
           SELECT 1 FROM comments c
           WHERE c.id = ai_jobs.comment_id AND c.organization_id = ai_jobs.organization_id
             AND c.live_session_id = ai_jobs.live_session_id
             AND (c.retained_until <= ?1 OR c.moderation_state = 'deleted')
         )`
    ).bind(nowIso),
    db.prepare(
      `UPDATE ai_jobs
       SET status = 'failed', finished_at = ?1,
           last_error_code = 'AI_STALE_MAX_ATTEMPTS', updated_at = ?1
       WHERE status = 'processing' AND claimed_at <= ?2 AND attempt_count >= ?3`
    ).bind(nowIso, staleIso, MAX_ATTEMPTS),
    db.prepare(
      `UPDATE ai_jobs
       SET status = 'retry', run_after = ?1, claimed_at = NULL,
           last_error_code = 'AI_STALE_PROCESSING', updated_at = ?1
       WHERE status = 'processing' AND claimed_at <= ?2 AND attempt_count < ?3`
    ).bind(nowIso, staleIso, MAX_ATTEMPTS)
  ]);
  const result = await db.prepare(
    `SELECT id, job_type, target_language, status
     FROM ai_jobs
     WHERE status IN ('queued', 'retry') AND run_after <= ?1 AND attempt_count < ?2
     ORDER BY run_after ASC, created_at ASC, id ASC LIMIT ?3`
  ).bind(nowIso, MAX_ATTEMPTS, limit).all();
  return rowsOf(result).map(jobDispatchResponse);
}

export async function getCommentAiSummary(db, input) {
  const result = await db.prepare(
    `SELECT j.id, j.job_type, j.target_language, j.status, j.attempt_count,
            j.last_error_code, j.created_at, j.updated_at,
            r.recommendation, r.confidence_milli, r.categories_json, r.source,
            t.display_text AS translated_text, t.target_language AS translated_language,
            t.filter_action AS translation_filter_action
     FROM ai_jobs j
     LEFT JOIN ai_results r ON r.job_id = j.id
     LEFT JOIN translations t ON t.job_id = j.id
     WHERE j.organization_id = ?1 AND j.live_session_id = ?2 AND j.comment_id = ?3
     ORDER BY j.job_type ASC, j.created_at ASC, j.id ASC`
  ).bind(input.organizationId, input.liveSessionId, input.commentId).all();
  return aiSummaryFromRows(rowsOf(result));
}

export function aiSummaryFromRows(rows) {
  const summary = { moderation: null, translations: [] };
  for (const row of rows || []) {
    if (row.job_type === "moderation") {
      summary.moderation = {
        jobId: row.id,
        status: row.status,
        attemptCount: Number(row.attempt_count || 0),
        error: row.last_error_code || null,
        recommendation: row.recommendation || null,
        confidence: row.confidence_milli == null ? null : Number(row.confidence_milli) / 1000,
        categories: parseJsonArray(row.categories_json),
        source: row.source || null,
        updatedAt: row.updated_at
      };
    } else if (row.job_type === "translation") {
      summary.translations.push({
        jobId: row.id,
        status: row.status,
        attemptCount: Number(row.attempt_count || 0),
        error: row.last_error_code || null,
        targetLanguage: row.translated_language || row.target_language,
        text: row.translated_text || null,
        filterAction: row.translation_filter_action || "allow",
        updatedAt: row.updated_at
      });
    }
  }
  return summary;
}

async function ensureOrganizationAiSettings(db, organizationId) {
  await db.prepare(
    `INSERT OR IGNORE INTO organization_ai_settings (
       organization_id, enabled, moderation_daily_limit, translation_daily_limit,
       updated_by_user_id, created_at, updated_at
     )
     SELECT id, 0, 500, 500, NULL, created_at, created_at
     FROM organizations WHERE id = ?1`
  ).bind(organizationId).run();
}

async function ensureSessionAiSettings(db, organizationId, liveSessionId) {
  await db.prepare(
    `INSERT OR IGNORE INTO session_ai_settings (
       organization_id, live_session_id, moderation_enabled, translation_enabled,
       target_language, updated_by_user_id, created_at, updated_at
     )
     SELECT organization_id, id, 0, 0, 'ja', created_by_user_id, created_at, created_at
     FROM live_sessions WHERE organization_id = ?1 AND id = ?2`
  ).bind(organizationId, liveSessionId).run();
}

function aiJobInsertStatement(db, input) {
  return db.prepare(
    `INSERT OR IGNORE INTO ai_jobs (
       id, organization_id, live_session_id, comment_id, job_type,
       target_language, status, attempt_count, run_after, claimed_at,
       finished_at, last_error_code, created_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', 0, ?7, NULL, NULL, NULL, ?7, ?7)`
  ).bind(
    input.id, input.organizationId, input.liveSessionId, input.commentId,
    input.jobType, input.targetLanguage, input.nowIso
  );
}

function finishJobStatement(db, job, status, code, nowIso, options = {}) {
  return db.prepare(
    `UPDATE ai_jobs
     SET status = ?1, finished_at = ?2, last_error_code = ?3, updated_at = ?2
     WHERE id = ?4 AND status = 'processing'
       AND claimed_at = ?5 AND attempt_count = ?6
       AND (?7 = 0 OR EXISTS (
         SELECT 1 FROM comments c
         WHERE c.id = ai_jobs.comment_id AND c.organization_id = ai_jobs.organization_id
           AND c.live_session_id = ai_jobs.live_session_id
           AND c.retained_until > ?2 AND c.moderation_state <> 'deleted'
       ))`
  ).bind(
    status, nowIso, code, job.id, job.claimed_at, Number(job.attempt_count),
    options.requireRetainedComment ? 1 : 0
  );
}

function usageOutputStatement(db, usageEventId, outputCharacters, nowIso) {
  return db.prepare(
    `UPDATE ai_usage_events SET output_characters = ?1, updated_at = ?2 WHERE id = ?3`
  ).bind(Math.max(0, Math.min(1000000, Number(outputCharacters) || 0)), nowIso, usageEventId);
}

function retryDelayMs(attemptCount) {
  const attempt = Math.max(1, Number(attemptCount) || 1);
  return Math.min(15 * 60_000, 30_000 * (2 ** (attempt - 1)));
}

function organizationSettingsResponse(row) {
  return {
    organizationId: row.organization_id,
    enabled: Boolean(row.enabled),
    moderationDailyLimit: Number(row.moderation_daily_limit),
    translationDailyLimit: Number(row.translation_daily_limit),
    updatedByUserId: row.updated_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sessionSettingsResponse(row) {
  return {
    organizationId: row.organization_id,
    liveSessionId: row.live_session_id,
    organizationEnabled: Boolean(row.organization_enabled),
    moderationEnabled: Boolean(row.moderation_enabled),
    translationEnabled: Boolean(row.translation_enabled),
    targetLanguage: row.target_language,
    updatedByUserId: row.updated_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function jobDispatchResponse(row) {
  return {
    id: row.id,
    jobType: row.job_type,
    targetLanguage: row.target_language || null,
    status: row.status
  };
}

function dedupeJobs(jobs) {
  return [...new Map(jobs.map((job) => [job.id, job])).values()];
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

function aiPersistenceError(error) {
  if (error instanceof AuthError) return error;
  const wrapped = new Error("AI_PERSISTENCE_FAILED");
  wrapped.aiCode = "AI_PERSISTENCE_FAILED";
  wrapped.retryable = true;
  wrapped.cause = error;
  return wrapped;
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}
