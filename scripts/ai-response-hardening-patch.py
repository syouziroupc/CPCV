from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def sub_once(path, pattern, repl, flags=0):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    new, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, found {count}")
    p.write_text(new, encoding="utf-8")


# public route: recreate broken DO stubs between retries and respect overload signals.
replace_once(
    "src/routes/public-v2.js",
    '''    const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(session.id));
    const roomResponse = await fetchCommentRoomMessage(stub, {
''',
    '''    const roomResponse = await fetchCommentRoomMessage(env.COMMENT_ROOM, session.id, {
'''
)
replace_once(
    "src/routes/public-v2.js",
    '''async function fetchCommentRoomMessage(stub, init) {
  let lastError = null;
  for (let attempt = 0; attempt <= COMMENT_ROOM_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await stub.fetch("https://comment-room/message", init);
      if (response.status < 500 || attempt >= COMMENT_ROOM_RETRY_DELAYS_MS.length) return response;
      console.warn("CommentRoom 5xx retry", attempt + 1, response.status);
      await new Promise((resolve) => setTimeout(resolve, COMMENT_ROOM_RETRY_DELAYS_MS[attempt]));
    } catch (error) {
      lastError = error;
      if (attempt >= COMMENT_ROOM_RETRY_DELAYS_MS.length) throw error;
      console.warn("CommentRoom transport retry", attempt + 1, String(error?.name || "ERROR"));
      await new Promise((resolve) => setTimeout(resolve, COMMENT_ROOM_RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError || new Error("COMMENT_ROOM_UNAVAILABLE");
}
''',
    '''async function fetchCommentRoomMessage(namespace, sessionId, init) {
  let lastError = null;
  for (let attempt = 0; attempt <= COMMENT_ROOM_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      // A transport exception can poison a DurableObjectStub. Recreate it for
      // every attempt as recommended by Cloudflare.
      const stub = namespace.get(namespace.idFromName(sessionId));
      const response = await stub.fetch("https://comment-room/message", init);
      if (response.status < 500 || attempt >= COMMENT_ROOM_RETRY_DELAYS_MS.length) return response;
      console.warn(JSON.stringify({
        event: "comment_room_5xx_retry",
        sessionId,
        attempt: attempt + 1,
        status: response.status
      }));
      await new Promise((resolve) => setTimeout(resolve, COMMENT_ROOM_RETRY_DELAYS_MS[attempt]));
    } catch (error) {
      lastError = error;
      if (error?.overloaded) {
        console.warn(JSON.stringify({ event: "comment_room_overloaded", sessionId }));
        throw new AuthError(503, "COMMENT_ROOM_OVERLOADED");
      }
      if (error?.retryable === false || attempt >= COMMENT_ROOM_RETRY_DELAYS_MS.length) {
        throw new AuthError(503, "COMMENT_ROOM_UNAVAILABLE");
      }
      console.warn(JSON.stringify({
        event: "comment_room_transport_retry",
        sessionId,
        attempt: attempt + 1,
        code: String(error?.name || error?.code || "ERROR").slice(0, 80)
      }));
      await new Promise((resolve) => setTimeout(resolve, COMMENT_ROOM_RETRY_DELAYS_MS[attempt]));
    }
  }
  console.error(JSON.stringify({
    event: "comment_room_unavailable",
    sessionId,
    code: String(lastError?.name || lastError?.code || "ERROR").slice(0, 80)
  }));
  throw new AuthError(503, "COMMENT_ROOM_UNAVAILABLE");
}
'''
)

