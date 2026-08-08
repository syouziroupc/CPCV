import { AI_CATEGORIES, normalizeModerationResult } from "./validation.js";
import { runModerationModel as runLegacyModerationModel } from "./provider-base.js";

const DEFAULT_MODEL = "@cf/google/embeddinggemma-300m";
const PROMPT_VERSION = "moderation-embedding-v2-batched";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_WINDOW_MS = 8;
const CLASSIFIER_LIMIT_KEY = "workers-ai-moderation-embedding";
const VALID_CATEGORIES = new Set(AI_CATEGORIES);
const prototypeCache = new Map();
const batchStates = new WeakMap();

const PROFILES = Object.freeze([
  {
    category: "safe",
    text: "Ordinary classroom discussion, a neutral question, factual explanation, polite disagreement, quotation for study, or harmless casual comment. 普通の授業コメント、質問、説明、学習目的の引用、丁寧な反対意見、無害な雑談。"
  },
  {
    category: "harassment",
    text: "Direct insult, humiliation, bullying, abusive profanity, intimidation, or degrading language aimed at a person. 人への侮辱、罵倒、いじめ、威圧、人格攻撃、相手を傷つける暴言。"
  },
  {
    category: "hate",
    text: "Hateful or discriminatory attack against a protected group or identity, slur, dehumanization, or exclusion based on identity. 属性や集団への差別、蔑称、ヘイト、排斥、非人間化。"
  },
  {
    category: "sexual",
    text: "Explicit sexual content, sexual solicitation, graphic sexual description, or inappropriate sexual remarks. 露骨な性的内容、性的勧誘、性的描写、不適切な性的発言。"
  },
  {
    category: "violence",
    text: "Threat, encouragement, instruction, or graphic description of physical violence or serious harm. 暴力の脅迫、暴行の推奨や指示、深刻な危害、残虐な暴力表現。"
  },
  {
    category: "self_harm",
    text: "Self-harm or suicide intent, encouragement, methods, instructions, or imminent self-injury risk. 自傷や自殺の意図、方法、推奨、実行手順、切迫した自傷リスク。"
  },
  {
    category: "spam",
    text: "Spam, repeated advertising, scams, unsolicited promotion, meaningless flooding, or disruptive repetitive posting. スパム、宣伝、詐欺、無関係な大量投稿、連投による妨害。"
  },
  {
    category: "personal_data",
    text: "Exposure or solicitation of private personal data such as a phone number, home address, password, account secret, or sensitive identifier. 電話番号、住所、パスワード、秘密情報、個人識別情報の公開や要求。"
  },
  {
    category: "prompt_injection",
    text: "Instruction attempting to override system rules, reveal hidden prompts, bypass moderation, or manipulate the AI classifier. システム指示の上書き、プロンプト開示要求、検閲回避、AI判定の操作。"
  },
  {
    category: "other",
    text: "Other clearly unsafe, disruptive, malicious, or inappropriate classroom content not covered by the specific safety categories. その他の明確に危険、悪意、授業妨害、不適切な内容。"
  }
]);

export async function runModerationModel(env, input, options = {}) {
  if (!env?.AI || typeof env.AI.run !== "function") {
    return runLegacyModerationModel(env, input, options);
  }

  const configuredModel = String(env?.AI_MODERATION_CLASSIFIER_MODEL || "").trim();
  if (!configuredModel) {
    return runLegacyModerationModel(env, input, options);
  }
  const model = configuredModel || DEFAULT_MODEL;

  const usageEventId = typeof options.reserveUsage === "function"
    ? await options.reserveUsage(model)
    : null;

  try {
    const result = await enqueueEmbeddingClassification(env, model, input);
    return {
      ...result.normalized,
      provider: "workers_ai",
      model,
      promptVersion: PROMPT_VERSION,
      rawOutputLength: result.rawOutputLength,
      usageEventId
    };
  } catch (error) {
    if (error?.code === "AI_DAILY_LIMIT_REACHED") throw error;
    const normalized = normalizeClassifierError(error);
    if (allowLegacyFallback(env, normalized)) {
      return runLegacyModerationModel(env, input, options);
    }
    throw normalized;
  }
}

function enqueueEmbeddingClassification(env, model, input) {
  return new Promise((resolve, reject) => {
    const state = batchState(env.AI, model);
    state.items.push({ env, input, resolve, reject });
    const limit = classifierBatchSize(env);

    if (state.items.length >= limit && !state.flushing) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      queueMicrotask(() => flushEmbeddingBatch(state, model));
      return;
    }
    scheduleBatchFlush(state, model, env);
  });
}

