import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

function replaceOnce(path, oldText, newText) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(oldText);
  const second = first < 0 ? -1 : source.indexOf(oldText, first + oldText.length);
  if (first < 0 || second >= 0) throw new Error(`${path}: expected exactly one match`);
  writeFileSync(path, source.slice(0, first) + newText + source.slice(first + oldText.length), "utf8");
}

replaceOnce(
  "src/ai/provider.js",
  `const DEFAULT_TRANSLATION_TIMEOUT_MS = 5_000;\nconst DEFAULT_TRANSLATION_FALLBACK_TIMEOUT_MS = 5_000;`,
  `const DEFAULT_TRANSLATION_TIMEOUT_MS = 3_000;\nconst DEFAULT_TRANSLATION_FALLBACK_TIMEOUT_MS = 2_500;`
);
replaceOnce(
  "src/ai/provider.js",
  `      try {\n        normalized = normalizeTranslationResult({ translation: extractTranslationText(response) });\n      } catch {\n        throw codedError("AI_RESPONSE_INVALID", true);\n      }`,
  `      try {\n        normalized = normalizeTranslationResult({ translation: extractTranslationText(response) });\n      } catch {\n        throw codedError("AI_RESPONSE_INVALID", false);\n      }`
);
replaceOnce(
  "src/ai/provider.js",
  `  for (const key of ["translation", "translated_text", "translatedText", "text"]) {`,
  `  for (const key of ["translation", "translated_text", "translatedText", "translation_text", "generated_text", "text"]) {`
);
replaceOnce(
  "src/ai/provider.js",
  `  for (const key of ["response", "result", "output", "output_text"]) {`,
  `  for (const key of ["response", "result", "data", "output", "output_text"]) {`
);
replaceOnce(
  "src/ai/provider.js",
  `  if (/schema|json|response/i.test(message)) return codedError("AI_RESPONSE_INVALID", true);\n  return codedError("AI_PROVIDER_FAILED", status === 0 || status >= 500);`,
  `  if (/schema|json/i.test(message)) return codedError("AI_RESPONSE_INVALID", false);\n  if (status >= 400 && status < 500) return codedError("AI_PROVIDER_REQUEST_REJECTED", false);\n  return codedError("AI_PROVIDER_FAILED", status === 0 || status >= 500);`
);

replaceOnce(
  "src/ai/processor.js",
  `    const code = String(error?.aiCode || error?.code || "AI_PROVIDER_FAILED").slice(0, 80);\n    const retryable = Boolean(error?.retryable);\n    const failed = await failOrRetryAiJob(env.DB_V2, job, code, retryable, now);`,
  `    const code = String(error?.aiCode || error?.code || "AI_PROVIDER_FAILED").slice(0, 80);\n    const retryable = shouldRetryAiJob(job, error, code);\n    const failed = await failOrRetryAiJob(env.DB_V2, job, code, retryable, now);`
);
replaceOnce(
  "src/ai/processor.js",
  `function safeCode(error) {\n  return String(error?.aiCode || error?.code || error?.name || "ERROR").slice(0, 80);\n}`,
  `function shouldRetryAiJob(job, error, code) {\n  if (!error?.retryable) return false;\n  if (job?.job_type !== "translation") return true;\n  return code === "AI_PERSISTENCE_FAILED";\n}\n\nfunction safeCode(error) {\n  return String(error?.aiCode || error?.code || error?.name || "ERROR").slice(0, 80);\n}`
);

replaceOnce(
  "wrangler.toml",
  `max_batch_size = 5\nmax_batch_timeout = 1\nmax_retries = 3\nmax_concurrency = 10`,
  `max_batch_size = 10\nmax_batch_timeout = 0\nmax_retries = 3`
);
replaceOnce(
  "wrangler.toml",
  `AI_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b"\nAI_TRANSLATION_FALLBACK_MODEL = "@cf/zai-org/glm-4.7-flash"\nAI_TIMEOUT_MS = "12000"\nAI_TRANSLATION_TIMEOUT_MS = "5000"\nAI_TRANSLATION_FALLBACK_TIMEOUT_MS = "5000"\nAI_QUEUE_PARALLELISM = "5"`,
  `AI_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b"\nAI_TIMEOUT_MS = "12000"\nAI_TRANSLATION_TIMEOUT_MS = "3000"\nAI_QUEUE_PARALLELISM = "5"`
);