# CommentRoom: duplicate retries must repair AI scheduling and re-broadcast the persisted event safely.
replace_once(
    "src/realtime/comment-room.js",
    '''      let ai = { jobs: [], dispatched: 0 };
      if (!result.duplicate) {
        try {
          ai = await scheduleAiForComment(this.env, {
            organizationId: input.organizationId,
            liveSessionId: input.liveSessionId,
            commentId: result.comment.id
          }, { dispatch: false });
        } catch (error) {
          console.error("AI scheduling failed", String(error?.code || error?.name || "ERROR"));
        }
      }

      const translationJob = ai.jobs.find((job) => job.jobType === "translation");
      let event = null;
      if (!result.duplicate && result.comment.moderationState === "visible") {
        if (!result.duplicate && translationJob) {
''',
    '''      const aiInput = {
        organizationId: input.organizationId,
        liveSessionId: input.liveSessionId,
        commentId: result.comment.id
      };
      const ai = await this.scheduleAiForAcceptedComment(aiInput);

      const translationJob = ai.jobs.find((job) => job.jobType === "translation");
      let event = null;
      if (result.comment.moderationState === "visible") {
        if (!result.duplicate && translationJob) {
'''
)
replace_once(
    "src/realtime/comment-room.js",
    '''      if (event) await this.broadcastEvent(event);
      if (!result.duplicate && ai.jobs.length) {
        const task = dispatchAiJobs(this.env, ai.jobs)
          .catch((error) => console.error("AI queue dispatch failed", String(error?.code || error?.name || "ERROR")));
        if (typeof this.state?.waitUntil === "function") this.state.waitUntil(task);
        else void task;
      }
      return authJson({
''',
    '''      if (event) await this.broadcastEvent(event);
      if (ai.jobs.length) {
        const task = dispatchAiJobs(this.env, ai.jobs)
          .catch((error) => console.error(JSON.stringify({
            event: "ai_queue_dispatch_failed",
            organizationId: input.organizationId,
            liveSessionId: input.liveSessionId,
            commentId: result.comment.id,
            code: String(error?.code || error?.name || "ERROR").slice(0, 80)
          })));
        if (typeof this.state?.waitUntil === "function") this.state.waitUntil(task);
        else void task;
      }
      return authJson({
'''
)
replace_once(
    "src/realtime/comment-room.js",
    '''        translationPending: Boolean(event?.payload?.translationPending),
        filter: {
''',
    '''        translationPending: Boolean(event?.payload?.translationPending),
        aiSchedulingPending: Boolean(ai.recoveryPending),
        filter: {
'''
)
replace_once(
    "src/realtime/comment-room.js",
    '''  async deliverEvent(request, closeAfter) {
''',
    '''  async scheduleAiForAcceptedComment(input) {
    const immediateDelays = [0, 120];
    let lastError = null;
    for (const delay of immediateDelays) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        return await scheduleAiForComment(this.env, input, { dispatch: false });
      } catch (error) {
        lastError = error;
      }
    }

    console.warn(JSON.stringify({
      event: "ai_scheduling_deferred",
      ...input,
      code: String(lastError?.code || lastError?.name || "ERROR").slice(0, 80)
    }));
    const recovery = this.retryAiScheduling(input)
      .catch((error) => console.error(JSON.stringify({
        event: "ai_scheduling_recovery_failed",
        ...input,
        code: String(error?.code || error?.name || "ERROR").slice(0, 80)
      })));
    if (typeof this.state?.waitUntil === "function") this.state.waitUntil(recovery);
    else void recovery;
    return { jobs: [], dispatched: 0, recoveryPending: true };
  }

  async retryAiScheduling(input) {
    let lastError = null;
    for (const delay of [300, 1200, 3000]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        const result = await scheduleAiForComment(this.env, input);
        console.log(JSON.stringify({
          event: "ai_scheduling_recovered",
          ...input,
          jobs: result.jobs.length,
          dispatched: result.dispatched
        }));
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("AI_SCHEDULING_FAILED");
  }

  async deliverEvent(request, closeAfter) {
'''
)

