import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_TARGET_LANGUAGES } from "../src/ai/validation.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const publicRoute = read("src/routes/public-v2.js");
const comments = read("src/comments/repository.js");
const realtime = read("src/realtime/repository.js");
const room = read("src/realtime/comment-room.js");
const aiRepository = read("src/ai/repository.js");
const wrangler = read("wrangler.toml");
const adminJs = read("public/assets/admin.js");
const adminHtml = read("public/_admin_spa.html");
const accountHtml = read("public/account/index.html");
const homeHtml = read("public/index.html");

assert.match(publicRoute, /loadPublicMessageSession/);
assert.match(publicRoute, /COMMENT_ROOM_RETRY_DELAYS_MS = Object\.freeze\(\[40, 120\]\)/);
assert.match(publicRoute, /code was updated/i);
assert.match(comments, /inspectIdempotencyKey/);
assert.match(realtime, /UPDATE realtime_events[\s\S]*RETURNING id, organization_id/);
assert.match(room, /if \(!event\) \{[\s\S]*findRealtimeEventForComment/);
assert.match(aiRepository, /hasChangeMetadata/);

const translationConsumer = wrangler.match(/queue = "cpcv-ai-translation-jobs"[\s\S]*?dead_letter_queue = "cpcv-ai-translation-dlq"/)?.[0] || "";
const moderationConsumer = wrangler.match(/queue = "cpcv-ai-moderation-jobs"[\s\S]*?dead_letter_queue = "cpcv-ai-moderation-dlq"/)?.[0] || "";
assert.match(translationConsumer, /max_batch_size = 3/);
assert.match(moderationConsumer, /max_batch_size = 3/);

const languageMatch = adminJs.match(/AI_TARGET_LANGUAGE_CODES = Object\.freeze\((\[[^\n]+\])\);/);
assert.ok(languageMatch, "admin language list must be present");
assert.deepEqual(JSON.parse(languageMatch[1]), [...AI_TARGET_LANGUAGES]);
assert.match(adminHtml, /<select id="sessionAiTargetLanguage" class="select"><\/select>/);
assert.doesNotMatch(adminHtml, /既知言語を最短|速度と精度を両立|大型AIで慎重/);
assert.doesNotMatch(accountHtml, /設定の場所/);
assert.doesNotMatch(homeHtml, /授業開始までの3段階/);
assert.doesNotMatch(homeHtml, /role-entry-grid/);
console.log("load hardening and minimal UI regression passed");