function batchState(binding, model) {
  let byModel = batchStates.get(binding);
  if (!byModel) {
    byModel = new Map();
    batchStates.set(binding, byModel);
  }
  let state = byModel.get(model);
  if (!state) {
    state = { items: [], timer: null, flushing: false };
    byModel.set(model, state);
  }
  return state;
}

function scheduleBatchFlush(state, model, env) {
  if (state.timer || state.flushing || !state.items.length) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    void flushEmbeddingBatch(state, model);
  }, classifierBatchWindowMs(env));
}

async function flushEmbeddingBatch(state, model) {
  if (state.flushing || !state.items.length) return;
  state.flushing = true;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;

  const env = state.items[0].env;
  const size = Math.min(classifierBatchSize(env), state.items.length);
  const batch = state.items.splice(0, size);

  try {
    const capacity = await acquireClassifierCapacity(env);
    if (!capacity) throw codedError("AI_CLASSIFIER_RATE_LIMITED", true);
    const results = await classifyBatchWithEmbeddings(
      env,
      model,
      batch.map((item) => item.input)
    );
    if (results.length !== batch.length) throw codedError("AI_RESPONSE_INVALID", true);
    for (let index = 0; index < batch.length; index += 1) {
      batch[index].resolve(results[index]);
    }
  } catch (error) {
    for (const item of batch) item.reject(error);
  } finally {
    state.flushing = false;
    if (state.items.length) {
      queueMicrotask(() => flushEmbeddingBatch(state, model));
    }
  }
}

async function classifyBatchWithEmbeddings(env, model, inputs) {
  const messages = inputs.map((input) => String(input?.message || "").trim());
  if (messages.some((message) => !message)) {
    throw codedError("AI_RESPONSE_INVALID", false);
  }

  const timeout = classifierTimeoutMs(env);
  let prototypes = prototypeCache.get(model);
  let response;
  let messageVectors;

  if (!prototypes) {
    response = await withTimeout(
      Promise.resolve(
        env.AI.run(
          model,
          {
            text: [
              ...messages,
              ...PROFILES.map((profile) => profile.text)
            ]
          },
          gatewayOptions(env)
        )
      ),
      timeout
    );
    const vectors = extractVectors(response);
    if (vectors.length !== messages.length + PROFILES.length) {
      throw codedError("AI_RESPONSE_INVALID", true);
    }
    messageVectors = vectors.slice(0, messages.length);
    prototypes = vectors.slice(messages.length);
    prototypeCache.set(model, prototypes);
  } else {
    response = await withTimeout(
      Promise.resolve(
        env.AI.run(model, { text: messages }, gatewayOptions(env))
      ),
      timeout
    );
    const vectors = extractVectors(response);
    if (vectors.length !== messages.length) {
      throw codedError("AI_RESPONSE_INVALID", true);
    }
    messageVectors = vectors;
  }

  if (
    prototypes.some((vector) => !Array.isArray(vector) || !vector.length)
    || messageVectors.some(
      (vector) => !Array.isArray(vector)
        || !vector.length
        || vector.length !== prototypes[0].length
    )
  ) {
    throw codedError("AI_RESPONSE_INVALID", true);
  }

  const rawPerItem = Math.max(1, Math.ceil(structuredLength(response) / inputs.length));
  return inputs.map((input, index) => ({
    normalized: classifyVector(input, messageVectors[index], prototypes, env),
    rawOutputLength: rawPerItem
  }));
}

function classifyVector(input, messageVector, prototypes, env) {
  if (input?.promptInjection) {
    return normalizeModerationResult({
      recommendation: "review",
      confidence: 0.98,
      categories: ["prompt_injection"]
    });
  }

  const scored = PROFILES.map((profile, index) => ({
    category: profile.category,
    score: cosineSimilarity(messageVector, prototypes[index])
  }));
  const safeScore = scored.find((item) => item.category === "safe")?.score ?? -1;
  const unsafe = scored
    .filter((item) => item.category !== "safe")
    .sort((a, b) => b.score - a.score);
  const top = unsafe[0] || { category: "other", score: -1 };
  const dictionaryCategories = extractDictionaryCategories(input?.dictionaryCandidates);
  const hasDictionarySignal = Array.isArray(input?.dictionaryCandidates)
    && input.dictionaryCandidates.length > 0;

  const configuredReviewMargin = configuredNumber(
    env?.AI_MODERATION_REVIEW_MARGIN,
    0.035,
    0.005,
    0.25
  );
  const reviewMargin = configuredReviewMargin * (hasDictionarySignal ? 0.65 : 1);
  const hideMargin = configuredNumber(
    env?.AI_MODERATION_HIDE_MARGIN,
    0.12,
    0.03,
    0.5
  );
  const margin = top.score - safeScore;

  let recommendation = "allow";
  if (margin >= hideMargin && top.category !== "other") recommendation = "hide";
  else if (margin >= reviewMargin || (hasDictionarySignal && margin >= -0.005)) {
    recommendation = "review";
  }

  let categories = [];
  if (recommendation !== "allow") {
    const scoreFloor = Math.max(
      safeScore + Math.max(0.005, reviewMargin * 0.5),
      top.score - 0.045
    );
    categories = unsafe
      .filter((item) => item.score >= scoreFloor)
      .slice(0, 3)
      .map((item) => item.category);
    categories = [...new Set([...categories, ...dictionaryCategories])]
      .filter((item) => VALID_CATEGORIES.has(item))
      .slice(0, 9);
    if (!categories.length) {
      categories = [top.category === "safe" ? "other" : top.category];
    }
  }

  const separation = Math.min(0.45, Math.abs(margin));
  const confidence = recommendation === "hide"
    ? Math.min(0.99, 0.74 + separation * 1.7)
    : recommendation === "review"
      ? Math.min(0.92, 0.56 + separation * 1.6)
      : Math.min(0.98, 0.58 + separation * 1.8);

  return normalizeModerationResult({
    recommendation,
    confidence,
    categories
  });
}

