import { AuthError } from "../auth/errors.js";
import { normalizeFilterTerm } from "./normalization.js";

export const FILTER_CATEGORIES = Object.freeze([
  "sexual", "profanity", "harassment", "discrimination", "violence",
  "political", "personal_info", "spam", "illegal", "custom"
]);

export const FILTER_CATEGORY_LABELS = Object.freeze({
  sexual: "下ネタ・性的表現",
  profanity: "暴言・下品な表現",
  harassment: "侮辱・嫌がらせ",
  discrimination: "差別的表現",
  violence: "暴力・脅迫",
  political: "政治的発言",
  personal_info: "個人情報",
  spam: "宣伝・スパム",
  illegal: "違法行為",
  custom: "独自分類"
});

export function requireFilterCategory(value) {
  const category = String(value || "").trim();
  if (!FILTER_CATEGORIES.includes(category)) throw new AuthError(400, "FILTER_CATEGORY_INVALID");
  return category;
}

export function requireFilterSeverity(value) {
  const severity = Number(value);
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) throw new AuthError(400, "FILTER_SEVERITY_INVALID");
  return severity;
}

export function requireOptionalSeverity(value, code = "FILTER_POLICY_LEVEL_INVALID") {
  if (value == null || value === "") return null;
  const severity = Number(value);
  if (!Number.isInteger(severity) || severity < 1 || severity > 5) throw new AuthError(400, code);
  return severity;
}

export function requireFilterBoolean(value, code = "FILTER_BOOLEAN_INVALID") {
  if (value !== true && value !== false) throw new AuthError(400, code);
  return value;
}

export const FILTER_LANGUAGE_OPTIONS = Object.freeze([
  ["und", "自動・指定なし"], ["ja", "日本語"], ["en", "英語"]
]);

export function requireFilterLanguageCode(value) {
  const code = String(value || "und").trim().toLowerCase();
  if (!new Set(["und", "ja", "en"]).has(code)) throw new AuthError(400, "FILTER_LANGUAGE_INVALID");
  return code;
}

export function requireUnsupportedLanguageMode(value) {
  const mode = String(value || "").trim();
  if (!new Set(["ai_review", "review_only", "allow"]).has(mode)) {
    throw new AuthError(400, "FILTER_UNSUPPORTED_LANGUAGE_MODE_INVALID");
  }
  return mode;
}

export function requireBoundaryMode(value) {
  const mode = String(value || "auto");
  if (!new Set(["auto", "word", "substring"]).has(mode)) throw new AuthError(400, "FILTER_BOUNDARY_MODE_INVALID");
  return mode;
}

export function requireFilterTermInput(input) {
  const normalized = normalizeFilterTerm(input?.term);
  if (!normalized) throw new AuthError(400, "FILTER_TERM_INVALID");
  return {
    ...normalized,
    category: requireFilterCategory(input?.category),
    severity: requireFilterSeverity(input?.severity),
    matchMode: input?.matchMode == null ? "normalized" : requireMatchMode(input.matchMode),
    languageCode: requireFilterLanguageCode(input?.languageCode),
    boundaryMode: requireBoundaryMode(input?.boundaryMode),
    fuzzyEnabled: input?.fuzzyEnabled == null ? true : requireFilterBoolean(input.fuzzyEnabled, "FILTER_FUZZY_INVALID")
  };
}

export function requireMatchMode(value) {
  const mode = String(value || "");
  if (!new Set(["strict", "normalized"]).has(mode)) throw new AuthError(400, "FILTER_MATCH_MODE_INVALID");
  return mode;
}

export function requireAiRoutingMode(value) {
  const mode = String(value || "");
  if (!new Set(["off", "ambiguous", "all"]).has(mode)) throw new AuthError(400, "FILTER_AI_ROUTING_INVALID");
  return mode;
}

export function requireMaskCharacter(value) {
  const chars = Array.from(String(value ?? "").normalize("NFKC"));
  if (chars.length !== 1 || /\s/u.test(chars[0])) throw new AuthError(400, "FILTER_MASK_CHARACTER_INVALID");
  return chars[0];
}

export function validatePolicyLevels(input) {
  const review = requireOptionalSeverity(input?.reviewMinSeverity);
  const mask = requireOptionalSeverity(input?.maskMinSeverity);
  const reject = requireOptionalSeverity(input?.rejectMinSeverity);
  if (review != null && mask != null && mask < review) throw new AuthError(400, "FILTER_POLICY_ORDER_INVALID");
  if (mask != null && reject != null && reject < mask) throw new AuthError(400, "FILTER_POLICY_ORDER_INVALID");
  return { reviewMinSeverity: review, maskMinSeverity: mask, rejectMinSeverity: reject };
}
