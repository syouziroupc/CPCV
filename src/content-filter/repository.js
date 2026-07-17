import { AuthError } from "../auth/errors.js";
import { makeId } from "../auth/request.js";
import { detectCommentLanguage, isSupportedFilterLanguage } from "./language.js";
import { evaluateFilterMessage } from "./matcher.js";
import { normalizeFilterTerm } from "./normalization.js";
import { BUILT_IN_FILTER_PACKS, getBuiltInFilterPack } from "./packs.js";
import { FILTER_CATEGORIES } from "./validation.js";

const TERM_LIMIT = 2000;

export async function evaluateCommentFilter(db, input) {
  const context = await getFilterContext(db, input.organizationId, input.liveSessionId);
  const language = detectCommentLanguage(input.message);
  const decision = evaluateFilterMessage(input.message, context);
  const matchedLanguage = inferMatchedLanguage(decision.matches, context.terms);
  const effectiveLanguage = matchedLanguage || language.code;
  const supported = matchedLanguage ? isSupportedFilterLanguage(matchedLanguage) : language.supported;
  const unsupported = context.settings.enabled && !supported && effectiveLanguage !== "neutral";
  const requiresReview = unsupported && context.settings.unsupportedLanguageMode !== "allow";
  const aiForUnsupported = unsupported && context.settings.unsupportedLanguageMode === "ai_review";
  const action = requiresReview && decision.action === "allow" ? "review" : decision.action;
  return {
    ...decision,
    action,
    aiRequired: Boolean(decision.aiRequired || aiForUnsupported),
    requiresReview: Boolean(decision.action === "review" || requiresReview),
    detectedLanguage: effectiveLanguage === "neutral" ? "und" : effectiveLanguage,
    languageConfidenceMilli: matchedLanguage ? 1000 : language.confidenceMilli,
    languageReason: matchedLanguage ? "dictionary_match" : language.reason,
    unsupportedLanguage: unsupported
  };
}

export async function evaluateTranslationFilter(db, input) {
  const context = await getFilterContext(db, input.organizationId, input.liveSessionId, {
    languageCodes: [input.targetLanguage, "und"]
  });
  if (!context.settings.translationFilterEnabled) {
    return {
      enabled: false,
      action: "allow",
      displayMessage: null,
      aiRequired: false,
      ambiguous: false,
      requiresReview: false,
      version: 0,
      matches: []
    };
  }
  const decision = evaluateFilterMessage(input.translatedText, context);
  return {
    ...decision,
    requiresReview: decision.action === "review"
  };
}

export async function getFilterContext(db, organizationId, liveSessionId, options = {}) {
  const settingsRow = await db.prepare(
    `SELECT enabled, ai_routing_mode, mask_character,
            COALESCE(translation_filter_enabled, 1) AS translation_filter_enabled,
            COALESCE(unsupported_language_mode, 'ai_review') AS unsupported_language_mode,
            updated_at
     FROM session_content_filter_settings
     WHERE organization_id = ?1 AND live_session_id = ?2 LIMIT 1`
  ).bind(organizationId, liveSessionId).first();
  const policiesResult = await db.prepare(
    `SELECT category, enabled, review_min_severity, mask_min_severity, reject_min_severity
     FROM organization_content_filter_policies
     WHERE organization_id = ?1 ORDER BY category ASC`
  ).bind(organizationId).all();
  const languageCodes = Array.isArray(options.languageCodes)
    ? [...new Set(options.languageCodes.map((value) => String(value || "").trim()).filter(Boolean))]
    : [];
  let termsSql = `SELECT id, term, normalized_term, compact_term, category, severity,
            match_mode, fuzzy_enabled, language_code, boundary_mode, active,
            source_pack, source_pack_version, source_pack_term_key, created_at, updated_at
     FROM content_filter_terms
     WHERE organization_id = ?1 AND active = 1 AND deleted_at IS NULL`;
  const bindings = [organizationId];
  if (languageCodes.length) {
    const placeholders = languageCodes.map((_, index) => `?${index + 2}`).join(", ");
    termsSql += ` AND language_code IN (${placeholders})`;
    bindings.push(...languageCodes);
  }
  termsSql += ` ORDER BY severity DESC, category ASC, id ASC LIMIT ${TERM_LIMIT + 1}`;
  const termsResult = await db.prepare(termsSql).bind(...bindings).all();
  const terms = rowsOf(termsResult);
  if (terms.length > TERM_LIMIT) throw new AuthError(409, "FILTER_TERM_LIMIT_REACHED");
  return {
    settings: settingsRow ? sessionSettingsResponse(settingsRow) : {
      enabled: false,
      aiRoutingMode: "ambiguous",
      maskCharacter: "＊",
      translationFilterEnabled: true,
      unsupportedLanguageMode: "ai_review"
    },
    policies: rowsOf(policiesResult).map(policyResponse),
    terms: terms.map(termResponse),
    version: Date.parse(settingsRow?.updated_at || "") || 1
  };
}

