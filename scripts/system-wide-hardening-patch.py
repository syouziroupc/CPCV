from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))

# Shared bounded browser HTTP helper. It preserves caller abort signals while adding a hard timeout.
write("public/assets/http-client.js", r'''export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let timedOut = false;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener?.("abort", onExternalAbort, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS));
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw codedRequestError("REQUEST_TIMEOUT", error);
    if (externalSignal?.aborted) throw error;
    if (error instanceof TypeError) throw codedRequestError("NETWORK_ERROR", error);
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    externalSignal?.removeEventListener?.("abort", onExternalAbort);
  }
}

function codedRequestError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}
''')

# Shared Durable Object realtime dispatcher. Persisted sequence numbers make retries idempotent.
write("src/realtime/dispatch.js", r'''const REALTIME_RETRY_DELAYS_MS = Object.freeze([0, 100, 300]);
const RETRYABLE_RESPONSE_STATUSES = new Set([500, 502, 503, 504]);

export async function dispatchRealtimeEvent(env, sessionId, event, closeAfter = false) {
  if (!event || !env?.COMMENT_ROOM || !sessionId) return false;
  const path = closeAfter
    ? "/close"
    : event.type === "settings:update"
      ? "/settings"
      : event.type === "message:clear"
        ? "/clear"
        : ["message:remove", "message:restore"].includes(event.type)
          ? "/moderation"
          : "/event";
  const body = JSON.stringify({
    organizationId: event.organizationId,
    liveSessionId: event.liveSessionId,
    sequence: event.sequence,
    ...event.payload,
    comment: event.payload
  });

  for (let attempt = 0; attempt < REALTIME_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = REALTIME_RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const namespace = env.COMMENT_ROOM;
      const stub = namespace.get(namespace.idFromName(sessionId));
      const response = await stub.fetch(`https://comment-room${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-realtime-internal": "true" },
        body
      });
      if (response.ok) return true;
      if (!RETRYABLE_RESPONSE_STATUSES.has(response.status) || attempt === REALTIME_RETRY_DELAYS_MS.length - 1) {
        console.error(JSON.stringify({ event: "realtime_dispatch_failed", sessionId, sequence: event.sequence, status: response.status }));
        return false;
      }
    } catch (error) {
      if (error?.overloaded || error?.retryable !== true || attempt === REALTIME_RETRY_DELAYS_MS.length - 1) {
        console.error(JSON.stringify({
          event: "realtime_dispatch_failed",
          sessionId,
          sequence: event.sequence,
          code: String(error?.code || error?.name || "ERROR").slice(0, 80),
          overloaded: Boolean(error?.overloaded)
        }));
        return false;
      }
    }
  }
  return false;
}
''')

# Durable Object alarms: do not postpone an already scheduled auth revalidation on every new connection.
replace_once(
    "src/realtime/comment-room.js",
    '''  async scheduleAuthRevalidation() {
    if (typeof this.state?.storage?.setAlarm !== "function") return;
    await this.state.storage.setAlarm(Date.now() + AUTH_REVALIDATION_INTERVAL_MS);
  }
''',
    '''  async scheduleAuthRevalidation() {
    const storage = this.state?.storage;
    if (typeof storage?.setAlarm !== "function") return;
    const target = Date.now() + AUTH_REVALIDATION_INTERVAL_MS;
    if (typeof storage.getAlarm === "function") {
      const current = await storage.getAlarm();
      if (Number.isFinite(Number(current)) && Number(current) <= target) return;
    }
    await storage.setAlarm(target);
  }
'''
)

