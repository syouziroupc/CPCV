import { auditStatement } from "../auth/audit.js";
import { requireUnsafeRequestProtection } from "../auth/csrf.js";
import { AuthError } from "../auth/errors.js";
import { authJson } from "../auth/http.js";
import { requireAuth } from "../auth/middleware.js";
import { requireRole } from "../auth/permissions.js";
import { assertOnlyFields, readJsonObject, rejectOrganizationSelector } from "../auth/request.js";
import {
  createFilterTerm,
  deleteFilterTerm,
  getSessionFilterSettings,
  installFilterPack,
  listOrganizationFilter,
  updateFilterPolicies,
  updateFilterTerm,
  updateSessionFilterSettings
} from "../content-filter/repository.js";
import {
  FILTER_CATEGORIES,
  FILTER_CATEGORY_LABELS,
  FILTER_LANGUAGE_OPTIONS,
  requireAiRoutingMode,
  requireFilterBoolean,
  requireFilterCategory,
  requireFilterTermInput,
  requireMaskCharacter,
  requireUnsupportedLanguageMode,
  validatePolicyLevels
} from "../content-filter/validation.js";

export async function handleOrganizationContentFilterApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/org/content-filter")) return null;
  rejectOrganizationSelector(request);
  const auth = await requireAuth(request, env, { refresh: request.method === "GET" });
  requireRole(auth, ["owner", "admin"]);

  if (url.pathname === "/api/org/content-filter" && request.method === "GET") {
    const data = await listOrganizationFilter(env.DB_V2, auth.organizationId);
    return authJson({ ok: true, categories: categoryResponses(), languages: languageResponses(), ...data });
  }
  if (url.pathname === "/api/org/content-filter/terms" && request.method === "POST") {
    const input = await readJsonObject(request);
    rejectOrganizationSelector(request, input);
    assertOnlyFields(input, ["term", "category", "severity", "matchMode", "fuzzyEnabled", "languageCode", "boundaryMode"]);
    await requireUnsafeRequestProtection(request, env, auth);
    const normalized = requireFilterTermInput(input);
    const term = await createFilterTerm(env.DB_V2, {
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      ...normalized
    });
    await env.DB_V2.batch([auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "content_filter.term.created",
      targetType: "content_filter_term",
      targetId: term.id,
      details: { category: term.category, severity: term.severity, fuzzyEnabled: term.fuzzyEnabled }
    })]);
    return authJson({ ok: true, term }, 201);
  }
  if (url.pathname === "/api/org/content-filter/policies" && request.method === "PATCH") {
    requireRole(auth, "owner");
    const input = await readJsonObject(request);
    rejectOrganizationSelector(request, input);
    assertOnlyFields(input, ["policies"]);
    await requireUnsafeRequestProtection(request, env, auth);
    if (!Array.isArray(input.policies) || !input.policies.length || input.policies.length > FILTER_CATEGORIES.length) {
      throw new AuthError(400, "FILTER_POLICIES_INVALID");
    }
    const seen = new Set();
    const policies = input.policies.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuthError(400, "FILTER_POLICY_INVALID");
      assertOnlyFields(value, ["category", "enabled", "reviewMinSeverity", "maskMinSeverity", "rejectMinSeverity"]);
      const category = requireFilterCategory(value.category);
      if (seen.has(category)) throw new AuthError(400, "FILTER_POLICY_DUPLICATE");
      seen.add(category);
      return {
        category,
        enabled: requireFilterBoolean(value.enabled),
        ...validatePolicyLevels(value)
      };
    });
    const data = await updateFilterPolicies(env.DB_V2, {
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      policies
    });
    await env.DB_V2.batch([auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "content_filter.policies.updated",
      targetType: "organization",
      targetId: auth.organizationId,
      details: { categories: policies.map((policy) => policy.category) }
    })]);
    return authJson({ ok: true, categories: categoryResponses(), languages: languageResponses(), ...data });
  }

  const packMatch = url.pathname.match(/^\/api\/org\/content-filter\/packs\/([^/]+)\/install$/);
  if (packMatch && request.method === "POST") {
    requireRole(auth, "owner");
    await requireUnsafeRequestProtection(request, env, auth);
    const packId = decodeURIComponent(packMatch[1]);
    if (!/^[a-z0-9-]{3,80}$/.test(packId)) throw new AuthError(404, "FILTER_PACK_NOT_FOUND");
    const result = await installFilterPack(env.DB_V2, {
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      packId
    });
    await env.DB_V2.batch([auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "content_filter.pack.installed",
      targetType: "content_filter_pack",
      targetId: packId,
      details: { packId, version: result.pack?.version || null }
    })]);
    return authJson({ ok: true, ...result }, 201);
  }

  const termMatch = url.pathname.match(/^\/api\/org\/content-filter\/terms\/([^/]+)$/);
  if (termMatch) {
    const termId = decodeId(termMatch[1], "flt");
    if (request.method === "PATCH") {
      const input = await readJsonObject(request);
      rejectOrganizationSelector(request, input);
      assertOnlyFields(input, ["term", "category", "severity", "matchMode", "fuzzyEnabled", "languageCode", "boundaryMode", "active"]);
      await requireUnsafeRequestProtection(request, env, auth);
      const current = (await listOrganizationFilter(env.DB_V2, auth.organizationId)).terms.find((term) => term.id === termId);
      if (!current) throw new AuthError(404, "FILTER_TERM_NOT_FOUND");
      const normalized = requireFilterTermInput({
        term: Object.hasOwn(input, "term") ? input.term : current.term,
        category: Object.hasOwn(input, "category") ? input.category : current.category,
        severity: Object.hasOwn(input, "severity") ? input.severity : current.severity,
        matchMode: Object.hasOwn(input, "matchMode") ? input.matchMode : current.matchMode,
        fuzzyEnabled: Object.hasOwn(input, "fuzzyEnabled") ? input.fuzzyEnabled : current.fuzzyEnabled,
        languageCode: Object.hasOwn(input, "languageCode") ? input.languageCode : current.languageCode,
        boundaryMode: Object.hasOwn(input, "boundaryMode") ? input.boundaryMode : current.boundaryMode
      });
      const term = await updateFilterTerm(env.DB_V2, {
        id: termId,
        organizationId: auth.organizationId,
        active: Object.hasOwn(input, "active") ? requireFilterBoolean(input.active) : current.active,
        ...normalized
      });
      await env.DB_V2.batch([auditStatement(env.DB_V2, {
        organizationId: auth.organizationId,
        actorType: "user",
        actorUserId: auth.userId,
        actorRole: auth.role,
        action: "content_filter.term.updated",
        targetType: "content_filter_term",
        targetId: term.id,
        details: { category: term.category, severity: term.severity, fuzzyEnabled: term.fuzzyEnabled, active: term.active }
      })]);
      return authJson({ ok: true, term });
    }
    if (request.method === "DELETE") {
      await requireUnsafeRequestProtection(request, env, auth);
      const current = (await listOrganizationFilter(env.DB_V2, auth.organizationId)).terms.find((term) => term.id === termId);
      if (!current) throw new AuthError(404, "FILTER_TERM_NOT_FOUND");
      await deleteFilterTerm(env.DB_V2, auth.organizationId, termId);
      await env.DB_V2.batch([auditStatement(env.DB_V2, {
        organizationId: auth.organizationId,
        actorType: "user",
        actorUserId: auth.userId,
        actorRole: auth.role,
        action: "content_filter.term.deleted",
        targetType: "content_filter_term",
        targetId: termId,
        details: { category: current.category, severity: current.severity }
      })]);
      return new Response(null, { status: 204 });
    }
    throw methodNotAllowed("PATCH, DELETE");
  }

  throw new AuthError(404, "NOT_FOUND");
}

