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
assert.match(moderationConsumer, /max_batch_size = 3/);

assert.match(moderationClassifier, /@cf\/google\/embeddinggemma-300m/);
assert.match(moderationClassifier, /AI_MODERATION_CLASSIFIER_RATE_LIMITER/);
assert.match(aiProvider, /AI_TRANSLATION_DEDICATED_RATE_LIMITER/);
assert.match(aiProvider, /acquireDedicatedTranslationCapacity/);
assert.match(wrangler, /name = "AI_TRANSLATION_RATE_LIMITER"[\s\S]*?limit = 990/);
assert.match(wrangler, /name = "AI_TRANSLATION_DEDICATED_RATE_LIMITER"[\s\S]*?limit = 700/);
assert.match(wrangler, /name = "AI_MODERATION_CLASSIFIER_RATE_LIMITER"[\s\S]*?limit = 2800/);
assert.match(wrangler, /name = "AI_MODERATION_RATE_LIMITER"[\s\S]*?limit = 290/);
assert.match(wrangler, /AI_MODERATION_CLASSIFIER_MODEL = "@cf\/google\/embeddinggemma-300m"/);
assert.match(wrangler, /AI_TRANSLATION_BALANCED_MODEL = "@cf\/meta\/llama-3.2-3b-instruct"/);

const languageMatch = adminJs.match(/AI_TARGET_LANGUAGE_CODES = Object\.freeze\((\[[^\n]+\])\);/);
assert.ok(languageMatch, "admin language list must be present");
assert.deepEqual(JSON.parse(languageMatch[1]), [...AI_TARGET_LANGUAGES]);
assert.match(adminHtml, /<select id="sessionAiTargetLanguage" class="select"><\/select>/);
assert.doesNotMatch(adminHtml, /既知言語を最短|速度と精度を両立|大型AIで慎重/);
assert.doesNotMatch(accountHtml, /設定の場所/);
assert.doesNotMatch(homeHtml, /授業開始までの3段階/);
assert.doesNotMatch(homeHtml, /role-entry-grid/);

let modelCalls = 0;
const mockEnv = {
  AI_MODERATION_CLASSIFIER_MODEL: "@cf/google/embeddinggemma-300m",
  AI_MODERATION_CLASSIFIER_FALLBACK: "0",
  AI_MODERATION_CLASSIFIER_RATE_LIMITER: {
    limit: async () => ({ success: true })
  },
  AI: {
    run: async (_model, request) => {
      modelCalls += 1;
      const count = Array.isArray(request.text) ? request.text.length : 1;
      if (count > 1) {
        return {
          data: Array.from(
            { length: count },
            (_, index) => index <= 1 ? [1, 0] : [0, 1]
          )
        };
      }
      return { data: [[0, 1]] };
    }
  }
};

const safeModeration = await runModerationModel(mockEnv, {
  message: "Thank you for the explanation."
});
assert.equal(safeModeration.recommendation, "allow");
assert.equal(safeModeration.model, "@cf/google/embeddinggemma-300m");

const unsafeModeration = await runModerationModel(mockEnv, {
  message: "targeted abusive message"
});
assert.equal(unsafeModeration.recommendation, "hide");
assert.ok(unsafeModeration.categories.includes("harassment"));
assert.equal(modelCalls, 2, "classifier prototypes should be cached after the first request");

console.log("load hardening, AI capacity routing, and minimal UI regression passed");