# Private V2: use waitUntil for post-response AI scheduling and the common retrying realtime dispatcher.
replace_once(
    "src/routes/private-v2.js",
    '''import {
  appendRealtimeEvent,
  consumeConnectionTicket,
  findRealtimeEventForComment,
  getRealtimeEventById,
  issueConnectionTicket,
  realtimeEventStatements
} from "../realtime/repository.js";
''',
    '''import {
  appendRealtimeEvent,
  consumeConnectionTicket,
  findRealtimeEventForComment,
  getRealtimeEventById,
  issueConnectionTicket,
  realtimeEventStatements
} from "../realtime/repository.js";
import { dispatchRealtimeEvent } from "../realtime/dispatch.js";
'''
)
replace_once(
    "src/routes/private-v2.js",
    '''    return moderateCommentsBulk(request, env, auth, session);
''',
    '''    return moderateCommentsBulk(request, env, auth, session, ctx);
'''
)
replace_once(
    "src/routes/private-v2.js",
    '''    return moderateSingleComment(request, env, auth, session, decodeCommentId(parts[5]));
''',
    '''    return moderateSingleComment(request, env, auth, session, decodeCommentId(parts[5]), ctx);
'''
)
replace_once(
    "src/routes/private-v2.js",
    '''async function moderateSingleComment(request, env, auth, session, commentId) {
''',
    '''async function moderateSingleComment(request, env, auth, session, commentId, ctx) {
'''
)
replace_once(
    "src/routes/private-v2.js",
    '''    void scheduleAiForComment(env, {
      organizationId: session.organization_id,
      liveSessionId: session.id,
      commentId: result.comment.id
    }).catch((error) => console.error("AI scheduling after moderation failed", safeErrorName(error)));
''',
    '''    await scheduleModerationAi(ctx, env, {
      organizationId: session.organization_id,
      liveSessionId: session.id,
      commentId: result.comment.id
    }, "single");
'''
)
replace_once(
    "src/routes/private-v2.js",
    '''async function moderateCommentsBulk(request, env, auth, session) {
''',
    '''async function moderateCommentsBulk(request, env, auth, session, ctx) {
'''
)
replace_once(
    "src/routes/private-v2.js",
    '''        void scheduleAiForComment(env, {
          organizationId: session.organization_id,
          liveSessionId: session.id,
          commentId: result.comment.id
        }).catch((error) => console.error("AI scheduling after bulk moderation failed", safeErrorName(error)));
''',
    '''        await scheduleModerationAi(ctx, env, {
          organizationId: session.organization_id,
          liveSessionId: session.id,
          commentId: result.comment.id
        }, "bulk");
'''
)
old_dispatch = '''async function dispatchRealtimeEvent(env, sessionId, event, closeAfter = false) {
  if (!event) return false;
  try {
    const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(sessionId));
    const path = closeAfter
      ? "/close"
      : event.type === "settings:update"
        ? "/settings"
        : event.type === "message:clear"
          ? "/clear"
          : ["message:remove", "message:restore"].includes(event.type)
            ? "/moderation"
            : "/event";
    const response = await stub.fetch(`https://comment-room${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-internal": "true"
      },
      body: JSON.stringify({
        organizationId: event.organizationId,
        liveSessionId: event.liveSessionId,
        sequence: event.sequence,
        ...event.payload,
        comment: event.payload
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

'''
replace_once("src/routes/private-v2.js", old_dispatch, '''async function scheduleModerationAi(ctx, env, input, source) {
  const task = Promise.resolve(scheduleAiForComment(env, input))
    .catch((error) => console.error(`AI scheduling after ${source} moderation failed`, safeErrorName(error)));
  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(task);
    return;
  }
  await task;
}

''')

# AI translation realtime delivery uses the same DO retry semantics.
replace_once(
    "src/ai/processor.js",
    '''import { appendRealtimeEvent } from "../realtime/repository.js";
''',
    '''import { appendRealtimeEvent } from "../realtime/repository.js";
import { dispatchRealtimeEvent } from "../realtime/dispatch.js";
'''
)
replace_once(
    "src/ai/processor.js",
    '''async function dispatchTranslationRealtime(env, sessionId, event) {
  if (!event || !env?.COMMENT_ROOM) return false;
  try {
    const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(sessionId));
    const response = await stub.fetch("https://comment-room/event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-realtime-internal": "true" },
      body: JSON.stringify({
        organizationId: event.organizationId,
        liveSessionId: event.liveSessionId,
        sequence: event.sequence
      })
    });
    return response.ok;
  } catch (error) {
    console.error("AI realtime dispatch failed", safeCode(error));
    return false;
  }
}
''',
    '''async function dispatchTranslationRealtime(env, sessionId, event) {
  return dispatchRealtimeEvent(env, sessionId, event, false);
}
'''
)