# Participant UI: all public API requests time out; comment POST retries once with the same idempotency key.
replace_once(
    "public/assets/join.js",
    '''function codePointLength(value) { return Array.from(String(value || '')).length; }
function truncateCodePoints(value, limit) { return Array.from(String(value || '')).slice(0, limit).join(''); }

function setStatus(text, isError = false) {
''',
    '''function codePointLength(value) { return Array.from(String(value || '')).length; }
function truncateCodePoints(value, limit) { return Array.from(String(value || '')).slice(0, limit).join(''); }

const PUBLIC_API_TIMEOUT_MS = 12_000;
const RETRYABLE_COMMENT_STATUSES = new Set([500, 502, 503, 504]);

async function fetchJson(path, options = {}, timeoutMs = PUBLIC_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); }
      catch {
        const error = new Error('INVALID_SERVER_RESPONSE');
        error.status = response.status;
        throw error;
      }
    }
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted) {
      const timeout = new Error('REQUEST_TIMEOUT');
      timeout.code = 'REQUEST_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function postCommentWithRetry(payload) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await fetchJson(`/api/public/sessions/${encodeURIComponent(publicCode)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!RETRYABLE_COMMENT_STATUSES.has(result.response.status) || attempt === 1) return result;
      lastError = new Error(result.data.error || `HTTP_${result.response.status}`);
    } catch (error) {
      lastError = error;
      const retryable = error?.code === 'REQUEST_TIMEOUT'
        || error?.message === 'REQUEST_TIMEOUT'
        || error?.message === 'INVALID_SERVER_RESPONSE'
        || error instanceof TypeError;
      if (!retryable || attempt === 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('SEND_FAILED');
}

function setStatus(text, isError = false) {
'''
)
replace_once(
    "public/assets/join.js",
    '''    const response = await fetch(`/api/public/sessions/${encodeURIComponent(publicCode)}`, { cache: 'no-store' });
    const data = await response.json();
''',
    '''    const { response, data } = await fetchJson(`/api/public/sessions/${encodeURIComponent(publicCode)}`, { cache: 'no-store' });
'''
)
replace_once(
    "public/assets/join.js",
    '''    const response = await fetch(`/api/public/sessions/${encodeURIComponent(publicCode)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(pendingSubmission)
    });
    const data = await response.json();
''',
    '''    const { response, data } = await postCommentWithRetry(pendingSubmission);
'''
)
replace_once(
    "public/assets/join.js",
    '''    setStatus(data.duplicate ? '送信済みのコメントを確認しました。' : data.moderationState === 'pending' ? '承認待ちとして送信しました。' : data.filter?.action === 'mask' ? '一部を伏字にして送信しました。' : '送信しました。');
''',
    '''    setStatus(data.aiSchedulingPending
      ? '送信しました。AI処理は自動で再試行しています。'
      : data.duplicate ? '送信済みのコメントを確認しました。'
        : data.moderationState === 'pending' ? '承認待ちとして送信しました。'
          : data.filter?.action === 'mask' ? '一部を伏字にして送信しました。'
            : '送信しました。');
'''
)
replace_once(
    "public/assets/join.js",
    '''      IDEMPOTENCY_KEY_INVALID: '送信識別子が不正です。ページを再読み込みしてください。'
''',
    '''      IDEMPOTENCY_KEY_INVALID: '送信識別子が不正です。ページを再読み込みしてください。',
      COMMENT_ROOM_UNAVAILABLE: '一時的に送信処理が混雑しています。もう一度送信してください。',
      COMMENT_ROOM_OVERLOADED: '現在アクセスが集中しています。少し待ってからもう一度送信してください。',
      REQUEST_TIMEOUT: '通信がタイムアウトしました。同じ内容を再送しても重複投稿されません。',
      INVALID_SERVER_RESPONSE: 'サーバー応答を確認できませんでした。もう一度送信してください。'
'''
)
replace_once(
    "public/assets/join.js",
    '''      const response = await fetch(`/api/public/sessions/${encodeURIComponent(publicCode)}/understanding`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signal: button.dataset.signal, ...currentPdfState })
      });
      const data = await response.json();
''',
    '''      const { response, data } = await fetchJson(`/api/public/sessions/${encodeURIComponent(publicCode)}/understanding`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signal: button.dataset.signal, ...currentPdfState })
      });
'''
)

