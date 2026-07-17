import { BUILT_IN_FILTER_PACKS, getBuiltInFilterPack } from "../src/content-filter/packs.js";
import { evaluateFilterMessage } from "../src/content-filter/matcher.js";
import { normalizeFilterTerm } from "../src/content-filter/normalization.js";

const results = [];
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

const packs = new Map(BUILT_IN_FILTER_PACKS.map((pack) => [pack.id, pack]));
const jaCore = packs.get("ja-core-v1");
const jaContext = packs.get("ja-context-v1");
const enCore = packs.get("en-core-v1");
const enContext = packs.get("en-context-v1");

check("four curated Japanese and English packs exist", packs.size === 4 && jaCore && jaContext && enCore && enContext, [...packs.keys()]);
check("core pack versions are upgraded to version 2", jaCore?.version === 2 && enCore?.version === 2, { ja: jaCore?.version, en: enCore?.version });
check("Japanese core has at least 120 terms", jaCore?.terms.length >= 120, jaCore?.terms.length);
check("Japanese total has at least 220 terms", (jaCore?.terms.length || 0) + (jaContext?.terms.length || 0) >= 220, (jaCore?.terms.length || 0) + (jaContext?.terms.length || 0));
check("English core has at least 150 terms", enCore?.terms.length >= 150, enCore?.terms.length);
check("English total has at least 260 terms", (enCore?.terms.length || 0) + (enContext?.terms.length || 0) >= 260, (enCore?.terms.length || 0) + (enContext?.terms.length || 0));
check("built-in packs contain no political category", BUILT_IN_FILTER_PACKS.every((pack) => pack.terms.every((term) => term.category !== "political")));
check("all English terms use whole-word boundaries", [...enCore.terms, ...enContext.terms].every((term) => term.boundaryMode === "word"));
check("context packs never contain severity 5", [...jaContext.terms, ...enContext.terms].every((term) => term.severity < 5));
check("context sexual, profanity, and discrimination terms remain review-level", [...jaContext.terms, ...enContext.terms].filter((term) => ["sexual", "profanity", "discrimination"].includes(term.category)).every((term) => term.severity <= 1));
check("context harassment and violence terms remain below automatic rejection", [...jaContext.terms, ...enContext.terms].filter((term) => ["harassment", "violence"].includes(term.category)).every((term) => term.severity <= 2));

const allTerms = BUILT_IN_FILTER_PACKS.flatMap((pack) => pack.terms.map((term) => ({ ...term, packId: pack.id })));
const duplicateMap = new Map();
for (const term of allTerms) {
  const normalized = normalizeFilterTerm(term.term);
  const key = `${term.languageCode}:${normalized.compactTerm}`;
  const values = duplicateMap.get(key) || [];
  values.push(`${term.packId}:${term.key}:${term.term}`);
  duplicateMap.set(key, values);
}
const duplicates = [...duplicateMap.entries()].filter(([, values]) => values.length > 1);
check("normalized terms do not overlap across built-in packs", duplicates.length === 0, duplicates.slice(0, 20));

check("legacy Japanese keys 001 through 039 are retained", Array.from({ length: 39 }, (_, i) => `ja-${String(i + 1).padStart(3, "0")}`).every((key) => jaCore.terms.some((term) => term.key === key)));
check("legacy English keys 001 through 050 are retained", Array.from({ length: 50 }, (_, i) => `en-${String(i + 1).padStart(3, "0")}`).every((key) => enCore.terms.some((term) => term.key === key)));

const standardPolicies = [
  ["sexual", 2, 3, 5], ["profanity", 2, 3, 5], ["harassment", 3, 4, 5],
  ["discrimination", 2, 4, 5], ["violence", 3, 4, 5]
].map(([category, reviewMinSeverity, maskMinSeverity, rejectMinSeverity]) => ({ category, enabled: true, reviewMinSeverity, maskMinSeverity, rejectMinSeverity }));
const strictPolicies = [
  ["sexual", 1, 3, 5], ["profanity", 1, 3, 5], ["harassment", 2, 4, 5],
  ["discrimination", 1, 4, 5], ["violence", 2, 4, 5]
].map(([category, reviewMinSeverity, maskMinSeverity, rejectMinSeverity]) => ({ category, enabled: true, reviewMinSeverity, maskMinSeverity, rejectMinSeverity }));