replaceOnce(
  "scripts/test-ai-v2.mjs",
  `  check("translation parser accepts content arrays with surrounding text", arrayContent.translatedText === "Array content", arrayContent);`,
  `  check("translation parser accepts content arrays with surrounding text", arrayContent.translatedText === "Array content", arrayContent);\n\n  let invalidIsTerminal = false;\n  try {\n    await runTranslationModel({\n      AI_TRANSLATION_MODEL: "test-model",\n      AI: { async run() { return { response: { invalid: true } }; } }\n    }, { message: "原文", sourceLanguage: "ja", targetLanguage: "en" });\n  } catch (error) {\n    invalidIsTerminal = error?.aiCode === "AI_RESPONSE_INVALID" && error?.retryable === false;\n  }\n  check("invalid translation output is terminal instead of entering a slow retry loop", invalidIsTerminal);`
);
replaceOnce(
  "scripts/test-ai-v2.mjs",
  `  await updateSessionAiSettings(h.db, {\n    organizationId: "org_a", liveSessionId: h.sessionId,\n    moderationEnabled: true, translationEnabled: true, targetLanguage: "en",\n    actorUserId: "usr_teacher_a", now: h.now + 110_000\n  });\n}`,
  `  await updateSessionAiSettings(h.db, {\n    organizationId: "org_a", liveSessionId: h.sessionId,\n    moderationEnabled: false, translationEnabled: true, targetLanguage: "en",\n    actorUserId: "usr_teacher_a", now: h.now + 110_000\n  });\n  const failOpenComment = await createComment(h, "translation_fail_open", "翻訳失敗時は原文を解放する", h.now + 111_000);\n  const [failOpenJob] = await createAiJobsForComment(h.db, {\n    organizationId: "org_a", liveSessionId: h.sessionId, commentId: failOpenComment.id, now: h.now + 111_100\n  });\n  h.ai.fail = true;\n  const failOpenOutcome = await processAiJob(h.env, failOpenJob.id, { now: h.now + 111_200 });\n  h.ai.fail = false;\n  const failOpenRow = h.row("SELECT status,attempt_count,last_error_code FROM ai_jobs WHERE id=?1", failOpenJob.id);\n  const failOpenEvent = h.rows("SELECT payload_json FROM realtime_events WHERE source_comment_id=?1 ORDER BY sequence", failOpenComment.id)\n    .map((row) => JSON.parse(row.payload_json)).find((item) => item.type === "translation:unavailable");\n  check("translation provider failure fails open after one attempt", failOpenOutcome.retry === false && failOpenRow?.status === "failed" && failOpenRow.attempt_count === 1 && failOpenEvent?.comment?.message === failOpenComment.message, { failOpenOutcome, failOpenRow, failOpenEvent });\n\n  await updateSessionAiSettings(h.db, {\n    organizationId: "org_a", liveSessionId: h.sessionId,\n    moderationEnabled: true, translationEnabled: true, targetLanguage: "en",\n    actorUserId: "usr_teacher_a", now: h.now + 112_000\n  });\n}`
);
replaceOnce(
  "scripts/test-ai-v2.mjs",
  `    AI_TRANSLATION_MODEL: "@cf/meta/m2m100-1.2b",\n    AI_TRANSLATION_FALLBACK_MODEL: "@cf/zai-org/glm-4.7-flash",\n    AI_GATEWAY_ID: "cpcv-stage7", AI_TIMEOUT_MS: "12000",\n    AI_TRANSLATION_TIMEOUT_MS: "5000", AI_TRANSLATION_FALLBACK_TIMEOUT_MS: "5000"`,
  `    AI_TRANSLATION_MODEL: "@cf/meta/m2m100-1.2b",\n    AI_GATEWAY_ID: "cpcv-stage7", AI_TIMEOUT_MS: "12000",\n    AI_TRANSLATION_TIMEOUT_MS: "3000"`
);
replaceOnce(
  "scripts/test-ai-v2.mjs",
  `  const admin = readFileSync(resolve(ROOT, "public/assets/admin.js"), "utf8");\n  const viewer = readFileSync(resolve(ROOT, "public/assets/viewer.js"), "utf8");`,
  `  const admin = readFileSync(resolve(ROOT, "public/assets/admin.js"), "utf8");\n  const viewer = readFileSync(resolve(ROOT, "public/assets/viewer.js"), "utf8");\n  const wrangler = readFileSync(resolve(ROOT, "wrangler.toml"), "utf8");`
);
replaceOnce(
  "scripts/test-ai-v2.mjs",
  `  check("viewer never replaces original message with translation", viewer.includes("text.textContent = payload.message") && viewer.includes("card.appendChild(translation)"));`,
  `  check("viewer never replaces original message with translation", viewer.includes("text.textContent = payload.message") && viewer.includes("card.appendChild(translation)"));\n  check("translation queue uses immediate autoscaling delivery", wrangler.includes("max_batch_timeout = 0") && !wrangler.includes("max_concurrency =") && wrangler.includes('AI_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b"') && !wrangler.includes("AI_TRANSLATION_FALLBACK_MODEL"), wrangler);`
);

for (const path of [".github/scripts/apply-fast-translation-fix.mjs", ".github/workflows/fast-translation-fix.yml"]) {
  try { unlinkSync(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}
console.log("Applied fast fail-open translation fix.");
