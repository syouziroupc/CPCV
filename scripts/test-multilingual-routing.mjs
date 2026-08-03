import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectCommentLanguage } from "../src/content-filter/language.js";

const russian = detectCommentLanguage("Это очень хороший вопрос");
assert.equal(russian.code, "ru");
assert.equal(russian.supported, false);

const turkishDistinctive = detectCommentLanguage("Bu çok iyi bir soru");
assert.equal(turkishDistinctive.code, "tr");
assert.equal(turkishDistinctive.supported, false);

const turkishAscii = detectCommentLanguage("bu neden iyi degil");
assert.equal(turkishAscii.code, "tr");

const repository = readFileSync(new URL("../src/content-filter/repository.js", import.meta.url), "utf8");
assert.match(repository, /unsupportedLanguageMode === "review"/);
assert.match(repository, /unsupportedLanguageMode === "ai_review"/);
assert.doesNotMatch(repository, /unsupportedLanguageMode !== "allow"/);

const provider = readFileSync(new URL("../src/ai/provider.js", import.meta.url), "utf8");
assert.match(provider, /["ja", "en", "ru", "tr"]/);

console.log("Multilingual routing tests passed.");
