import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

function replaceOnce(path, oldText, newText) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(oldText);
  const second = first < 0 ? -1 : source.indexOf(oldText, first + oldText.length);
  if (first < 0 || second >= 0) throw new Error(`${path}: expected exactly one match`);
  writeFileSync(path, source.slice(0, first) + newText + source.slice(first + oldText.length), "utf8");
}

replaceOnce(
  "src/content-filter/language.js",
  `const OTHER_LETTER_SCRIPTS = /[\\p{L}&&[^\\p{Script=Latin}\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}]]/v;\nconst LETTER_OR_MARK = /[\\p{L}\\p{M}]/u;`,
  `const CYRILLIC = /\\p{Script=Cyrillic}/u;\nconst TURKISH_DISTINCTIVE = /[çğıöşüÇĞİÖŞÜ]/u;\nconst OTHER_LETTER_SCRIPTS = /[\\p{L}&&[^\\p{Script=Latin}\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}]]/v;\nconst LETTER_OR_MARK = /[\\p{L}\\p{M}]/u;`
);

replaceOnce(
  "src/content-filter/language.js",
  `const JAPANESE_HAN_ONLY = new Set(\`賛成 反対 同意 質問 回答 先生 学生 日本 社会 政治 政府批判 経済 環境 授業 課題 意見 原因 結果 問題 改善 必要 不要 可能 不可能 良い 悪い 重要 理由\`.split(/\\s+/));`,
  `const JAPANESE_HAN_ONLY = new Set(\`賛成 反対 同意 質問 回答 先生 学生 日本 社会 政治 政府批判 経済 環境 授業 課題 意見 原因 結果 問題 改善 必要 不要 可能 不可能 良い 悪い 重要 理由\`.split(/\\s+/));\nconst TURKISH_COMMON = new Set(\`bir bu çok da de değil için ile iyi mi ne neden nasıl o olarak ama ben biz siz onlar var yok evet hayır teşekkür merhaba ders öğrenci öğretmen katılıyorum\`.split(/\\s+/));`
);

replaceOnce(
  "src/content-filter/language.js",
  `  if (JAPANESE_KANA.test(text)) return decision('ja', 1000, true, 'kana');\n  if (OTHER_LETTER_SCRIPTS.test(text)) return decision('other', 980, false, 'unsupported_script');`,
  `  if (JAPANESE_KANA.test(text)) return decision('ja', 1000, true, 'kana');\n  if (CYRILLIC.test(text)) return decision('ru', 980, false, 'cyrillic');\n  if (TURKISH_DISTINCTIVE.test(text)) return decision('tr', 930, false, 'turkish_distinctive');\n  if (OTHER_LETTER_SCRIPTS.test(text)) return decision('other', 980, false, 'unsupported_script');`
);

replaceOnce(
  "src/content-filter/language.js",
  `    const common = tokens.filter((token) => ENGLISH_COMMON.has(token)).length;`,
  `    const turkish = tokens.filter((token) => TURKISH_COMMON.has(token)).length;\n    if (turkish >= 2 || (turkish >= 1 && tokens.length <= 2)) {\n      return decision('tr', Math.round(720 + Math.min(220, (turkish / tokens.length) * 260)), false, 'turkish_words');\n    }\n    const common = tokens.filter((token) => ENGLISH_COMMON.has(token)).length;`
);

replaceOnce(
  "src/content-filter/repository.js",
  `  const requiresReview = unsupported && context.settings.unsupportedLanguageMode !== "allow";\n  const aiForUnsupported = unsupported && context.settings.unsupportedLanguageMode === "ai_review";`,
  `  // ai_review means asynchronous AI inspection, not pre-publication blocking.\n  // Only the explicit review mode places an otherwise clean comment in pending.\n  const requiresReview = unsupported && context.settings.unsupportedLanguageMode === "review";\n  const aiForUnsupported = unsupported && context.settings.unsupportedLanguageMode === "ai_review";`
);

replaceOnce(
  "src/ai/provider.js",
  `function normalizeTranslationLanguage(value) {\n  const language = String(value || "").trim().toLowerCase();\n  return language === "ja" || language === "en" ? language : "";\n}`,
  `const SUPPORTED_TRANSLATION_LANGUAGES = new Set(["ja", "en", "ru", "tr"]);\n\nfunction normalizeTranslationLanguage(value) {\n  const language = String(value || "").trim().toLowerCase();\n  return SUPPORTED_TRANSLATION_LANGUAGES.has(language) ? language : "";\n}`
);

writeFileSync("scripts/test-multilingual-routing.mjs", `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport { detectCommentLanguage } from "../src/content-filter/language.js";\n\nconst russian = detectCommentLanguage("Это очень хороший вопрос");\nassert.equal(russian.code, "ru");\nassert.equal(russian.supported, false);\n\nconst turkishDistinctive = detectCommentLanguage("Bu çok iyi bir soru");\nassert.equal(turkishDistinctive.code, "tr");\nassert.equal(turkishDistinctive.supported, false);\n\nconst turkishAscii = detectCommentLanguage("bu neden iyi degil");\nassert.equal(turkishAscii.code, "tr");\n\nconst repository = readFileSync(new URL("../src/content-filter/repository.js", import.meta.url), "utf8");\nassert.match(repository, /unsupportedLanguageMode === "review"/);\nassert.match(repository, /unsupportedLanguageMode === "ai_review"/);\nassert.doesNotMatch(repository, /unsupportedLanguageMode !== "allow"/);\n\nconst provider = readFileSync(new URL("../src/ai/provider.js", import.meta.url), "utf8");\nassert.match(provider, /\["ja", "en", "ru", "tr"\]/);\n\nconsole.log("Multilingual routing tests passed.");\n`, "utf8");

for (const path of [
  ".github/scripts/apply-unknown-language-routing-fix.mjs",
  ".github/workflows/fix-unknown-language-routing.yml"
]) {
  try { unlinkSync(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}

console.log("Applied unknown-language routing fix.");