function contextFor(selectedPacks, policies) {
  return {
    settings: { enabled: true, aiRoutingMode: "ambiguous", maskCharacter: "＊" },
    policies,
    version: 2,
    terms: selectedPacks.flatMap((pack) => pack.terms.map((term) => {
      const normalized = normalizeFilterTerm(term.term);
      return {
        id: `${pack.id}:${term.key}`,
        term: normalized.term,
        normalizedTerm: normalized.normalizedTerm,
        compactTerm: normalized.compactTerm,
        category: term.category,
        severity: term.severity,
        matchMode: term.matchMode,
        fuzzyEnabled: term.fuzzyEnabled,
        languageCode: term.languageCode,
        boundaryMode: term.boundaryMode
      };
    }))
  };
}

const coreContext = contextFor([jaCore, enCore], standardPolicies);
const strictContext = contextFor([jaCore, enCore, jaContext, enContext], strictPolicies);
function decision(message, context = coreContext) { return evaluateFilterMessage(message, context); }

const safeCore = [
  "クラスの課題を提出しました",
  "カスタム設定を確認します",
  "アホウドリの生態を学ぶ",
  "性行為の定義を保健の授業で扱う",
  "殺すという語の意味を議論する",
  "This class assignment is useful",
  "We visited Scunthorpe and Sussex",
  "The sex education lecture discusses anatomy"
];
check("recommended core permits tested educational and substring-safe examples", safeCore.every((text) => decision(text).action === "allow"), safeCore.map((text) => [text, decision(text).action]));

const japaneseEvasion = decision("ち、んこ");
check("Japanese punctuation evasion is masked", japaneseEvasion.action === "mask" && japaneseEvasion.displayMessage === "＊＊＊＊", japaneseEvasion);
const japaneseThreat = decision("お前を殺すぞ");
check("explicit Japanese threat is rejected", japaneseThreat.action === "reject", japaneseThreat);
const englishAbuse = decision("you are an asshole");
check("explicit English abuse is masked", englishAbuse.action === "mask" && !englishAbuse.displayMessage?.includes("asshole"), englishAbuse);
const englishThreat = decision("I will kill you");
check("explicit English threat is rejected", englishThreat.action === "reject", englishThreat);
const spacedEnglish = decision("f u c k");
check("English spacing evasion is deterministically masked", spacedEnglish.action === "mask" && spacedEnglish.displayMessage && !spacedEnglish.displayMessage.toLowerCase().includes("fuck"), spacedEnglish);

const strictJapaneseEducational = decision("性行為の定義を保健の授業で扱う", strictContext);
check("strict context pack reviews but does not mask or reject Japanese educational wording", strictJapaneseEducational.action === "review" && !strictJapaneseEducational.displayMessage, strictJapaneseEducational);
const strictEnglishEducational = decision("The sex education lecture discusses anatomy", strictContext);
check("strict context pack reviews but does not mask or reject English educational wording", strictEnglishEducational.action === "review" && !strictEnglishEducational.displayMessage, strictEnglishEducational);
check("strict context pack keeps common substring-safe words allowed", ["カスタム設定", "アホウドリ"].every((text) => decision(text, strictContext).action === "allow"));

const summary = BUILT_IN_FILTER_PACKS.map((pack) => ({ id: pack.id, version: pack.version, terms: pack.terms.length }));
console.log("\nPack summary:", JSON.stringify(summary));
const failed = results.filter((item) => !item.ok);
console.log(`\nStage 7.8 dictionary audit summary: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total.`);
if (failed.length) process.exitCode = 1;