# Remove stale, unused alternate idempotency implementations.
replace_once(
    "src/comments/repository.js",
    '''async function findCommentByIdempotency(db, liveSessionId, key, participantTokenHash, nowIso) {
  const pdfPageSelect = await pdfPageSelectExpression(db, "comments");
  return db.prepare(
    `SELECT id, nickname, message, display_message, message_length, moderation_state,
            filter_action, filter_ai_required, filter_version,
            detected_language, language_confidence_milli, unsupported_language,
            created_at, updated_at, retained_until, deleted_at,
            ${pdfPageSelect} AS pdf_page_number
     FROM comments
     WHERE live_session_id = ?1 AND idempotency_key = ?2
       AND retained_until > ?3
       AND participant_id = (
         SELECT id FROM participants
         WHERE live_session_id = ?1 AND token_hash = ?4 LIMIT 1
       )
     LIMIT 1`
  ).bind(liveSessionId, key, nowIso, participantTokenHash).first();
}

async function activeIdempotencyKeyExists(db, liveSessionId, key, nowIso) {
  const row = await db.prepare(
    `SELECT 1 AS present FROM comments
     WHERE live_session_id = ?1 AND idempotency_key = ?2 AND retained_until > ?3
     LIMIT 1`
  ).bind(liveSessionId, key, nowIso).first();
  return Boolean(row?.present);
}

async function releaseExpiredIdempotencyKey(db, liveSessionId, key, nowIso) {
  await db.prepare(
    `DELETE FROM comments
     WHERE live_session_id = ?1 AND idempotency_key = ?2 AND retained_until <= ?3`
  ).bind(liveSessionId, key, nowIso).run();
}

''',
    ''''''
)

# Public auth pages: bounded network waits.
replace_once(
    "public/assets/auth-public.js",
    '''export async function api(path, body) {
  const response = await fetch(path, {
''',
    '''import { fetchWithTimeout } from "./http-client.js";

export async function api(path, body) {
  const response = await fetchWithTimeout(path, {
'''
)
replace_once(
    "public/assets/auth-public.js",
    '''  const response = await fetch("/api/auth/config", { credentials: "same-origin", cache: "no-store" });
  const config = await response.json();
''',
    '''  const response = await fetchWithTimeout("/api/auth/config", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("NETWORK_ERROR");
  const config = await response.json().catch(() => { throw new Error("INVALID_RESPONSE"); });
'''
)
replace_once(
    "public/assets/auth-public.js",
    '''  if (code === "NETWORK_ERROR") {
    return "通信に失敗しました。ネットワーク接続を確認してから再試行してください。";
  }
''',
    '''  if (code === "NETWORK_ERROR") {
    return "通信に失敗しました。ネットワーク接続を確認してから再試行してください。";
  }
  if (code === "REQUEST_TIMEOUT") {
    return "通信がタイムアウトしました。ネットワーク接続を確認して再試行してください。";
  }
'''
)

# Invitation flow: never leave disabled buttons behind on network failure; distinguish auth loss from server/network failure.
replace_once(
    "public/assets/accept-invitation.js",
    '''import { errorMessage, tokenFromPath } from "./auth-public.js";
''',
    '''import { errorMessage, tokenFromPath } from "./auth-public.js";
import { fetchWithTimeout } from "./http-client.js";
'''
)
replace_once(
    "public/assets/accept-invitation.js",
    '''  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, method, headers });
  const text = await response.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  return { response, data };
''',
    '''  try {
    const response = await fetchWithTimeout(path, { credentials: "same-origin", cache: "no-store", ...options, method, headers });
    const text = await response.text(); let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: "INVALID_RESPONSE" }; }
    return { response, data };
  } catch (error) {
    return {
      response: { ok: false, status: 0 },
      data: { ok: false, error: error?.code === "REQUEST_TIMEOUT" ? "REQUEST_TIMEOUT" : "NETWORK_ERROR" }
    };
  }
'''
)
replace_once(
    "public/assets/accept-invitation.js",
    '''  if (session.response.ok) {
    csrfToken = session.data.csrfToken || "";
    $("loggedInIdentity").textContent = `${session.data.user?.email || session.data.user?.displayName || "ログイン中の利用者"} でログインしています。`;
    show("loggedInSection", true);
    setStatus("招待内容を確認して承認してください。");
    return;
  }
  show(invitation.accountExists ? "existingSection" : "newSection", true);
''',
    '''  if (session.response.ok) {
    csrfToken = session.data.csrfToken || "";
    $("loggedInIdentity").textContent = `${session.data.user?.email || session.data.user?.displayName || "ログイン中の利用者"} でログインしています。`;
    show("loggedInSection", true);
    setStatus("招待内容を確認して承認してください。");
    return;
  }
  if (session.response.status !== 401) {
    setStatus(errorMessage(session.data.error || "NETWORK_ERROR"), true);
    return;
  }
  show(invitation.accountExists ? "existingSection" : "newSection", true);
'''
)