function extractDictionaryCategories(value) {
  const categories = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || typeof item !== "object") continue;
    for (const key of ["category", "type", "reason"]) {
      const normalized = String(item[key] || "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_");
      if (VALID_CATEGORIES.has(normalized)) categories.push(normalized);
    }
  }
  return [...new Set(categories)];
}

function extractVectors(value) {
  const data = value?.data ?? value?.result?.data ?? value?.response?.data ?? value;
  if (!Array.isArray(data)) return [];
  if (data.every((item) => Number.isFinite(Number(item)))) {
    return [data.map(Number)];
  }
  return data
    .filter(
      (item) => Array.isArray(item)
        && item.length
        && item.every((entry) => Number.isFinite(Number(entry)))
    )
    .map((item) => item.map(Number));
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = Number(a[index]);
    const bv = Number(b[index]);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!(normA > 0) || !(normB > 0)) return -1;
  return dot / Math.sqrt(normA * normB);
}

async function acquireClassifierCapacity(env) {
  const limiter = env?.AI_MODERATION_CLASSIFIER_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return true;
  try {
    const result = await limiter.limit({ key: CLASSIFIER_LIMIT_KEY });
    return result?.success !== false;
  } catch (error) {
    console.error("AI moderation embedding limiter failed closed", safeCode(error));
    return false;
  }
}

function allowLegacyFallback(env, error) {
  if (String(env?.AI_MODERATION_CLASSIFIER_FALLBACK || "1") === "0") return false;
  return [
    "AI_PROVIDER_TIMEOUT",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_PROVIDER_FAILED",
    "AI_RESPONSE_INVALID"
  ].includes(String(error?.aiCode || ""));
}

function classifierBatchSize(env) {
  return Math.round(
    configuredNumber(
      env?.AI_MODERATION_MODEL_BATCH_SIZE,
      DEFAULT_BATCH_SIZE,
      1,
      100
    )
  );
}

function classifierBatchWindowMs(env) {
  return Math.round(
    configuredNumber(
      env?.AI_MODERATION_BATCH_WINDOW_MS,
      DEFAULT_BATCH_WINDOW_MS,
      0,
      25
    )
  );
}

function classifierTimeoutMs(env) {
  return Math.round(
    configuredNumber(
      env?.AI_MODERATION_CLASSIFIER_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      1000,
      15000
    )
  );
}

function configuredNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function gatewayOptions(env) {
  const id = String(env?.AI_GATEWAY_ID || "").trim();
  return id ? { gateway: { id, skipCache: true } } : undefined;
}

function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(codedError("AI_PROVIDER_TIMEOUT", true)),
      milliseconds
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeClassifierError(error) {
  if (error?.aiCode) return error;
  const message = String(error?.message || error || "");
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) {
    return codedError("AI_PROVIDER_RATE_LIMITED", true);
  }
  if (status >= 500 || /timeout|temporar|unavailable|network|capacity/i.test(message)) {
    return codedError("AI_PROVIDER_UNAVAILABLE", true);
  }
  if (/schema|json|invalid[ _-]?response/i.test(message)) {
    return codedError("AI_RESPONSE_INVALID", true);
  }
  if (status >= 400 && status < 500) {
    return codedError("AI_PROVIDER_REQUEST_REJECTED", false);
  }
  return codedError("AI_PROVIDER_FAILED", status === 0 || status >= 500);
}

function structuredLength(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function safeCode(error) {
  const value = String(error?.aiCode || error?.code || error?.message || "unknown");
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120) || "unknown";
}

function codedError(code, retryable) {
  const error = new Error(code);
  error.aiCode = code;
  error.retryable = Boolean(retryable);
  return error;
}