export async function listOrganizationFilter(db, organizationId) {
  const policies = rowsOf(await db.prepare(
    `SELECT category, enabled, review_min_severity, mask_min_severity, reject_min_severity,
            updated_by_user_id, created_at, updated_at
     FROM organization_content_filter_policies
     WHERE organization_id = ?1 ORDER BY category ASC`
  ).bind(organizationId).all()).map(policyResponse);
  const terms = rowsOf(await db.prepare(
    `SELECT id, term, normalized_term, compact_term, category, severity,
            match_mode, fuzzy_enabled, language_code, boundary_mode, active,
            source_pack, source_pack_version, source_pack_term_key,
            created_by_user_id, created_at, updated_at
     FROM content_filter_terms
     WHERE organization_id = ?1 AND deleted_at IS NULL
     ORDER BY category ASC, severity DESC, term ASC, id ASC LIMIT ${TERM_LIMIT + 1}`
  ).bind(organizationId).all()).map(termResponse);
  if (terms.length > TERM_LIMIT) throw new AuthError(409, "FILTER_TERM_LIMIT_REACHED");
  return { policies, terms, termLimit: TERM_LIMIT, packs: await listFilterPacks(db, organizationId) };
}

export async function listFilterPacks(db, organizationId) {
  const installed = new Map(rowsOf(await db.prepare(
    `SELECT pack_id, pack_version, installed_by_user_id, installed_at, updated_at
     FROM content_filter_pack_installs WHERE organization_id = ?1 ORDER BY pack_id`
  ).bind(organizationId).all()).map((row) => [row.pack_id, row]));
  return BUILT_IN_FILTER_PACKS.map((pack) => {
    const row = installed.get(pack.id);
    return {
      id: pack.id,
      version: pack.version,
      languageCode: pack.languageCode,
      name: pack.name,
      description: pack.description,
      termCount: pack.terms.length,
      installed: Boolean(row),
      installedVersion: row ? Number(row.pack_version) : null,
      installedAt: row?.installed_at || null,
      updatedAt: row?.updated_at || null
    };
  });
}