# Account/master/organization/viewer clients share the bounded HTTP helper.
replace_once("public/assets/account.js", '''const $ = (id) => document.getElementById(id);
''', '''import { fetchWithTimeout } from "./http-client.js";

const $ = (id) => document.getElementById(id);
''')
replace_once("public/assets/account.js", '''  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...options, method, headers });
''', '''  const response = await fetchWithTimeout(path, { cache: "no-store", credentials: "same-origin", ...options, method, headers });
''')
replace_once("public/assets/account.js", '''    RATE_LIMITED: "要求回数が上限に達しました。時間を置いて再試行してください。"
''', '''    RATE_LIMITED: "要求回数が上限に達しました。時間を置いて再試行してください。",
    REQUEST_TIMEOUT: "通信がタイムアウトしました。もう一度試してください。",
    NETWORK_ERROR: "ネットワークに接続できません。接続を確認してください。"
''')
replace_once("public/assets/account.js", '''  } catch (error) {
    show("loadingSection", false); show("loginRequired", true);
  }
}
''', '''  } catch (error) {
    if (error?.status === 401) {
      show("loadingSection", false); show("loginRequired", true);
      return;
    }
    const status = $("loadingSection")?.querySelector(".status");
    if (status) status.textContent = errorText(error?.code || "NETWORK_ERROR");
    show("loadingSection", true); show("loginRequired", false);
  }
}
''')

replace_once("public/assets/master.js", '''const $ = (id) => document.getElementById(id);
''', '''import { fetchWithTimeout } from "./http-client.js";

const $ = (id) => document.getElementById(id);
''')
replace_once("public/assets/master.js", '''  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...options, method, headers });
''', '''  const response = await fetchWithTimeout(path, { cache: 'no-store', credentials: 'same-origin', ...options, method, headers });
''')
replace_once("public/assets/master.js", '''function showApiError(error) { if (error?.status === 401) return showLogin('Sessionが切れました。もう一度ログインしてください。', true); setStatus(`操作できません: ${error?.code || error?.message || 'API_ERROR'}`, true); }
''', '''function showApiError(error) {
  if (error?.status === 401) return showLogin('Sessionが切れました。もう一度ログインしてください。', true);
  const code = error?.code || error?.message || 'API_ERROR';
  const message = code === 'REQUEST_TIMEOUT' ? '通信がタイムアウトしました。もう一度試してください。'
    : code === 'NETWORK_ERROR' ? 'ネットワークに接続できません。接続を確認してください。'
      : `操作できません: ${code}`;
  setStatus(message, true);
}
''')

replace_once("public/assets/organization-settings.js", '''const $ = (id) => document.getElementById(id);
''', '''import { fetchWithTimeout } from "./http-client.js";

const $ = (id) => document.getElementById(id);
''')
replace_once("public/assets/organization-settings.js", '''    const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...options, method, headers });
''', '''    const response = await fetchWithTimeout(path, { cache: 'no-store', credentials: 'same-origin', ...options, method, headers });
''')
replace_once("public/assets/organization-settings.js", '''      FILTER_POLICY_INVALID: '処理基準を確認してください。'
''', '''      FILTER_POLICY_INVALID: '処理基準を確認してください。',
      REQUEST_TIMEOUT: '通信がタイムアウトしました。もう一度試してください。',
      NETWORK_ERROR: 'ネットワークに接続できません。接続を確認してください。'
''')

