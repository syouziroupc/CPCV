import { auditStatement } from "../auth/audit.js";
import { requireUnsafeRequestProtection } from "../auth/csrf.js";
import { AuthError } from "../auth/errors.js";
import { authJson } from "../auth/http.js";
import { requireAuth } from "../auth/middleware.js";
import { requireRole } from "../auth/permissions.js";
import { assertOnlyFields, readJsonObject, rejectOrganizationSelector } from "../auth/request.js";
import {
  backfillAiJobsForSession,
  getOrganizationAiSettings,
  getSessionAiSettings,
  retryAiJobsForComment,
  updateOrganizationAiSettings,
  updateSessionAiSettings
} from "../ai/repository.js";
import { dispatchAiJobs } from "../ai/processor.js";
import {
  requireAiBoolean,
  requireAiDailyLimit,
  requireAiTargetLanguage,
  normalizeAiJobTypes
} from "../ai/validation.js";

export async function handleOrganizationAiApi(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/org/ai-settings") return null;
  rejectOrganizationSelector(request);
  const auth = await requireAuth(request, env, { refresh: request.method === "GET" });
  if (request.method === "GET") {
    requireRole(auth, ["owner", "admin"]);
    return authJson({ ok: true, settings: await getOrganizationAiSettings(env.DB_V2, auth.organizationId) });
  }
  if (request.method !== "PATCH") throw methodNotAllowed("GET, PATCH");
  requireRole(auth, "owner");
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["enabled", "moderationDailyLimit", "translationDailyLimit"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const current = await getOrganizationAiSettings(env.DB_V2, auth.organizationId);
  const settings = await updateOrganizationAiSettings(env.DB_V2, {
    organizationId: auth.organizationId,
    enabled: Object.hasOwn(input, "enabled") ? requireAiBoolean(input.enabled, "AI_ENABLED_INVALID") : current.enabled,
    moderationDailyLimit: Object.hasOwn(input, "moderationDailyLimit")
      ? requireAiDailyLimit(input.moderationDailyLimit, "AI_MODERATION_LIMIT_INVALID")
      : current.moderationDailyLimit,
    translationDailyLimit: Object.hasOwn(input, "translationDailyLimit")
      ? requireAiDailyLimit(input.translationDailyLimit, "AI_TRANSLATION_LIMIT_INVALID")
      : current.translationDailyLimit,
    actorUserId: auth.userId
  });
  await env.DB_V2.batch([
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "organization.ai_settings.updated",
      targetType: "organization",
      targetId: auth.organizationId,
      details: {
        enabled: settings.enabled,
        moderationDailyLimit: settings.moderationDailyLimit,
        translationDailyLimit: settings.translationDailyLimit
      }
    })
  ]);
  return authJson({ ok: true, settings });
}

export async function getPrivateSessionAiSettings(env, auth, session) {
  return authJson({
    ok: true,
    settings: await getSessionAiSettings(env.DB_V2, auth.organizationId, session.id)
  });
}

export async function updatePrivateSessionAiSettings(request, env, auth, session, ctx) {
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["moderationEnabled", "translationEnabled", "targetLanguage"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const current = await getSessionAiSettings(env.DB_V2, auth.organizationId, session.id);
  const settings = await updateSessionAiSettings(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    moderationEnabled: Object.hasOwn(input, "moderationEnabled")
      ? requireAiBoolean(input.moderationEnabled, "AI_MODERATION_ENABLED_INVALID")
      : current.moderationEnabled,
    translationEnabled: Object.hasOwn(input, "translationEnabled")
      ? requireAiBoolean(input.translationEnabled, "AI_TRANSLATION_ENABLED_INVALID")
      : current.translationEnabled,
    targetLanguage: Object.hasOwn(input, "targetLanguage")
      ? requireAiTargetLanguage(input.targetLanguage)
      : current.targetLanguage,
    actorUserId: auth.userId
  });
  await env.DB_V2.batch([
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "session.ai_settings.updated",
      targetType: "live_session",
      targetId: session.id,
      details: {
        moderationEnabled: settings.moderationEnabled,
        translationEnabled: settings.translationEnabled,
        targetLanguage: settings.targetLanguage
      }
    })
  ]);
  let jobs = [];
  if (settings.organizationEnabled && (settings.moderationEnabled || settings.translationEnabled)) {
    jobs = await backfillAiJobsForSession(env.DB_V2, {
      organizationId: auth.organizationId,
      liveSessionId: session.id,
      limit: 100
    });
    const task = dispatchAiJobs(env, jobs);
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(task);
    else await task;
  }
  return authJson({ ok: true, settings, queuedJobs: jobs.length });
}

export async function retryPrivateCommentAi(request, env, auth, session, commentId, ctx) {
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["jobTypes"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const jobTypes = normalizeAiJobTypes(input.jobTypes);
  const comment = await env.DB_V2.prepare(
    `SELECT id FROM comments WHERE id = ?1 AND organization_id = ?2 AND live_session_id = ?3 LIMIT 1`
  ).bind(commentId, auth.organizationId, session.id).first();
  if (!comment) throw new AuthError(404, "COMMENT_NOT_FOUND");
  const jobs = await retryAiJobsForComment(env.DB_V2, {
    organizationId: auth.organizationId,
    commentId,
    jobTypes
  });
  const task = dispatchAiJobs(env, jobs);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(task);
  else await task;
  return authJson({ ok: true, queuedJobs: jobs.length });
}

function methodNotAllowed(allow) {
  return new AuthError(405, "METHOD_NOT_ALLOWED", { headers: { allow } });
}