export async function installFilterPack(db, input) {
  const pack = getBuiltInFilterPack(input.packId);
  if (!pack) throw new AuthError(404, "FILTER_PACK_NOT_FOUND");
  const existingPackRows = rowsOf(await db.prepare(
    `SELECT source_pack_term_key, deleted_at
     FROM content_filter_terms
     WHERE organization_id = ?1 AND source_pack = ?2`
  ).bind(input.organizationId, pack.id).all());
  const existingByKey = new Map(existingPackRows.map((row) => [row.source_pack_term_key, row]));
  const count = Number(await db.prepare(
    `SELECT COUNT(*) AS count FROM content_filter_terms
     WHERE organization_id = ?1 AND deleted_at IS NULL`
  ).bind(input.organizationId).first("count") || 0);
  const newTermCount = pack.terms.filter((value) => !existingByKey.has(value.key)).length;
  if (count + newTermCount > TERM_LIMIT) throw new AuthError(409, "FILTER_TERM_LIMIT_REACHED");
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const statements = [];
  for (const value of pack.terms) {
    const existing = existingByKey.get(value.key);
    // A user deletion is intentional. Reinstalling or upgrading the pack must not resurrect it.
    if (existing?.deleted_at) continue;
    const normalized = normalizeFilterTerm(value.term);
    if (!normalized) continue;
    statements.push(db.prepare(
      `INSERT INTO content_filter_terms (
         id, organization_id, term, normalized_term, compact_term, category,
         severity, match_mode, fuzzy_enabled, language_code, boundary_mode, active,
         created_by_user_id, created_at, updated_at, deleted_at,
         source_pack, source_pack_version, source_pack_term_key
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1,
                 ?12, ?13, ?13, NULL, ?14, ?15, ?16)
       ON CONFLICT DO UPDATE SET
         term = excluded.term,
         normalized_term = excluded.normalized_term,
         compact_term = excluded.compact_term,
         category = excluded.category,
         severity = excluded.severity,
         match_mode = excluded.match_mode,
         fuzzy_enabled = excluded.fuzzy_enabled,
         language_code = excluded.language_code,
         boundary_mode = excluded.boundary_mode,
         source_pack_version = excluded.source_pack_version,
         updated_at = excluded.updated_at
       WHERE content_filter_terms.source_pack = excluded.source_pack
         AND content_filter_terms.source_pack_term_key = excluded.source_pack_term_key
         AND content_filter_terms.deleted_at IS NULL`
    ).bind(
      makeId("flt"), input.organizationId, normalized.term, normalized.normalizedTerm,
      normalized.compactTerm, value.category, value.severity, value.matchMode,
      value.fuzzyEnabled ? 1 : 0, value.languageCode, value.boundaryMode,
      input.actorUserId, nowIso, pack.id, pack.version, value.key
    ));
  }
  statements.push(db.prepare(
    `INSERT INTO content_filter_pack_installs (
       organization_id, pack_id, pack_version, installed_by_user_id,
       installed_at, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(organization_id, pack_id) DO UPDATE SET
       pack_version = excluded.pack_version,
       installed_by_user_id = excluded.installed_by_user_id,
       updated_at = excluded.updated_at`
  ).bind(input.organizationId, pack.id, pack.version, input.actorUserId, nowIso));
  await db.batch(statements);
  return {
    pack: (await listFilterPacks(db, input.organizationId)).find((item) => item.id === pack.id),
    organizationFilter: await listOrganizationFilter(db, input.organizationId)
  };
}

export async function createFilterTerm(db, input) {
  const count = await db.prepare(
    `SELECT COUNT(*) AS count FROM content_filter_terms
     WHERE organization_id = ?1 AND deleted_at IS NULL`
  ).bind(input.organizationId).first("count");
  if (Number(count || 0) >= TERM_LIMIT) throw new AuthError(409, "FILTER_TERM_LIMIT_REACHED");
  const id = makeId("flt");
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  try {
    await db.prepare(
      `INSERT INTO content_filter_terms (
         id, organization_id, term, normalized_term, compact_term, category,
         severity, match_mode, fuzzy_enabled, language_code, boundary_mode, active, created_by_user_id,
         created_at, updated_at, deleted_at, source_pack, source_pack_version, source_pack_term_key
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?13, ?13, NULL, NULL, NULL, NULL)`
    ).bind(
      id, input.organizationId, input.term, input.normalizedTerm, input.compactTerm,
      input.category, input.severity, input.matchMode, input.fuzzyEnabled ? 1 : 0,
      input.languageCode, input.boundaryMode, input.actorUserId, nowIso
    ).run();
  } catch (error) {
    if (/UNIQUE constraint failed.*content_filter_terms/i.test(String(error?.message || error))) {
      throw new AuthError(409, "FILTER_TERM_ALREADY_EXISTS");
    }
    throw error;
  }
  return getFilterTerm(db, input.organizationId, id);
}