replace_once("public/assets/viewer.js", '''import * as pdfjsLib from './pdfjs/pdf.min.mjs';
''', '''import * as pdfjsLib from './pdfjs/pdf.min.mjs';
import { fetchWithTimeout } from './http-client.js';
''')
replace_once("public/assets/viewer.js", '''  const response = await fetch(path, {
''', '''  const response = await fetchWithTimeout(path, {
''')
replace_once("public/assets/viewer.js", '''    const response = await fetch(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/export`, {
''', '''    const response = await fetchWithTimeout(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/export`, {
''')

# Join page: avoid overlapping refreshes and do not report transient network failures as a nonexistent class.
replace_once("public/assets/join.js", '''let sessionRefreshTimer = 0;
''', '''let sessionRefreshTimer = 0;
let sessionRefreshRunning = false;
let sessionLoadedOnce = false;
''')
replace_once("public/assets/join.js", '''async function loadSession() {
  try {
''', '''async function loadSession() {
  if (sessionRefreshRunning) return;
  sessionRefreshRunning = true;
  try {
''')
replace_once("public/assets/join.js", '''    sendButton.disabled = !postingEnabled || messageEl.value.trim().length === 0;
  } catch (error) {
    titleEl.textContent = '授業が見つかりません';
    postingEl.textContent = '授業コードを確認してください。';
    sendButton.disabled = true;
    understandingEnabled = false;
    currentPdfState = null;
    understandingSection.classList.add('hidden');
    setStatus(error.message, true);
  }
}
''', '''    sendButton.disabled = !postingEnabled || messageEl.value.trim().length === 0;
    sessionLoadedOnce = true;
  } catch (error) {
    const code = error?.code || error?.message || 'SESSION_ERROR';
    if (code === 'SESSION_NOT_FOUND') {
      titleEl.textContent = '授業が見つかりません';
      postingEl.textContent = '授業コードを確認してください。';
      postingEnabled = false;
      understandingEnabled = false;
      currentPdfState = null;
      understandingSection.classList.add('hidden');
      sendButton.disabled = true;
    } else {
      if (!sessionLoadedOnce) {
        titleEl.textContent = '授業情報を取得できません';
        postingEl.textContent = '通信状況を確認して再読み込みしてください。';
        sendButton.disabled = true;
      }
      const map = {
        REQUEST_TIMEOUT: '授業情報の取得がタイムアウトしました。',
        NETWORK_ERROR: 'ネットワークに接続できません。',
        INVALID_SERVER_RESPONSE: 'サーバー応答を確認できませんでした。'
      };
      setStatus(map[code] || `授業情報の取得に失敗しました: ${code}`, true);
    }
  } finally {
    sessionRefreshRunning = false;
  }
}
''')

# Admin local logs already receive BroadcastChannel events; poll only as a fallback on older browsers.
replace_once("public/assets/admin.js", '''setInterval(() => {
  if (sessionId && !sessionSection.classList.contains('hidden') && document.visibilityState === 'visible') {
    scheduleLocalLogRefresh();
  }
}, 5000);
''', '''if (!localLogChannel) {
  setInterval(() => {
    if (sessionId && !sessionSection.classList.contains('hidden') && document.visibilityState === 'visible') {
      scheduleLocalLogRefresh();
    }
  }, 5000);
}
''')

# Production smoke tests must not hang forever on a stalled connection.
replace_once("scripts/smoke-production.mjs", '''  const response = await fetch(`${origin}/`, { redirect: "error", cache: "no-store" });
''', '''  const response = await fetch(`${origin}/`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
''')
replace_once("scripts/smoke-production.mjs", '''  const response = await fetch(`${origin}/api/auth/session`, { redirect: "error", cache: "no-store" });
''', '''  const response = await fetch(`${origin}/api/auth/session`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
''')