# Admin API: bound fetch duration and distinguish local privacy heuristics from provider AI.
replace_once(
    "public/assets/admin.js",
    '''const LOG_CHANNEL_NAME = 'CPCV_LOCAL_LOG_UPDATES';
''',
    '''const LOG_CHANNEL_NAME = 'CPCV_LOCAL_LOG_UPDATES';
const API_TIMEOUT_MS = 15_000;
'''
)
replace_once(
    "public/assets/admin.js",
    '''  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    method,
    headers
  });
  const text = await response.text();
''',
    '''  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;
  let text;
  try {
    response = await fetch(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      method,
      headers,
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      const timeout = new Error('API_TIMEOUT');
      timeout.code = 'API_TIMEOUT';
      timeout.status = 0;
      throw timeout;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
'''
)
replace_once(
    "public/assets/admin.js",
    '''function displayError(error, target = setStatus) {
  if (error.status === 401) {
''',
    '''function displayError(error, target = setStatus) {
  if (error.code === 'API_TIMEOUT') {
    target('サーバー応答がタイムアウトしました。再試行してください。', true);
    return;
  }
  if (error.status === 401) {
'''
)
replace_once(
    "public/assets/admin.js",
    '''  badge.className = `ai-result-badge ai-${result.recommendation || result.status || 'unknown'}`;
  badge.textContent = `AI参考: ${label}`;
''',
    '''  badge.className = `ai-result-badge ai-${result.recommendation || result.status || 'unknown'}`;
  const sourceLabel = result.source === 'local_privacy_guard' ? 'ローカル保護' : 'AI';
  badge.textContent = `${sourceLabel}参考: ${label}`;
'''
)
replace_once(
    "public/assets/admin.js",
    '''function aiStatusLabel(status, error = '') {
  const base = { queued: '待機中', processing: '処理中', retry: '再試行待ち', succeeded: '完了', failed: '失敗', skipped: '未実行' }[status] || '未実行';
  return error ? `${base} (${error})` : base;
}
''',
    '''function aiStatusLabel(status, error = '') {
  const base = { queued: '待機中', processing: '処理中', retry: '再試行待ち', succeeded: '完了', failed: '失敗', skipped: '未実行' }[status] || '未実行';
  const errorLabel = {
    AI_PROVIDER_TIMEOUT: 'AI応答タイムアウト',
    AI_PROVIDER_UNAVAILABLE: 'AIサービス一時停止',
    AI_PROVIDER_RATE_LIMITED: 'AI混雑',
    AI_PROVIDER_FAILED: 'AI接続失敗',
    AI_RESPONSE_INVALID: 'AI応答形式エラー',
    AI_STALE_MAX_ATTEMPTS: 'AI応答なし・再試行上限',
    AI_DAILY_LIMIT_REACHED: 'AI利用上限',
    AI_BINDING_NOT_CONFIGURED: 'AI未設定'
  }[error] || error;
  return error ? `${base} (${errorLabel})` : base;
}
'''
)

# Local privacy guard: stop treating arbitrary 7-10 digit classroom data as a phone/postal code.
replace_once(
    "src/ai/privacy.js",
    '''const PHONE_PATTERN = /(?:\\+?\\d[\\d\\s().-]{7,}\\d)/;
const JAPAN_POSTAL_PATTERN = /\\b\\d{3}-?\\d{4}\\b/;
''',
    '''const PHONE_PATTERN = /(?:\\+?\\d[\\d\\s().-]{7,}\\d)/g;
const JAPAN_POSTAL_PATTERN = /\\b\\d{3}-\\d{4}\\b/;
'''
)
replace_once(
    "src/ai/privacy.js",
    '''  if (PHONE_PATTERN.test(text)) reasons.push("phone");
''',
    '''  if (looksLikePhoneNumber(text)) reasons.push("phone");
'''
)
replace_once(
    "src/ai/privacy.js",
    '''function looksLikePaymentCard(text) {
''',
    '''function looksLikePhoneNumber(text) {
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const raw = String(match[0] || "").trim();
    const digits = raw.replace(/\\D/g, "");
    if (digits.length < 10 || digits.length > 15) continue;
    if (raw.startsWith("+")) return true;
    if (/^0\\d{9,10}$/.test(digits)) return true;
    if (/[\\s().-]/.test(raw) && digits.length >= 10) return true;
  }
  return false;
}

function looksLikePaymentCard(text) {
'''
)