export async function updateFilterTerm(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  try {
    const result = await db.prepare(
      `UPDATE content_filter_terms
       SET term = ?1, normalized_term = ?2, compact_term = ?3, category = ?4,
           severity = ?5, match_mode = ?6, fuzzy_enabled = ?7, language_code = ?8,
           boundary_mode = ?9, active = ?10, updated_at = ?11,
           source_pack = NULL, source_pack_version = NULL, source_pack_term_key = NULL
       WHERE id = ?12 AND organization_id = ?13 AND deleted_at IS NULL`
    ).bind(
      input.term, input.normalizedTerm, input.compactTerm, input.category,
      input.severity, input.matchMode, input.fuzzyEnabled ? 1 : 0, input.languageCode,
      input.boundaryMode, input.active ? 1 : 0, nowIso, input.id, input.organizationId
    ).run();
    if (changesOf(result) !== 1) throw new AuthError(404, "FILTER_TERM_NOT_FOUND");
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (/UNIQUE constraint failed.*content_filter_terms/i.test(String(error?.message || error))) {
      throw new AuthError(409, "FILTER_TERM_ALREADY_EXISTS");
    }
    throw error;
  }
  return getFilterTerm(db, input.organizationId, input.id);
}

export async function deleteFilterTerm(db, organizationId, id, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const result = await db.prepare(
    `UPDATE content_filter_terms SET active = 0, deleted_at = ?1, updated_at = ?1
     WHERE id = ?2 AND organization_id = ?3 AND deleted_at IS NULL`
  ).bind(nowIso, id, organizationId).run();
  if (changesOf(result) !== 1) throw new AuthError(404, "FILTER_TERM_NOT_FOUND");
}

export async function updateFilterPolicies(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const statements = input.policies.map((policy) => db.prepare(
    `UPDATE organization_content_filter_policies
     SET enabled = ?1, review_min_severity = ?2, mask_min_severity = ?3,
         reject_min_severity = ?4, updated_by_user_id = ?5, updated_at = ?6
     WHERE organization_id = ?7 AND category = ?8`
  ).bind(
    policy.enabled ? 1 : 0, policy.reviewMinSeverity, policy.maskMinSeverity,
    policy.rejectMinSeverity, input.actorUserId, nowIso,
    input.organizationId, policy.category
  ));
  await db.batch(statements);
  return listOrganizationFilter(db, input.organizationId);
}

export async function getSessionFilterSettings(db, organizationId, liveSessionId) {
  const row = await db.prepare(
    `SELECT enabled, ai_routing_mode, mask_character,
            COALESCE(translation_filter_enabled, 1) AS translation_filter_enabled,
            COALESCE(unsupported_language_mode, 'ai_review') AS unsupported_language_mode,
            updated_by_user_id, created_at, updated_at
     FROM session_content_filter_settings
     WHERE organization_id = ?1 AND live_session_id = ?2 LIMIT 1`
  ).bind(organizationId, liveSessionId).first();
  if (!row) throw new AuthError(404, "SESSION_NOT_FOUND");
  return sessionSettingsResponse(row);
}

export async function updateSessionFilterSettings(db, input) {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const result = await db.prepare(
    `UPDATE session_content_filter_settings
     SET enabled = ?1, ai_routing_mode = ?2, mask_character = ?3,
         translation_filter_enabled = ?4, unsupported_language_mode = ?5,
         updated_by_user_id = ?6, updated_at = ?7
     WHERE organization_id = ?8 AND live_session_id = ?9`
  ).bind(
    input.enabled ? 1 : 0, input.aiRoutingMode, input.maskCharacter,
    input.translationFilterEnabled === false ? 0 : 1, input.unsupportedLanguageMode || "ai_review",
    input.actorUserId, nowIso, input.organizationId, input.liveSessionId
  ).run();
  if (changesOf(result) !== 1) throw new AuthError(404, "SESSION_NOT_FOUND");
  return getSessionFilterSettings(db, input.organizationId, input.liveSessionId);
}