# Email delivery bookkeeping is best-effort after the provider has already accepted/rejected the message.
# Never turn a successfully accepted send into a false failure solely because the status row update failed.
replace_once("src/auth/email-service.js", '''  } catch (error) {
    const code = sanitizeErrorCode(error?.code || "EMAIL_SEND_FAILED");
    await completeAttempt(env.DB_V2, attemptId, "failed", null, code);
    return { ok: false, error: code };
  }

  const messageId = String(result?.messageId || "");
  await completeAttempt(env.DB_V2, attemptId, "sent", messageId, null);
  return { ok: true, messageId };
''', '''  } catch (error) {
    const code = sanitizeErrorCode(error?.code || "EMAIL_SEND_FAILED");
    const statusPersisted = await completeAttempt(env.DB_V2, attemptId, "failed", null, code);
    return { ok: false, error: code, statusPersisted };
  }

  const messageId = String(result?.messageId || "");
  const statusPersisted = await completeAttempt(env.DB_V2, attemptId, "sent", messageId, null);
  return { ok: true, messageId, statusPersisted };
''')
replace_once("src/auth/email-service.js", '''async function completeAttempt(db, id, status, messageId, errorCode) {
  let result;
  try {
    result = await db.prepare(
      `UPDATE email_delivery_attempts
       SET status = ?1, provider_message_id = ?2, provider_error_code = ?3, completed_at = ?4
       WHERE id = ?5 AND status = 'pending'`
    ).bind(status, messageId, errorCode, new Date().toISOString(), id).run();
  } catch (error) {
    throw new AuthError(503, "EMAIL_DELIVERY_STATUS_PERSISTENCE_FAILED", { expose: true });
  }
  if (Number(result?.meta?.changes || 0) !== 1) {
    throw new AuthError(503, "EMAIL_DELIVERY_STATUS_PERSISTENCE_FAILED", { expose: true });
  }
}
''', '''async function completeAttempt(db, id, status, messageId, errorCode) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await db.prepare(
        `UPDATE email_delivery_attempts
         SET status = ?1, provider_message_id = ?2, provider_error_code = ?3, completed_at = ?4
         WHERE id = ?5 AND status = 'pending'`
      ).bind(status, messageId, errorCode, new Date().toISOString(), id).run();
      if (Number(result?.meta?.changes || 0) === 1) return true;
    } catch (error) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
    }
  }
  console.error("Email delivery status persistence failed", id, status);
  return false;
}
''')

# Regression tests dedicated to the newly audited failure modes.
write("scripts/test-system-hardening.mjs", r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dispatchRealtimeEvent } from "../src/realtime/dispatch.js";
import { sendTransactionalEmail } from "../src/auth/email-service.js";

async function testRealtimeRetry() {
  let gets = 0;
  const calls = [];
  const env = {
    COMMENT_ROOM: {
      idFromName(value) { return value; },
      get() {
        gets += 1;
        const attempt = gets;
        return { async fetch(url) { calls.push(url); return new Response("", { status: attempt === 1 ? 503 : 200 }); } };
      }
    }
  };
  const event = { organizationId: "org_a", liveSessionId: "sess_a", sequence: 4, type: "message:clear", payload: { type: "message:clear" } };
  assert.equal(await dispatchRealtimeEvent(env, "sess_a", event), true);
  assert.equal(gets, 2, "a fresh Durable Object stub must be acquired for the retry");
  assert.ok(calls.every((url) => url.endsWith("/clear")));

  let overloadedGets = 0;
  const overloaded = new Error("overloaded"); overloaded.overloaded = true; overloaded.retryable = true;
  const overloadedEnv = { COMMENT_ROOM: { idFromName(v) { return v; }, get() { overloadedGets += 1; return { async fetch() { throw overloaded; } }; } } };
  assert.equal(await dispatchRealtimeEvent(overloadedEnv, "sess_a", event), false);
  assert.equal(overloadedGets, 1, "overloaded Durable Objects must not be retried");

  let retryableGets = 0;
  const retryableEnv = { COMMENT_ROOM: { idFromName(v) { return v; }, get() { retryableGets += 1; const n = retryableGets; return { async fetch() { if (n === 1) { const error = new Error("reset"); error.retryable = true; throw error; } return new Response("", { status: 200 }); } }; } } };
  assert.equal(await dispatchRealtimeEvent(retryableEnv, "sess_a", event), true);
  assert.equal(retryableGets, 2);
}

