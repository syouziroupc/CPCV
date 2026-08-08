import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runModerationModel, runTranslationModel } from "../src/ai/provider.js";

const M2M = "@cf/meta/m2m100-1.2b";
const KIMI = "@cf/moonshotai/kimi-k2.6";
const LLAMA4 = "@cf/meta/llama-4-scout-17b-16e-instruct";
const LLAMA3 = "@cf/meta/llama-3.2-3b-instruct";
const RERANKER = "@cf/baai/bge-reranker-base";

await accurateUsesKimiNoThinkingAndSharedCapacity();
await balancedKnownLanguageUsesDedicatedTranslationFirst();
await dedicatedCapacityOverflowUsesBalancedTextGeneration();
await balancedFallsBackAfterDedicatedOutage();
await unknownLanguageUsesMultilingualModelAndSharedCapacity();
await localTextGenerationCapacityRejectionDoesNotCallWorkersAi();
await provider429DoesNotAmplifyIntoFallbackCalls();
await dedicatedLimiterFailureOverflowsInsteadOfParkingQueue();
await legacyModerationFallbackConsumesCapacityPerProviderCall();
await legacyModerationLimiterFailureFailsClosed();
moderationIsNotDoubleCountedAtQueueAdmission();

const providerBaseSource = readFileSync(new URL("../src/ai/provider-base.js", import.meta.url), "utf8");
assert.doesNotMatch(providerBaseSource, /uniqueItems\s*:\s*true/, "moderation schema must avoid unsupported uniqueItems");
const wranglerSource = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
assert.match(wranglerSource, /AI_MODERATION_CLASSIFIER_MODEL = "@cf\/baai\/bge-reranker-base"/);
assert.match(wranglerSource, /AI_MODERATION_MODEL_BATCH_SIZE = "20"/);
assert.match(wranglerSource, /AI_MODERATION_BATCH_WINDOW_MS = "8"/);
assert.match(wranglerSource, /AI_MODERATION_MODEL = "@cf\/meta\/llama-3\.2-3b-instruct"/);
assert.match(wranglerSource, /AI_MODERATION_FALLBACK_MODEL = "@cf\/meta\/llama-4-scout-17b-16e-instruct"/);
assert.match(wranglerSource, /AI_TRANSLATION_BALANCED_MODEL = "@cf\/meta\/llama-3\.2-3b-instruct"/);
assert.match(wranglerSource, /AI_TRANSLATION_ACCURATE_MODEL = "@cf\/moonshotai\/kimi-k2\.6"/);
assert.match(wranglerSource, /name = "AI_TRANSLATION_DEDICATED_RATE_LIMITER"[\s\S]*?limit = 700/);
assert.match(wranglerSource, /name = "AI_MODERATION_CLASSIFIER_RATE_LIMITER"[\s\S]*?limit = 1900/);
assert.match(wranglerSource, new RegExp(RERANKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
console.log("AI capacity and translation resilience tests passed");

async function accurateUsesKimiNoThinkingAndSharedCapacity() {
  const calls = [];
  const limits = [];
  const result = await runTranslationModel(environment(async (model, request) => {
    calls.push({ model, request });
    assert.equal(model, KIMI);
    assert.equal(request.max_completion_tokens, 220);
    assert.equal(request.max_tokens, undefined);
    assert.deepEqual(request.chat_template_kwargs, { thinking: false });
    return { response: "これは翻訳の正常性確認です。" };
  }, limits), {
    message: "This is a translation health check.",
    sourceLanguage: "en",
    targetLanguage: "ja",
    quality: "accurate"
  });
  assert.equal(result.translatedText, "これは翻訳の正常性確認です。");
  assert.ok(Array.isArray(calls[0].request.messages));
  assert.deepEqual(limits, ["text:workers-ai-text-generation"]);
}

async function balancedKnownLanguageUsesDedicatedTranslationFirst() {
  const calls = [];
  const limits = [];
  const result = await runTranslationModel(environment(async (model, request) => {
    calls.push({ model, request });
    assert.equal(model, M2M);
    assert.equal(request.source_lang, "en");
    assert.equal(request.target_lang, "ja");
    return { translated_text: "専用翻訳モデルを優先します。" };
  }, limits), {
    message: "Prefer the dedicated translation model.",
    sourceLanguage: "en",
    targetLanguage: "ja",
    quality: "balanced"
  });
  assert.equal(result.translatedText, "専用翻訳モデルを優先します。");
  assert.deepEqual(calls.map((call) => call.model), [M2M]);
  assert.deepEqual(limits, ["dedicated:workers-ai-translation-dedicated"]);
}

async function dedicatedCapacityOverflowUsesBalancedTextGeneration() {
  const calls = [];
  const limits = [];
  const result = await runTranslationModel(environment(async (model, request) => {
    calls.push({ model, request });
    assert.equal(model, LLAMA3);
    assert.equal(request.max_tokens, 220);
    return { response: "予備経路で翻訳しました。" };
  }, limits, { dedicatedCapacity: false }), {
    message: "Overflow when the dedicated translation lane is full.",
    sourceLanguage: "en",
    targetLanguage: "ja",
    quality: "balanced"
  });
  assert.equal(result.translatedText, "予備経路で翻訳しました。");
  assert.deepEqual(calls.map((call) => call.model), [LLAMA3]);
  assert.deepEqual(limits, [
    "dedicated:workers-ai-translation-dedicated",
    "text:workers-ai-text-generation"
  ]);
}

async function balancedFallsBackAfterDedicatedOutage() {
  const calls = [];
  const limits = [];
  const result = await runTranslationModel(environment(async (model, request) => {
    calls.push({ model, request });
    if (model === M2M) {
      const error = new Error("temporary model capacity");
      error.status = 503;
      throw error;
    }
    assert.equal(model, LLAMA3);
    assert.equal(request.max_tokens, 220);
    assert.equal(request.max_completion_tokens, undefined);
    return { choices: [{ message: { content: "代替モデルで翻訳しました。" } }] };
  }, limits), {
    message: "Fallback translation.",
    sourceLanguage: "en",
    targetLanguage: "ja",
    quality: "balanced"
  });
  assert.equal(result.translatedText, "代替モデルで翻訳しました。");
  assert.deepEqual(calls.map((call) => call.model), [M2M, LLAMA3]);
  assert.deepEqual(limits, [
    "dedicated:workers-ai-translation-dedicated",
    "text:workers-ai-text-generation"
  ]);
}

async function unknownLanguageUsesMultilingualModelAndSharedCapacity() {
  const calls = [];
  const limits = [];
  const result = await runTranslationModel(environment(async (model, request) => {
    calls.push({ model, request });
    assert.equal(model, LLAMA3);
    return { response: "翻訳の精度が低い。" };
  }, limits), {
    message: "La precisione della traduzione è scarsa.",
    sourceLanguage: "other",
    targetLanguage: "ja",
    quality: "balanced"
  });
  assert.equal(result.translatedText, "翻訳の精度が低い。");
  assert.equal(calls.length, 1);
  assert.match(calls[0].request.messages[1].content, /"sourceLanguage":"auto"/);
  assert.deepEqual(limits, ["text:workers-ai-text-generation"]);
}

async function localTextGenerationCapacityRejectionDoesNotCallWorkersAi() {
  let aiCalls = 0;
  const env = environment(async () => {
    aiCalls += 1;
    return { response: "unexpected" };
  }, [], { textCapacity: false });
  await assert.rejects(
    runTranslationModel(env, {
      message: "La traduzione deve attendere.",
      sourceLanguage: "other",
      targetLanguage: "ja",
      quality: "balanced"
    }),
    (error) => error?.aiCode === "AI_PROVIDER_RATE_LIMITED" && error?.retryable === true
  );
  assert.equal(aiCalls, 0);
}

async function provider429DoesNotAmplifyIntoFallbackCalls() {
  const calls = [];
  const limits = [];
  await assert.rejects(
    runTranslationModel(environment(async (model) => {
      calls.push(model);
      const error = new Error("too many requests");
      error.status = 429;
      throw error;
    }, limits), {
      message: "Questa richiesta è limitata.",
      sourceLanguage: "other",
      targetLanguage: "ja",
      quality: "balanced"
    }),
    (error) => error?.aiCode === "AI_PROVIDER_RATE_LIMITED" && error?.retryable === true
  );
  assert.deepEqual(calls, [LLAMA3]);
  assert.deepEqual(limits, ["text:workers-ai-text-generation"]);
}

async function dedicatedLimiterFailureOverflowsInsteadOfParkingQueue() {
  const calls = [];
  const limits = [];
  const env = environment(async (model) => {
    calls.push(model);
    assert.equal(model, LLAMA3);
    return { response: "制限器障害時は別タスクへ退避します。" };
  }, limits);
  env.AI_TRANSLATION_DEDICATED_RATE_LIMITER.limit = async ({ key }) => {
    limits.push(`dedicated:${key}`);
    throw new Error("dedicated limiter unavailable");
  };
  const result = await runTranslationModel(env, {
    message: "Fail over rather than block the entire translation queue.",
    sourceLanguage: "en",
    targetLanguage: "ja",
    quality: "balanced"
  });
  assert.equal(result.translatedText, "制限器障害時は別タスクへ退避します。");
  assert.deepEqual(calls, [LLAMA3]);
  assert.deepEqual(limits, [
    "dedicated:workers-ai-translation-dedicated",
    "text:workers-ai-text-generation"
  ]);
}

async function legacyModerationFallbackConsumesCapacityPerProviderCall() {
  const models = [];
  const limits = [];
  const env = moderationEnvironment(async (model, request) => {
    models.push(model);
    if (model === KIMI) {
      assert.equal(request.max_completion_tokens, 320);
      assert.equal(request.max_tokens, undefined);
      assert.deepEqual(request.chat_template_kwargs, { thinking: false });
      const error = new Error("temporary model outage");
      error.status = 503;
      throw error;
    }
    assert.equal(model, LLAMA4);
    assert.equal(request.max_tokens, 180);
    assert.equal(request.max_completion_tokens, undefined);
    return { recommendation: "allow", confidence: 0.97, categories: [] };
  }, limits);
  const result = await runModerationModel(env, {
    message: "Ordinary classroom comment.",
    dictionaryCandidates: []
  });
  assert.equal(result.recommendation, "allow");
  assert.deepEqual(models, [KIMI, LLAMA4]);
  assert.deepEqual(limits, ["workers-ai-moderation", "workers-ai-moderation"]);
}

async function legacyModerationLimiterFailureFailsClosed() {
  let aiCalls = 0;
  const limits = [];
  const env = moderationEnvironment(async () => {
    aiCalls += 1;
    return { recommendation: "allow", confidence: 1, categories: [] };
  }, limits);
  env.AI_MODERATION_RATE_LIMITER.limit = async ({ key }) => {
    limits.push(key);
    throw new Error("limiter unavailable");
  };
  await assert.rejects(
    runModerationModel(env, {
      message: "Limiter failure check.",
      dictionaryCandidates: []
    }),
    (error) => error?.aiCode === "AI_PROVIDER_RATE_LIMITED" && error?.retryable === true
  );
  assert.equal(aiCalls, 0);
  assert.deepEqual(limits, ["workers-ai-moderation"]);
}

function moderationIsNotDoubleCountedAtQueueAdmission() {
  const processor = readFileSync(new URL("../src/ai/processor.js", import.meta.url), "utf8");
  assert.match(processor, /if \(queueKind !== QUEUE_KIND_TRANSLATION\) return true;/);
}

function moderationEnvironment(run, limitCalls = []) {
  return {
    AI: { run },
    AI_MODERATION_RATE_LIMITER: {
      async limit({ key }) {
        limitCalls.push(key);
        return { success: true };
      }
    },
    AI_MODERATION_MODEL: KIMI,
    AI_MODERATION_FALLBACK_MODEL: LLAMA4,
    AI_TIMEOUT_MS: "12000"
  };
}

function environment(run, limitCalls = [], options = {}) {
  const dedicatedCapacity = options.dedicatedCapacity ?? true;
  const textCapacity = options.textCapacity ?? true;
  return {
    AI: { run },
    AI_TRANSLATION_DEDICATED_RATE_LIMITER: {
      async limit({ key }) {
        limitCalls.push(`dedicated:${key}`);
        return { success: dedicatedCapacity };
      }
    },
    AI_MODERATION_RATE_LIMITER: {
      async limit({ key }) {
        limitCalls.push(`text:${key}`);
        return { success: textCapacity };
      }
    },
    AI_TRANSLATION_MODEL: M2M,
    AI_TRANSLATION_BALANCED_MODEL: LLAMA3,
    AI_TRANSLATION_ACCURATE_MODEL: KIMI,
    AI_TRANSLATION_TIMEOUT_MS: "8000",
    AI_TRANSLATION_BALANCED_TIMEOUT_MS: "18000",
    AI_TRANSLATION_ACCURATE_TIMEOUT_MS: "30000"
  };
}