# Moderation prompt and deterministic calibration: low-confidence/unspecific hide => review.
replace_once(
    "src/ai/provider-base.js",
    '''          "Dictionary candidates are heuristic signals only. Consider context, quotation, negation, educational discussion, and obfuscation before recommending review or hide."
''',
    '''          "Dictionary candidates are heuristic signals only. Consider context, quotation, negation, educational discussion, and obfuscation before recommending review or hide.",
          "Do not flag a comment merely because it quotes, names, translates, or academically discusses an offensive, sexual, violent, political, or self-harm term.",
          "A direct target, threat, encouragement, explicit abusive intent, or clearly unsafe request is required for hide. When intent is unclear, prefer review over hide."
'''
)
replace_once(
    "src/ai/provider-base.js",
    '''      (response) => normalizeModerationResult(parseStructuredResponse(response)), options
''',
    '''      (response) => normalizeAndCalibrateModerationResult(response), options
'''
)
replace_once(
    "src/ai/provider-base.js",
    '''      (response) => normalizeModerationResult(parseStructuredResponse(response)), options
''',
    '''      (response) => normalizeAndCalibrateModerationResult(response), options
'''
)
replace_once(
    "src/ai/provider-base.js",
    '''export async function runTranslationModel(env, input, options = {}) {
''',
    '''function normalizeAndCalibrateModerationResult(response) {
  const normalized = normalizeModerationResult(parseStructuredResponse(response));
  if (normalized.recommendation !== "hide") return normalized;
  const hasSpecificRisk = normalized.categories.some((category) => category !== "other");
  if (!hasSpecificRisk || normalized.confidenceMilli < 900) {
    return { ...normalized, recommendation: "review" };
  }
  return normalized;
}

export async function runTranslationModel(env, input, options = {}) {
'''
)

# Translation jobs: transient provider failures should retry instead of becoming one-shot failures.
replace_once(
    "src/ai/processor.js",
    '''    if (failed.retry && job.job_type === "translation" && Number(job.attempt_count) === 1 && isTranslationBackpressure(code)) {
      await dispatchTranslationUnavailable(env, job, "TRANSLATION_DELAYED", now);
''',
    '''    if (failed.retry && job.job_type === "translation" && Number(job.attempt_count) === 1 && isTranslationDelay(code)) {
      await dispatchTranslationUnavailable(env, job, "TRANSLATION_DELAYED", now);
'''
)
replace_once(
    "src/ai/processor.js",
    '''function shouldRetryAiJob(job, error, code) {
  if (!error?.retryable) return false;
  if (job?.job_type !== "translation") return true;
  return code === "AI_PERSISTENCE_FAILED"
    || code === "AI_PROVIDER_RATE_LIMITED";
}

function isTranslationBackpressure(code) {
  return code === "AI_PROVIDER_RATE_LIMITED";
}
''',
    '''function shouldRetryAiJob(job, error, code) {
  if (!error?.retryable) return false;
  if (job?.job_type !== "translation") return true;
  return new Set([
    "AI_PERSISTENCE_FAILED",
    "AI_PROVIDER_RATE_LIMITED",
    "AI_PROVIDER_TIMEOUT",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_PROVIDER_FAILED"
  ]).has(code);
}

function isTranslationDelay(code) {
  return new Set([
    "AI_PROVIDER_RATE_LIMITED",
    "AI_PROVIDER_TIMEOUT",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_PROVIDER_FAILED"
  ]).has(code);
}
'''
)

# Production diagnostics.
replace_once(
    "wrangler.toml",
    '''workers_dev = true

assets = { directory = "./public", binding = "ASSETS", run_worker_first = true, html_handling = "none" }
''',
    '''workers_dev = true

[observability]
enabled = true
head_sampling_rate = 1

assets = { directory = "./public", binding = "ASSETS", run_worker_first = true, html_handling = "none" }
'''
)

