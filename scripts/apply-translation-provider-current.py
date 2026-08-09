from pathlib import Path

p = Path("src/ai/provider.js")
text = p.read_text()


def replace_once(old, new):
    global text
    if old not in text:
        raise SystemExit(f"provider.js expected text missing: {old[:120]!r}")
    text = text.replace(old, new, 1)


replace_once(
    'import { normalizeTranslationResult } from "./validation.js";\n'
    'export { runModerationModel } from "./provider-base.js";\n',
    'import { normalizeTranslationResult } from "./validation.js";\n'
    'import { detectCommentLanguage } from "../content-filter/language.js";\n'
    'export { runModerationModel } from "./provider-base.js";\n'
)
replace_once(
    'const PROMPT_VERSION = "translation-v5-current-model-runtime";\n',
    'const PROMPT_VERSION = "translation-v6-language-safe";\n'
)
replace_once(
    'const SUPPORTED_LANGUAGES = new Set(M2M_LANGUAGES);\n'
    'const SHARED_TEXT_GENERATION_KEY = "workers-ai-moderation";\n',
    'const SUPPORTED_LANGUAGES = new Set(M2M_LANGUAGES);\n'
    'const TRUSTED_SOURCE_CONFIDENCE_MILLI = 900;\n'
    'const HIGH_RISK_TRANSLATION_SOURCES = new Set(["az", "tr"]);\n'
    'const CASUAL_ENGLISH_PATTERN = /\\b(?:ain[’\']?t|gonna|gotta|wanna|y[’\']?all|idk|imo|imho|ngl|tbh|btw|rn|lol|lmao|wtf|bro|dude|lowkey|highkey|kinda|sorta|cuz|bc|pls|plz|thx|yep|yeah|nah)\\b/iu;\n'
    'const SHARED_TEXT_GENERATION_KEY = "workers-ai-moderation";\n'
)
replace_once(
    '''  const sourceLanguage = normalizeLanguage(input?.sourceLanguage);
  if (sourceLanguage && sourceLanguage === targetLanguage) {
    throw codedError("AI_TRANSLATION_LANGUAGE_INVALID", false);
  }
  const quality = normalizeQuality(input?.quality);
  const candidates = translationCandidates(env, quality, sourceLanguage);
''',
    '''  const rawSourceLanguage = normalizeLanguage(input?.sourceLanguage);
  const sourceLanguageConfidenceMilli = normalizeSourceLanguageConfidence(
    input?.sourceLanguageConfidenceMilli,
    rawSourceLanguage
  );
  const sourceLanguage = rawSourceLanguage
    && sourceLanguageConfidenceMilli >= TRUSTED_SOURCE_CONFIDENCE_MILLI
    ? rawSourceLanguage
    : "";
  if (sourceLanguage && sourceLanguage === targetLanguage) {
    throw codedError("AI_TRANSLATION_LANGUAGE_INVALID", false);
  }
  const requestedQuality = normalizeQuality(input?.quality);
  const effectiveQuality = effectiveTranslationQuality(
    requestedQuality,
    input?.message,
    rawSourceLanguage,
    sourceLanguageConfidenceMilli
  );
  const candidates = translationCandidates(env, effectiveQuality, sourceLanguage);
'''
)
replace_once(
    '''        candidateTimeoutMs(env, quality, candidate.kind)
      );
      const translatedText = extractTranslationText(response);
      const normalized = normalizeTranslationResult({ translation: translatedText });
      return {
        ...normalized,
        provider: "workers_ai",
        model: candidate.model,
        promptVersion: `${PROMPT_VERSION}-${quality}-${candidate.kind}`,
        rawOutputLength: structuredLength(response),
        usageEventId,
        quality
      };
''',
    '''        candidateTimeoutMs(env, effectiveQuality, candidate.kind)
      );
      const translatedText = extractTranslationText(response);
      const normalized = normalizeTranslationResult({ translation: translatedText });
      validateTranslationOutput(
        String(input?.message || ""),
        normalized.translatedText,
        sourceLanguage,
        targetLanguage
      );
      return {
        ...normalized,
        provider: "workers_ai",
        model: candidate.model,
        promptVersion: `${PROMPT_VERSION}-${requestedQuality}-${effectiveQuality}-${candidate.kind}`,
        rawOutputLength: structuredLength(response),
        usageEventId,
        quality: requestedQuality,
        effectiveQuality
      };
'''
)
replace_once(
    '''  const ordered = quality === "accurate"
    ? [accurate, balanced, fastCandidate]
    : quality === "fast"
      ? [fastCandidate, balanced, accurate]
      : [fastCandidate, balanced, accurate];
''',
    '''  const ordered = quality === "accurate"
    ? [accurate, balanced, fastCandidate]
    : quality === "fast"
      ? [fastCandidate, balanced, accurate]
      : [balanced, accurate, fastCandidate];
'''
)
replace_once(
    '''    "Detect the source language when it is not supplied.",
    "Preserve meaning, tone, names, slang, punctuation, and uncertainty.",
    "Do not guess unrelated words. Do not add commentary.",
''',
    '''    "Detect the source language from the full comment when it is not supplied.",
    "Treat Azerbaijani and Turkish as distinct languages; never infer one only from letters they share.",
    "Preserve meaning, tone, names, slang, abbreviations, punctuation, negation, and uncertainty.",
    "Translate idioms and casual speech by meaning rather than word-by-word; if an abbreviation is ambiguous, preserve that ambiguity instead of inventing a meaning.",
    "Do not guess unrelated words. Do not add commentary.",
'''
)
replace_once(
    '''function candidateTimeoutMs(env, quality, kind) {
''',
    r'''function normalizeSourceLanguageConfidence(value, sourceLanguage) {
  if (value == null || value === "") return sourceLanguage ? 1000 : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1000, Math.round(parsed)));
}

function effectiveTranslationQuality(quality, message, sourceLanguage, sourceLanguageConfidenceMilli) {
  if (!sourceLanguage || sourceLanguageConfidenceMilli < TRUSTED_SOURCE_CONFIDENCE_MILLI) return "accurate";
  if (HIGH_RISK_TRANSLATION_SOURCES.has(sourceLanguage)) return "accurate";
  if (sourceLanguage === "en" && CASUAL_ENGLISH_PATTERN.test(String(message || ""))) return "accurate";
  return quality;
}

function validateTranslationOutput(sourceText, translatedText, sourceLanguage, targetLanguage) {
  const source = String(sourceText || "").trim();
  const translated = String(translatedText || "").trim();
  const sourceLetters = Array.from(source).filter((char) => /\p{L}/u.test(char)).length;
  if (sourceLanguage
      && sourceLanguage !== targetLanguage
      && sourceLetters >= 4
      && comparableTranslationText(source) === comparableTranslationText(translated)) {
    throw codedError("AI_RESPONSE_INVALID", false);
  }

  const locallyCheckableTargets = new Set(["az", "en", "ja", "ru", "tr"]);
  if (!locallyCheckableTargets.has(targetLanguage)) return;
  const outputLanguage = detectCommentLanguage(translated);
  const words = translated.match(/\p{L}+(?:['’]\p{L}+)?/gu) || [];
  if (words.length >= 3
      && locallyCheckableTargets.has(outputLanguage.code)
      && outputLanguage.code !== targetLanguage
      && outputLanguage.confidenceMilli >= 900) {
    throw codedError("AI_RESPONSE_INVALID", false);
  }
}

function comparableTranslationText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\p{Z}]/gu, "");
}

function candidateTimeoutMs(env, quality, kind) {
'''
)

p.write_text(text)