async function testEmailStatusPersistenceDoesNotRewriteDeliveryOutcome() {
  let sent = 0;
  const db = {
    prepare(sql) {
      return { bind() { return { async run() {
        if (sql.includes("INSERT INTO email_delivery_attempts")) return { meta: { changes: 1 } };
        throw new Error("simulated status write outage");
      } }; } };
    }
  };
  const env = {
    DB_V2: db,
    AUTH_EMAIL_FROM: "noreply@example.com",
    AUTH_RATE_LIMIT_PEPPER: "pepper",
    EMAIL: { async send() { sent += 1; return { messageId: "msg-1" }; } }
  };
  const result = await sendTransactionalEmail(env, {
    kind: "test", to: "person@example.com", subject: "Test", text: "x", html: "<p>x</p>", requestId: "req_1"
  });
  assert.equal(sent, 1);
  assert.equal(result.ok, true, "provider acceptance must remain success even if bookkeeping update fails");
  assert.equal(result.statusPersisted, false);
}

function testStaticHardening() {
  const privateRoute = readFileSync(new URL("../src/routes/private-v2.js", import.meta.url), "utf8");
  const room = readFileSync(new URL("../src/realtime/comment-room.js", import.meta.url), "utf8");
  const comments = readFileSync(new URL("../src/comments/repository.js", import.meta.url), "utf8");
  const join = readFileSync(new URL("../public/assets/join.js", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../public/assets/admin.js", import.meta.url), "utf8");
  const authPublic = readFileSync(new URL("../public/assets/auth-public.js", import.meta.url), "utf8");
  const invitation = readFileSync(new URL("../public/assets/accept-invitation.js", import.meta.url), "utf8");
  const account = readFileSync(new URL("../public/assets/account.js", import.meta.url), "utf8");
  const master = readFileSync(new URL("../public/assets/master.js", import.meta.url), "utf8");
  const organization = readFileSync(new URL("../public/assets/organization-settings.js", import.meta.url), "utf8");
  const viewer = readFileSync(new URL("../public/assets/viewer.js", import.meta.url), "utf8");
  const smoke = readFileSync(new URL("./smoke-production.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(privateRoute, /void scheduleAiForComment/);
  assert.match(privateRoute, /ctx\.waitUntil\(task\)/);
  assert.match(privateRoute, /from "\.\.\/realtime\/dispatch\.js"/);
  assert.match(room, /storage\.getAlarm\(\)/);
  assert.match(room, /Number\(current\) <= target/);
  assert.doesNotMatch(comments, /function findCommentByIdempotency/);
  assert.doesNotMatch(comments, /function activeIdempotencyKeyExists/);
  assert.doesNotMatch(comments, /function releaseExpiredIdempotencyKey/);
  assert.match(join, /sessionRefreshRunning/);
  assert.match(join, /sessionLoadedOnce/);
  assert.match(admin, /if \(!localLogChannel\) \{\s*setInterval/);
  for (const source of [authPublic, invitation, account, master, organization, viewer]) {
    assert.match(source, /http-client\.js/);
  }
  assert.match(invitation, /session\.response\.status !== 401/);
  assert.match(account, /error\?\.status === 401/);
  assert.equal((smoke.match(/AbortSignal\.timeout\(10_000\)/g) || []).length, 2);
}

await testRealtimeRetry();
await testEmailStatusPersistenceDoesNotRewriteDeliveryOutcome();
testStaticHardening();
console.log("System-wide reliability hardening regression tests passed");
''')

# Extend the existing realtime suite with alarm drift coverage.
replace_once(
    "scripts/test-realtime-v2.mjs",
    '''  const room = new CommentRoom(state, { DB_V2: h.db });

  const bulkSockets = [];
''',
    '''  const room = new CommentRoom(state, { DB_V2: h.db });

  const alarmWrites = [];
  let currentAlarm = Date.now() + 60_000;
  const alarmRoom = new CommentRoom({
    getWebSockets() { return []; }, setWebSocketAutoResponse() {}, acceptWebSocket() {},
    storage: {
      async getAlarm() { return currentAlarm; },
      async setAlarm(value) { currentAlarm = value; alarmWrites.push(value); }
    }
  }, { DB_V2: h.db });
  await alarmRoom.scheduleAuthRevalidation();
  check("new connections do not postpone an earlier auth revalidation alarm", alarmWrites.length === 0, alarmWrites);
  currentAlarm = Date.now() + 600_000;
  await alarmRoom.scheduleAuthRevalidation();
  check("a missing or excessively late auth alarm is moved earlier", alarmWrites.length === 1 && alarmWrites[0] < currentAlarm + 1, alarmWrites);

  const bulkSockets = [];
'''
)

print("system-wide patches applied")
