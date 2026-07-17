import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const text = (path) => readFileSync(resolve(ROOT, path), "utf8");
const check = (name, condition, detail = "") => {
  const ok = Boolean(condition); results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`); if (!ok && detail) console.error(detail);
};

const migrationNames = readdirSync(resolve(ROOT, "migrations-v2")).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
check("Stage 7 migration 0010 remains present", migrationNames.includes("0010_ai_moderation_translation.sql"), migrationNames);
const migration = text("migrations-v2/0010_ai_moderation_translation.sql");
for (const table of ["organization_ai_settings", "session_ai_settings", "ai_jobs", "ai_results", "translations", "ai_usage_events"]) {
  check(`Stage 7 table exists: ${table}`, migration.includes(`CREATE TABLE ${table}`));
}
check("AI defaults are disabled", /enabled INTEGER NOT NULL DEFAULT 0/.test(migration) && /moderation_enabled INTEGER NOT NULL DEFAULT 0/.test(migration) && /translation_enabled INTEGER NOT NULL DEFAULT 0/.test(migration));
check("AI jobs are unique per comment type and target", migration.includes("UNIQUE (comment_id, job_type, target_language)"));
check("daily quotas are enforced in D1", migration.includes("trg_ai_usage_moderation_limit") && migration.includes("trg_ai_usage_translation_limit"));
const usageTable = migration.match(/CREATE TABLE ai_usage_events \([\s\S]*?\n\);/)?.[0] || "";
check("every external model call has a usage record", usageTable.includes("job_id TEXT NOT NULL,") && usageTable.includes("attempt_number INTEGER") && usageTable.includes("provider TEXT NOT NULL") && usageTable.includes("model TEXT NOT NULL") && !usageTable.includes("job_id TEXT NOT NULL UNIQUE"));

const processor = text("src/ai/processor.js");
const provider = text("src/ai/provider.js");
const repository = text("src/ai/repository.js");
const privacy = text("src/ai/privacy.js");
const comments = text("src/comments/repository.js");
const privateRoute = text("src/routes/private-v2.js");
const room = text("src/realtime/comment-room.js");
const worker = text("src/index.js");
check("posting schedules AI after comment persistence", room.includes("scheduleAiForComment") && room.includes("state.waitUntil"));
check("queue dispatch failures do not throw into posting", processor.includes("AI queue dispatch failed") && processor.includes("return dispatched"));
check("Queue consumer is connected", worker.includes("async queue(batch, env)") && worker.includes("processAiQueueBatch"));
check("scheduled recovery requeues stale AI jobs", worker.includes("recoverAndDispatchAiJobs") && repository.includes("AI_STALE_PROCESSING"));
check("human moderation state is not updated by AI repository", !/UPDATE comments[\s\S]{0,240}(ai_results|recommendation)/.test(repository));
check("original comment text remains the source", provider.includes("String(input.message") && !repository.includes("UPDATE comments SET message"));
check("translation is stored separately", repository.includes("INSERT INTO translations") && comments.includes("translation_text"));
check("translation and Stage 6 sequence are persisted atomically", repository.includes("realtimeEventStatements") && repository.includes("statements.push(...realtime.statements)") && repository.includes('type: "translation:ready"'));
check("restored comments resend existing translation", privateRoute.includes("Translation restore delivery failed") && privateRoute.includes('type: "translation:ready"'));
check("privacy guard blocks sensitive translation", processor.includes("PII_DETECTED") && privacy.includes("payment_card"));
check("prompt injection is treated as a signal", privacy.includes("PROMPT_INJECTION_PATTERNS") && processor.includes('"prompt_injection"'));
check("Workers AI uses direct JSON Schema", provider.includes('response_format: { type: "json_schema", json_schema: MODERATION_SCHEMA }') && !provider.includes("json_schema: { name:"));
check("AI Gateway caching is disabled", provider.includes("skipCache: true"));
check("provider timeout is bounded", provider.includes("value >= 1000 && value <= 30_000"));
check("invalid structured output can use fallback model", provider.includes("validator(response)") && provider.includes("AI_RESPONSE_INVALID") && provider.includes("for (const model of models)"));
check("quota is reserved before every provider call", provider.includes("options.reserveUsage(model)") && repository.includes("INSERT INTO ai_usage_events"));

const admin = text("public/assets/admin.js");
const viewer = text("public/assets/viewer.js");
const adminHtml = text("public/admin/index.html");
check("organization Owner controls AI quota", admin.includes("/api/org/ai-settings") && adminHtml.includes("aiModerationDailyLimit"));
check("session managers control AI features", admin.includes("/ai-settings") && adminHtml.includes("sessionAiTranslationEnabled"));
check("AI verdict is marked as reference", admin.includes("AI参考") && adminHtml.includes("自動で非表示にはしません"));
check("viewer labels AI translations", viewer.includes("AI翻訳:") && viewer.includes("translation:ready"));
check("viewer retains original before translation", viewer.indexOf("text.textContent = payload.message") < viewer.indexOf("card.appendChild(translation)"));
check("admin and viewer SPA mirrors match", text("public/_admin_spa.html") === adminHtml && text("public/_viewer_spa.html") === text("public/viewer/index.html"));

const wrangler = text("wrangler.toml");
check("Workers AI binding exists", /^\[ai\][\s\S]*?^binding\s*=\s*"AI"/m.test(wrangler));
check("AI Queue producer exists", /\[\[queues\.producers\]\][\s\S]*?binding\s*=\s*"AI_JOBS_QUEUE"[\s\S]*?queue\s*=\s*"cpcv-ai-jobs"/.test(wrangler));
check("AI Queue consumer is bounded", /\[\[queues\.consumers\]\][\s\S]*?max_batch_size\s*=\s*5[\s\S]*?max_retries\s*=\s*3/.test(wrangler));
check("current non-deprecated model is configured", wrangler.includes("@cf/zai-org/glm-4.7-flash") && !wrangler.includes("llama-3.1-8b-instruct\""));

const packageJson = JSON.parse(text("package.json"));
check("package version identifies Stage 7", /^0\.[78]\./.test(packageJson.version));
check("Stage 7 test command exists", packageJson.scripts?.["check:stage07"]?.includes("test-ai-v2.mjs"));
check("CI runs Stage 7 or a later superset", /npm run check:stage(?:07|08)/.test(text(".github/workflows/ci.yml")));
check("safe deployment runs Stage 7 or a later superset", /npm run check:stage(?:07|08)/.test(text("scripts/safe-deploy.ps1")));
check("production deployment stays manual", text(".github/workflows/deploy-production.yml").includes("workflow_dispatch") && !/^\s*push:/m.test(text(".github/workflows/deploy-production.yml")));
check("Stage 7 test file exists", existsSync(resolve(ROOT, "scripts/test-ai-v2.mjs")));

// Earlier migrations are immutable. These are the Stage 6.5 handoff hashes.
const expected = new Map([
  ["0001_initial_schema.sql", "00744c41f8a0755b0346ffd4474b601cfabf75bdcb81db71c1e66825486aadb4"],
  ["0002_auth_security.sql", "2e5121a15105470ec10e3f620cc4b2c431e92139055e50330e887621881e07f6"],
  ["0003_comments.sql", "e8ae2fd7bde82870be57cff0991b30d8bfcf5ad396a293671332501809778238"],
  ["0004_precision_hardening.sql", "aa0643d8126b4094315dc1f4a98b1578e1a9f0577c67123436fa87624782f302"],
  ["0005_comment_content_guards.sql", "8de9d46170ffdb7bd8d7ff9b051de87419da6b858aad5e324e38e480d8eed3bd"],
  ["0006_manual_moderation.sql", "ff5015dfe5f3196d932cb09843ebd1a356b6b69e8c23877afe3ae36f87c5a18b"],
  ["0007_realtime.sql", "0b6b9b2b8da971195a97b52545a601ecc83377304cc69d24f222111d16d57322"],
  ["0008_email_auth.sql", "869c54aca766f1b7710d9097e8f1670f8b5ddc7a559ea6813a6fcb8adf35e7ec"],
  ["0009_account_lifecycle.sql", "e2c42ab9764cd9c8ca9b01f6453a9ee4361ea3f6aeac1e465301eb21eaa76ac1"]
]);
for (const [name, digest] of expected) {
  const actual = createHash("sha256").update(readFileSync(resolve(ROOT, "migrations-v2", name))).digest("hex");
  check(`prior migration unchanged: ${name}`, actual === digest, actual);
}

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\nStage 7 boundary summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;