# Regression coverage: static architecture assertions.
replace_once(
    "scripts/test-load-hardening.mjs",
    '''const adminJs = read("public/assets/admin.js");
''',
    '''const adminJs = read("public/assets/admin.js");
const joinJs = read("public/assets/join.js");
const aiProcessor = read("src/ai/processor.js");
const aiProviderBase = read("src/ai/provider-base.js");
const privacy = read("src/ai/privacy.js");
'''
)
replace_once(
    "scripts/test-load-hardening.mjs",
    '''assert.match(publicRoute, /CommentRoom transport retry/);
assert.match(publicRoute, /CommentRoom 5xx retry/);
assert.match(publicRoute, /response\\.status < 500/);
''',
    '''assert.match(publicRoute, /comment_room_transport_retry/);
assert.match(publicRoute, /comment_room_5xx_retry/);
assert.match(publicRoute, /response\\.status < 500/);
assert.match(publicRoute, /namespace\\.get\\(namespace\\.idFromName\\(sessionId\\)\\)/);
assert.match(publicRoute, /error\\?\\.overloaded/);
'''
)
replace_once(
    "scripts/test-load-hardening.mjs",
    '''assert.match(room, /if \\(!event\\) \\{[\\s\\S]*findRealtimeEventForComment/);
assert.match(aiRepository, /hasChangeMetadata/);
''',
    '''assert.match(room, /if \\(!event\\) \\{[\\s\\S]*findRealtimeEventForComment/);
assert.match(room, /scheduleAiForAcceptedComment/);
assert.match(room, /retryAiScheduling/);
assert.match(room, /if \\(result\\.comment\\.moderationState === "visible"\\)/);
assert.match(aiRepository, /hasChangeMetadata/);
assert.match(joinJs, /AbortController/);
assert.match(joinJs, /postCommentWithRetry/);
assert.match(joinJs, /RETRYABLE_COMMENT_STATUSES/);
assert.match(adminJs, /API_TIMEOUT_MS = 15_000/);
assert.match(adminJs, /local_privacy_guard/);
assert.match(aiProcessor, /AI_PROVIDER_TIMEOUT/);
assert.match(aiProviderBase, /confidenceMilli < 900/);
assert.match(privacy, /JAPAN_POSTAL_PATTERN = \\/\\\\b\\\\d\\{3\\}-\\\\d\\{4\\}\\\\b\\//);
assert.match(wrangler, /\\[observability\\][\\s\\S]*enabled = true[\\s\\S]*head_sampling_rate = 1/);
'''
)

# Runtime AI quality / false positive checks.
replace_once(
    "scripts/test-ai-quality-ui-refinement.mjs",
    '''import { normalizeModerationResult } from '../src/ai/validation.js';
''',
    '''import { normalizeModerationResult } from '../src/ai/validation.js';
import { inspectCommentPrivacy } from '../src/ai/privacy.js';
'''
)
replace_once(
    "scripts/test-ai-quality-ui-refinement.mjs",
    '''assert.equal(moderationCalls, 2);
console.log('AI quality and administration UI refinement tests passed');
''',
    '''assert.equal(moderationCalls, 2);

assert.equal(inspectCommentPrivacy('学生番号は1234567です').sensitive, false);
assert.equal(inspectCommentPrivacy('整理番号1234567890を使います').sensitive, false);
assert.equal(inspectCommentPrivacy('郵便番号は123-4567です').sensitive, true);
assert.equal(inspectCommentPrivacy('電話は090-1234-5678です').sensitive, true);

const cautiousModeration = await runModerationModel({
  AI_MODERATION_MODEL: '@cf/zai-org/glm-4.7-flash',
  AI: { run: async () => ({ recommendation: 'hide', confidence: 0.72, categories: ['other'] }) }
}, { message: '授業で用語を引用して説明しています', dictionaryCandidates: [] });
assert.equal(cautiousModeration.recommendation, 'review');
assert.equal(cautiousModeration.confidenceMilli, 720);

console.log('AI quality and administration UI refinement tests passed');
'''
)

