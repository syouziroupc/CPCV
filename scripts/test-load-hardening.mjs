import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_TARGET_LANGUAGES } from "../src/ai/validation.js";
import { runModerationModel } from "../src/ai/moderation-classifier.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const publicRoute = read("src/routes/public-v2.js");
const comments = read("src/comments/repository.js");
const realtime = read("src/realtime/repository.js");
const room = read("src/realtime/comment-room.js");
const aiRepository = read("src/ai/repository.js");
const aiProvider = read("src/ai/provider.js");
const moderationClassifier = read("src/ai/moderation-classifier.js");
const wrangler = read("wrangler.toml");
const adminJs = read("public/assets/admin.js");
const adminHtml = read("public/_admin_spa.html");
const accountHtml = read("public/account/index.html");
const homeHtml = read("public/index.html");

assert.match(publicRoute, /loadPublicMessageSession/);
assert.match(publicRoute, /COMMENT_ROOM_RETRY_DELAYS_MS = Object\.freeze\(\[80, 240, 720, 1600, 3200\]\)/);
assert.doesNotMatch(publicRoute, /isDurableObjectDeploymentReset/);
assert.match(publicRoute, /CommentRoom transport retry/);
assert.match(publicRoute, /CommentRoom 5xx retry/);
assert.match(publicRoute, /response\.status < 500/);
assert.match(comments, /inspectIdempotencyKey/);
assert.match(realtime, /UPDATE realtime_events[\s\S]*RETURNING id, organization_id/);
assert.match(room, /if \(!event\) \{[\s\S]*findRealtimeEventForComment/);
assert.match(aiRepository, /hasChangeMetadata/);

const translationConsumer = wrangler.match(/queue = "cpcv-ai-translation-jobs"[\s\S]*?dead_letter_queue = "cpcv-ai-translation-dlq"/)?.[0] || "";
const moderationConsumer = wrangler.match(/queue = "cpcv-ai-moderation-jobs"[\s\S]*?dead_letter_queue = "cpcv-ai-moderation-dlq"/)?.[0] || "";
assert.match(translationConsumer, /max_batch_size = 3/);
assert.match(moderationConsumer, /max_batch_size = 10/);
assert.match(wrangler, /AI_MODERATION_QUEUE_PARALLELISM = "10"/);
assert.match(wrangler, /AI_MODERATION_MODEL_BATCH_SIZE = "20"/);
assert.match(wrangler, /AI_MODERATION_BATCH_WINDOW_MS = "8"/);

assert.match(moderationClassifier, /@cf\/baai\/bge-reranker-base/);
assert.match(moderationClassifier, /contexts: messages\.map/);
assert.match(moderationClassifier, /SAFETY_QUERY/);
assert.match(moderationClassifier, /batchStates = new WeakMap/);
assert.match(moderationClassifier, /AI_MODERATION_REVIEW_SCORE/);
assert.match(aiProvider, /AI_TRANSLATION_DEDICATED_RATE_LIMITER/);
assert.match(aiProvider, /acquireDedicatedTranslationCapacity/);
assert.match(wrangler, /name = "AI_TRANSLATION_RATE_LIMITER"[\s\S]*?limit = 990/);
assert.match(wrangler, /name = "AI_TRANSLATION_DEDICATED_RATE_LIMITER"[\s\S]*?limit = 700/);
assert.match(wrangler, /name = "AI_MODERATION_CLASSIFIER_RATE_LIMITER"[\s\S]*?limit = 1900/);
assert.match(wrangler, /name = "AI_MODERATION_RATE_LIMITER"[\s\S]*?limit = 290/);
assert.match(wrangler, /AI_MODERATION_CLASSIFIER_MODEL = "@cf\/baai\/bge-reranker-base"/);
assert.match(wrangler, /AI_MODERATION_REVIEW_SCORE = "0\.46"/);
assert.match(wrangler, /AI_MODERATION_HIDE_SCORE = "0\.78"/);
assert.match(wrangler, /AI_TRANSLATION_BALANCED_MODEL = "@cf\/meta\/llama-3\.2-3b-instruct"/);

const languageMatch = adminJs.match(/AI_TARGET_LANGUAGE_CODES = Object\.freeze\((\[[^\n]+\])\);/);
assert.ok(languageMatch, "admin language list must be present");
assert.deepEqual(JSON.parse(languageMatch[1]), [...AI_TARGET_LANGUAGES]);
assert.match(adminHtml, /<select id="sessionAiTargetLanguage" class="select"><\/select>/);
assert.doesNotMatch(adminHtml, /既知言語を最短|速度と精度を両立|大型AIで慎重/);
assert.doesNotMatch(accountHtml, /設定の場所/);
assert.doesNotMatch(homeHtml, /授業開始までの3段階/);
assert.doesNotMatch(homeHtml, /role-entry-grid/);

let sequentialCalls = 0;
const sequentialEnv = {
  AI_MODERATION_CLASSIFIER_MODEL: "@cf/baai/bge-reranker-base",
  AI_MODERATION_CLASSIFIER_FALLBACK: "0",
  AI_MODERATION_MODEL_BATCH_SIZE: "20",
  AI_MODERATION_BATCH_WINDOW_MS: "1",
  AI_MODERATION_REVIEW_SCORE: "0.46",
  AI_MODERATION_HIDE_SCORE: "0.78",
  AI_MODERATION_CLASSIFIER_RATE_LIMITER: { limit: async () => ({ success: true }) },
  AI: {
    run: async (_model, request) => {
      sequentialCalls += 1;
      return {
        response: request.contexts.map((context, index) => ({
          id: index,
          score: /abusive|idiot/i.test(context.text) ? 0.94 : 0.08
        }))
      };
    }
  }
};
const safeModeration = await runModerationModel(sequentialEnv, {
  message: "Thank you for the explanation."
});
assert.equal(safeModeration.recommendation, "allow");
assert.equal(safeModeration.model, "@cf/baai/bge-reranker-base");
const unsafeModeration = await runModerationModel(sequentialEnv, {
  message: "You are an abusive idiot."
});
assert.equal(unsafeModeration.recommendation, "hide");
assert.ok(unsafeModeration.categories.includes("harassment"));
assert.equal(sequentialCalls, 2);

let batchedCalls = 0;
let limiterCalls = 0;
const batchedEnv = {
  AI_MODERATION_CLASSIFIER_MODEL: "@cf/baai/bge-reranker-base",
  AI_MODERATION_CLASSIFIER_FALLBACK: "0",
  AI_MODERATION_MODEL_BATCH_SIZE: "20",
  AI_MODERATION_BATCH_WINDOW_MS: "5",
  AI_MODERATION_REVIEW_SCORE: "0.46",
  AI_MODERATION_HIDE_SCORE: "0.78",
  AI_MODERATION_CLASSIFIER_RATE_LIMITER: {
    limit: async () => {
      limiterCalls += 1;
      return { success: true };
    }
  },
  AI: {
    run: async (_model, request) => {
      batchedCalls += 1;
      assert.match(request.query, /Unsafe or disruptive classroom comment/);
      return {
        response: request.contexts.map((_, index) => ({ id: index, score: 0.06 }))
      };
    }
  }
};
const batchedResults = await Promise.all(
  Array.from({ length: 8 }, (_, index) => runModerationModel(batchedEnv, {
    message: `Safe classroom batch comment ${index}.`
  }))
);
assert.ok(batchedResults.every((result) => result.recommendation === "allow"));
assert.equal(batchedCalls, 1, "concurrent moderation comments should share one text-classification request");
assert.equal(limiterCalls, 1, "classifier capacity should count batched model requests, not comments");

console.log("load hardening, batched moderation capacity routing, and minimal UI regression passed");
