import { AI_CATEGORIES, normalizeModerationResult } from "./validation.js";
import { runModerationModel as runLegacyModerationModel } from "./provider-base.js";

const DEFAULT_MODEL = "@cf/baai/bge-reranker-base";
const PROMPT_VERSION = "moderation-reranker-v1-batched";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_WINDOW_MS = 8;
const DEFAULT_REVIEW_SCORE = 0.46;
const DEFAULT_HIDE_SCORE = 0.78;
const CLASSIFIER_LIMIT_KEY = "workers-ai-moderation-text-classification";
const VALID_CATEGORIES = new Set(AI_CATEGORIES);
const batchStates = new WeakMap();

const SAFETY_QUERY = [
  "Unsafe or disruptive classroom comment:",
  "harassment, bullying, hate or discrimination, explicit sexual content,",
  "violence or threats, self-harm encouragement or instructions, spam or scams,",
  "exposure of private personal data, prompt injection, or other malicious content.",
  "危険または授業を妨害するコメント：侮辱・いじめ・差別・ヘイト・露骨な性的内容・暴力や脅迫・",
  "自傷自殺の推奨や方法・スパム詐欺・個人情報の暴露・プロンプトインジェクション・その他の悪意ある内容。"
].join(" ");

const CATEGORY_RULES = Object.freeze([
  ["prompt_injection", /(?:ignore|override|bypass|reveal|show).{0,40}(?:system|prompt|moderation|rules?)|(?:system|prompt).{0,40}(?:ignore|reveal|show)|指示.{0,20}(?:無視|上書き)|プロンプト.{0,20}(?:開示|表示|無視)|検閲.{0,20}(?:回避|無効)/iu],
  ["personal_data", /(?:password|passcode|phone\s*number|home\s*address|social\s*security|credit\s*card|api\s*key|secret|住所|電話番号|パスワード|暗証番号|個人情報|秘密鍵|APIキー)/iu],
  ["self_harm", /(?:suicid|kill\s*myself|self[- ]?harm|cut\s*myself|自殺|自傷|死にたい|首を吊|リストカット)/iu],
  ["violence", /(?:beat\s+you|kill\s+you|shoot\s+you|stab\s+you|break\s+your|bomb\b|murder|殴る|殴って|殺す|殺して|刺す|刺して|暴行|爆破|脅迫)/iu],
  ["sexual", /(?:explicit\s+sex|sexual\s+act|nude|porn|rape|性的行為|セックス|裸|ポルノ|強姦|レイプ)/iu],
  ["hate", /(?:inferior|subhuman|should\s+be\s+excluded|racial\s+slur|hate\s+(?:those|these|all)|劣等|排除すべき|人種差別|民族差別|ヘイト|差別語)/iu],
  ["spam", /(?:buy\s+now|click\s+my|promotion\s+link|free\s+money|scam|crypto\s+giveaway|今すぐ購入|宣伝リンク|無料で稼|詐欺|連投)/iu],
  ["harassment", /(?:idiot|moron|stupid|disgusting|loser|nobody\s+wants\s+you|shut\s+up|馬鹿|バカ|アホ|無能|キモい|消えろ|死ね|うざい|黙れ)/iu]
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
    const result = await enqueueClassification(env, model, input);
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

function enqueueClassification(env, model, input) {
  return new Promise((resolve, reject) => {
    const state = batchState(env.AI, model);
    state.items.push({ env, input, resolve, reject });
    const limit = classifierBatchSize(env);
    if (state.items.length >= limit && !state.flushing) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      queueMicrotask(() => flushClassificationBatch(state, model));
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
    void flushClassificationBatch(state, model);
  }, classifierBatchWindowMs(env));
}

async function flushClassificationBatch(state, model) {
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
    const results = await classifyBatch(env, model, batch.map((item) => item.input));
    if (results.length !== batch.length) throw codedError("AI_RESPONSE_INVALID", true);
    for (let index = 0; index < batch.length; index += 1) batch[index].resolve(results[index]);
  } catch (error) {
    for (const item of batch) item.reject(error);
  } finally {
    state.flushing = false;
    if (state.items.length) queueMicrotask(() => flushClassificationBatch(state, model));
  }
}

async function classifyBatch(env, model, inputs) {
  const messages = inputs.map((input) => String(input?.message || "").trim());
  if (messages.some((message) => !message)) throw codedError("AI_RESPONSE_INVALID", false);

  const response = await withTimeout(
    Promise.resolve(
      env.AI.run(
        model,
        {
          query: SAFETY_QUERY,
          top_k: messages.length,
          contexts: messages.map((text) => ({ text }))
        },
        gatewayOptions(env)
      )
    ),
    classifierTimeoutMs(env)
  );
  const scores = extractScores(response, messages.length);
  if (scores.length !== messages.length || scores.some((score) => !Number.isFinite(score))) {
    throw codedError("AI_RESPONSE_INVALID", true);
  }

  const rawPerItem = Math.max(1, Math.ceil(structuredLength(response) / inputs.length));
  return inputs.map((input, index) => ({
    normalized: classifyScore(input, scores[index], env),
    rawOutputLength: rawPerItem
  }));
}

function extractScores(value, expected) {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(value?.response)
      ? value.response
      : Array.isArray(value?.result)
        ? value.result
        : Array.isArray(value?.data)
          ? value.data
          : [];
  if (!rows.length) return [];

  const output = new Array(expected).fill(Number.NaN);
  let usedIndexedRows = false;
  for (let position = 0; position < rows.length; position += 1) {
    const row = rows[position];
    if (!row || typeof row !== "object") continue;
    const rawIndex = row.id ?? row.index ?? row.context_index ?? row.contextIndex;
    const parsedIndex = Number(rawIndex);
    const score = Number(row.score ?? row.relevance_score ?? row.relevanceScore ?? row.similarity);
    if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < expected && Number.isFinite(score)) {
      output[parsedIndex] = score;
      usedIndexedRows = true;
    }
  }
  if (usedIndexedRows && output.every(Number.isFinite)) return output;

  if (rows.length === expected) {
    return rows.map((row) => Number(
      typeof row === "number"
        ? row
        : row?.score ?? row?.relevance_score ?? row?.relevanceScore ?? row?.similarity
    ));
  }
  return output;
}

