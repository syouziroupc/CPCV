import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const path = "scripts/test-bilingual-filter-v2.mjs";
let source = readFileSync(path, "utf8");
const replacements = [
  [
    `check("non-Japanese and non-English text is held for review", unsupported.action === "review" && unsupported.requiresReview && unsupported.unsupportedLanguage, unsupported);`,
    `check("unsupported text is visible while AI review runs asynchronously", unsupported.action === "allow" && !unsupported.requiresReview && unsupported.unsupportedLanguage, unsupported);`
  ],
  [
    `check("shared short Latin words do not misclassify unsupported text as English", mixedShort.unsupportedLanguage === true && mixedShort.action === "review", mixedShort);`,
    `check("shared short Latin words remain unsupported without pre-approval blocking", mixedShort.unsupportedLanguage === true && mixedShort.action === "allow" && !mixedShort.requiresReview, mixedShort);`
  ],
  [
    `check("unsupported language comment is persisted pending", comment.moderationState === "pending" && comment.language.unsupported === true, comment);`,
    `check("unsupported language comment is persisted visible", comment.moderationState === "visible" && comment.language.unsupported === true, comment);`
  ],
  [
    `check("unsupported language creates a moderation AI job even when ordinary AI moderation is off", jobs.length === 1 && jobs[0].jobType === "moderation", jobs);`,
    `check("unsupported language creates moderation and translation jobs", jobs.length === 2 && jobs.some((job) => job.jobType === "moderation") && jobs.some((job) => job.jobType === "translation"), jobs);`
  ],
  [
    `check("pending unsupported comment is not translated before human approval", jobs.every((job) => job.jobType !== "translation"), jobs);`,
    `check("visible unsupported comment is translated without human approval", jobs.some((job) => job.jobType === "translation"), jobs);`
  ]
];
for (const [oldText, newText] of replacements) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Expected one test match, found ${count}: ${oldText}`);
  source = source.replace(oldText, newText);
}
writeFileSync(path, source, "utf8");
unlinkSync(".github/scripts/update-unknown-language-tests.mjs");
console.log("Updated unknown-language regression expectations.");