export function filterMatchStatements(db, commentId, organizationId, liveSessionId, decision, createdAt) {
  return (decision?.matches || []).map((match) => db.prepare(
    `INSERT INTO comment_filter_matches (
       id, organization_id, live_session_id, comment_id, term_id,
       category, severity, match_kind, confidence_milli, obfuscation_score,
       span_start, span_end, created_at
     ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
       FROM comments WHERE id = ?4 AND organization_id = ?2 AND live_session_id = ?3`
  ).bind(
    makeId("flm"), organizationId, liveSessionId, commentId, match.termId,
    match.category, match.severity, match.matchKind, match.confidenceMilli,
    match.obfuscationScore, match.spanStart, match.spanEnd, createdAt
  ));
}

export async function listCommentFilterMatches(db, commentId) {
  return rowsOf(await db.prepare(
    `SELECT term_id, category, severity, match_kind, confidence_milli,
            obfuscation_score, span_start, span_end, created_at
     FROM comment_filter_matches WHERE comment_id = ?1
     ORDER BY severity DESC, confidence_milli DESC, id ASC`
  ).bind(commentId).all()).map((row) => ({
    termId: row.term_id || null,
    category: row.category,
    severity: Number(row.severity),
    matchKind: row.match_kind,
    confidence: Number(row.confidence_milli) / 1000,
    obfuscationScore: Number(row.obfuscation_score),
    spanStart: Number(row.span_start),
    spanEnd: Number(row.span_end),
    createdAt: row.created_at
  }));
}

async function getFilterTerm(db, organizationId, id) {
  const row = await db.prepare(
    `SELECT id, term, normalized_term, compact_term, category, severity,
            match_mode, fuzzy_enabled, language_code, boundary_mode, active,
            source_pack, source_pack_version, source_pack_term_key,
            created_by_user_id, created_at, updated_at
     FROM content_filter_terms
     WHERE organization_id = ?1 AND id = ?2 AND deleted_at IS NULL LIMIT 1`
  ).bind(organizationId, id).first();
  if (!row) throw new AuthError(404, "FILTER_TERM_NOT_FOUND");
  return termResponse(row);
}

function inferMatchedLanguage(matches, terms) {
  if (!Array.isArray(matches) || !matches.length) return null;
  const byId = new Map((terms || []).map((term) => [term.id, term]));
  const languages = matches
    .filter((match) => match.confidenceMilli >= 900)
    .map((match) => byId.get(match.termId)?.languageCode)
    .filter((value) => value === "ja" || value === "en");
  return languages.length ? languages[0] : null;
}

function termResponse(row) {
  return {
    id: row.id,
    term: row.term,
    normalizedTerm: row.normalized_term,
    compactTerm: row.compact_term,
    category: row.category,
    severity: Number(row.severity),
    matchMode: row.match_mode,
    languageCode: row.language_code || "und",
    boundaryMode: row.boundary_mode || "auto",
    fuzzyEnabled: Boolean(row.fuzzy_enabled),
    active: Boolean(row.active),
    sourcePack: row.source_pack || null,
    sourcePackVersion: row.source_pack_version == null ? null : Number(row.source_pack_version),
    sourcePackTermKey: row.source_pack_term_key || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function policyResponse(row) {
  return {
    category: row.category,
    enabled: Boolean(row.enabled),
    reviewMinSeverity: nullableNumber(row.review_min_severity),
    maskMinSeverity: nullableNumber(row.mask_min_severity),
    rejectMinSeverity: nullableNumber(row.reject_min_severity),
    updatedByUserId: row.updated_by_user_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function sessionSettingsResponse(row) {
  return {
    enabled: Boolean(row.enabled),
    aiRoutingMode: row.ai_routing_mode || "ambiguous",
    maskCharacter: row.mask_character || "＊",
    translationFilterEnabled: row.translation_filter_enabled == null ? true : Boolean(row.translation_filter_enabled),
    unsupportedLanguageMode: row.unsupported_language_mode || "ai_review",
    updatedByUserId: row.updated_by_user_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function rowsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}
function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}
function nullableNumber(value) {
  return value == null ? null : Number(value);
}

export { FILTER_CATEGORIES };