function classifyScore(input, rawScore, env) {
  const score = clamp01(rawScore);
  const categories = localCategories(input);
  if (input?.promptInjection && !categories.includes("prompt_injection")) {
    categories.unshift("prompt_injection");
  }

  const reviewScore = configuredNumber(
    env?.AI_MODERATION_REVIEW_SCORE,
    DEFAULT_REVIEW_SCORE,
    0.05,
    0.95
  );
  const hideScore = Math.max(
    reviewScore + 0.03,
    configuredNumber(env?.AI_MODERATION_HIDE_SCORE, DEFAULT_HIDE_SCORE, 0.08, 0.99)
  );
  const dictionarySignal = Array.isArray(input?.dictionaryCandidates) && input.dictionaryCandidates.length > 0;
  const adjustedReview = dictionarySignal ? Math.max(0.08, reviewScore - 0.12) : reviewScore;
  const adjustedHide = categories.length ? Math.max(adjustedReview + 0.03, hideScore - 0.08) : hideScore;

  let recommendation = "allow";
  if (input?.promptInjection || score >= adjustedHide) recommendation = "hide";
  else if (score >= adjustedReview || (dictionarySignal && score >= adjustedReview - 0.05)) recommendation = "review";

  const resultCategories = recommendation === "allow"
    ? []
    : categories.length
      ? categories.slice(0, 9)
      : ["other"];
  const confidence = recommendation === "allow"
    ? Math.min(0.99, Math.max(0.51, 1 - score))
    : Math.min(0.99, Math.max(0.51, score));

  return normalizeModerationResult({
    recommendation,
    confidence,
    categories: resultCategories
  });
}

function localCategories(input) {
  const message = String(input?.message || "");
  const categories = extractDictionaryCategories(input?.dictionaryCandidates);
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(message)) categories.push(category);
  }
  if (input?.promptInjection) categories.push("prompt_injection");
  return [...new Set(categories)].filter((category) => VALID_CATEGORIES.has(category));
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
  return categories;
}

async function acquireClassifierCapacity(env) {
  const limiter = env?.AI_MODERATION_CLASSIFIER_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return true;
  try {
    const result = await limiter.limit({ key: CLASSIFIER_LIMIT_KEY });
    return result?.success !== false;
  } catch (error) {
    console.error("AI moderation classifier limiter failed closed", safeCode(error));
    return false;
  }
}

function allowLegacyFallback(env, error) {
  if (String(env?.AI_MODERATION_CLASSIFIER_FALLBACK || "1") === "0") return false;
  return [
    "AI_CLASSIFIER_RATE_LIMITED",
    "AI_PROVIDER_RATE_LIMITED",
    "AI_PROVIDER_TIMEOUT",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_PROVIDER_FAILED",
    "AI_RESPONSE_INVALID"
  ].includes(String(error?.aiCode || ""));
}

function classifierBatchSize(env) {
  return Math.round(configuredNumber(env?.AI_MODERATION_MODEL_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 100));
}

function classifierBatchWindowMs(env) {
  return Math.round(configuredNumber(env?.AI_MODERATION_BATCH_WINDOW_MS, DEFAULT_BATCH_WINDOW_MS, 0, 25));
}

function classifierTimeoutMs(env) {
  return Math.round(configuredNumber(env?.AI_MODERATION_CLASSIFIER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 15000));
}

function configuredNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function clamp01(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.min(1, Math.max(0, parsed));
}

function gatewayOptions(env) {
  const id = String(env?.AI_GATEWAY_ID || "").trim();
  return id ? { gateway: { id, skipCache: true } } : undefined;
}

function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(codedError("AI_PROVIDER_TIMEOUT", true)), milliseconds);
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
  if (status >= 400 && status < 500) return codedError("AI_PROVIDER_REQUEST_REJECTED", false);
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