# Translation transient failure test now expects retries and an eventual explicit terminal status.
replace_once(
    "scripts/test-ai-v2.mjs",
    '''  h.ai.fail = true;
  const failOpenOutcome = await processAiJob(h.env, failOpenJob.id, { now: h.now + 111_200 });
  h.ai.fail = false;
  const failOpenRow = h.row("SELECT status,attempt_count,last_error_code FROM ai_jobs WHERE id=?1", failOpenJob.id);
  const failOpenEvent = h.rows("SELECT payload_json FROM realtime_events WHERE source_comment_id=?1 ORDER BY sequence", failOpenComment.id)
    .map((row) => JSON.parse(row.payload_json)).find((item) => item.type === "translation:unavailable");
  check("translation provider failure fails open after one attempt", failOpenOutcome.retry === false && failOpenRow?.status === "failed" && failOpenRow.attempt_count === 1 && failOpenEvent?.comment?.message === failOpenComment.message, { failOpenOutcome, failOpenRow, failOpenEvent });

''',
    '''  h.ai.fail = true;
  const failOpenFirst = await processAiJob(h.env, failOpenJob.id, { now: h.now + 111_200 });
  const firstRow = h.row("SELECT status,attempt_count,last_error_code FROM ai_jobs WHERE id=?1", failOpenJob.id);
  const delayedEvent = h.rows("SELECT payload_json FROM realtime_events WHERE source_comment_id=?1 ORDER BY sequence", failOpenComment.id)
    .map((row) => JSON.parse(row.payload_json)).find((item) => item.type === "translation:unavailable" && item.reason === "TRANSLATION_DELAYED");
  check("transient translation provider failure enters retry", failOpenFirst.retry === true && firstRow?.status === "retry" && firstRow.attempt_count === 1 && firstRow.last_error_code === "AI_PROVIDER_UNAVAILABLE" && delayedEvent?.comment?.message === failOpenComment.message, { failOpenFirst, firstRow, delayedEvent });

  h.exec(`UPDATE ai_jobs SET run_after='${new Date(h.now + 111_299).toISOString()}' WHERE id='${failOpenJob.id}'`);
  const failOpenSecond = await processAiJob(h.env, failOpenJob.id, { now: h.now + 111_300 });
  h.exec(`UPDATE ai_jobs SET run_after='${new Date(h.now + 111_399).toISOString()}' WHERE id='${failOpenJob.id}'`);
  const failOpenFinal = await processAiJob(h.env, failOpenJob.id, { now: h.now + 111_400 });
  h.ai.fail = false;
  const failOpenRow = h.row("SELECT status,attempt_count,last_error_code FROM ai_jobs WHERE id=?1", failOpenJob.id);
  const failOpenEvent = h.rows("SELECT payload_json FROM realtime_events WHERE source_comment_id=?1 ORDER BY sequence", failOpenComment.id)
    .map((row) => JSON.parse(row.payload_json)).find((item) => item.type === "translation:unavailable" && item.reason === "AI_PROVIDER_UNAVAILABLE");
  check("translation provider failure retries to the bounded attempt limit", failOpenSecond.retry === true && failOpenFinal.retry === false && failOpenRow?.status === "failed" && failOpenRow.attempt_count === 3 && failOpenEvent?.comment?.message === failOpenComment.message, { failOpenSecond, failOpenFinal, failOpenRow, failOpenEvent });

'''
)

# Additional resilience gate for source-level retry policy.
replace_once(
    "scripts/test-ai-translation-resilience.mjs",
    '''  assert.match(processor, /if \\(queueKind !== QUEUE_KIND_TRANSLATION\\) return true;/);
''',
    '''  assert.match(processor, /if \\(queueKind !== QUEUE_KIND_TRANSLATION\\) return true;/);
  assert.match(processor, /AI_PROVIDER_TIMEOUT/);
  assert.match(processor, /AI_PROVIDER_UNAVAILABLE/);
  assert.match(processor, /isTranslationDelay/);
'''
)

print("patches applied")
