import { AuthError } from "../auth/errors.js";

export const AI_TARGET_LANGUAGES = Object.freeze(["ja", "en"]);
export const AI_JOB_TYPES = Object.freeze(["moderation", "translation"]);
export const AI_RECOMMENDATIONS = Object.freeze(["allow", "review", "hide"]);
export const AI_CATEGORIES = Object.freeze([
  "harassment", "hate", "sexual", "violence", "self_harm",
  "spam", "personal_data", "prompt_injection", "other"
]);

export function normalizeAiTargetLanguage(value) {
  const text = String(value ?? "").trim();
  return AI_TARGET_LANGUAGES.includes(text) ? text : "";
}

export function requireAiTargetLanguage(value) {
  const language = normalizeAiTargetLanguage(value);
  if (!language) throw new AuthError(400, "AI_TARGET_LANGUAGE_INVALID");
  return language;
}

export function requireAiBoolean(value, code) {
  if (typeof value !== "boolean") throw new AuthError(400, code);
  return value;
}

export function requireAiDailyLimit(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100000) {
    throw new AuthError(400, code);
  }
  return number;
}

export function normalizeAiJobTypes(value) {
  const items = Array.isArray(value) ? value : value == null ? AI_JOB_TYPES : [];
  const normalized = [...new Set(items.map((item) => String(item || "").trim()))];
  if (!normalized.length || normalized.some((item) => !AI_JOB_TYPES.includes(item))) {
    throw new AuthError(400, "AI_JOB_TYPE_INVALID");
  }
  return normalized;
}

export function normalizeModerationResult(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("AI_RESPONSE_INVALID");
  }
  const recommendation = String(input.recommendation || "").trim();
  if (!AI_RECOMMENDATIONS.includes(recommendation)) throw new Error("AI_RESPONSE_INVALID");
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("AI_RESPONSE_INVALID");
  const categories = Array.isArray(input.categories)
    ? [...new Set(input.categories.map((item) => String(item || "").trim()))]
    : [];
  if (categories.some((item) => !AI_CATEGORIES.includes(item))) throw new Error("AI_RESPONSE_INVALID");
  return {
    recommendation,
    confidenceMilli: Math.round(confidence * 1000),
    categories
  };
}

export function normalizeTranslationResult(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("AI_RESPONSE_INVALID");
  const translatedText = String(input.translation || "").trim();
  const length = Array.from(translatedText).length;
  if (length < 1 || length > 2000) throw new Error("AI_RESPONSE_INVALID");
  return { translatedText };
}