export async function getPrivateSessionFilterSettings(env, auth, session) {
  return authJson({
    ok: true,
    settings: await getSessionFilterSettings(env.DB_V2, auth.organizationId, session.id)
  });
}

export async function updatePrivateSessionFilterSettings(request, env, auth, session) {
  const input = await readJsonObject(request);
  rejectOrganizationSelector(request, input);
  assertOnlyFields(input, ["enabled", "aiRoutingMode", "maskCharacter", "translationFilterEnabled", "unsupportedLanguageMode"]);
  await requireUnsafeRequestProtection(request, env, auth);
  const current = await getSessionFilterSettings(env.DB_V2, auth.organizationId, session.id);
  const settings = await updateSessionFilterSettings(env.DB_V2, {
    organizationId: auth.organizationId,
    liveSessionId: session.id,
    actorUserId: auth.userId,
    enabled: Object.hasOwn(input, "enabled") ? requireFilterBoolean(input.enabled) : current.enabled,
    aiRoutingMode: Object.hasOwn(input, "aiRoutingMode") ? requireAiRoutingMode(input.aiRoutingMode) : current.aiRoutingMode,
    maskCharacter: Object.hasOwn(input, "maskCharacter") ? requireMaskCharacter(input.maskCharacter) : current.maskCharacter,
    translationFilterEnabled: Object.hasOwn(input, "translationFilterEnabled")
      ? requireFilterBoolean(input.translationFilterEnabled)
      : current.translationFilterEnabled,
    unsupportedLanguageMode: Object.hasOwn(input, "unsupportedLanguageMode")
      ? requireUnsupportedLanguageMode(input.unsupportedLanguageMode)
      : current.unsupportedLanguageMode
  });
  await env.DB_V2.batch([auditStatement(env.DB_V2, {
    organizationId: auth.organizationId,
    actorType: "user",
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: "session.content_filter.updated",
    targetType: "live_session",
    targetId: session.id,
    details: settings
  })]);
  return authJson({ ok: true, settings });
}

function categoryResponses() {
  return FILTER_CATEGORIES.map((id) => ({ id, label: FILTER_CATEGORY_LABELS[id] || id }));
}

function languageResponses() {
  return FILTER_LANGUAGE_OPTIONS.map(([id, label]) => ({ id, label }));
}

function decodeId(value, prefix) {
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { throw new AuthError(400, "INVALID_PATH_PARAMETER"); }
  if (!new RegExp(`^${prefix}_[a-z0-9]{20,80}$`).test(decoded)) throw new AuthError(404, "FILTER_TERM_NOT_FOUND");
  return decoded;
}

function methodNotAllowed(allow) {
  return new AuthError(405, "METHOD_NOT_ALLOWED", { headers: { allow } });
}
