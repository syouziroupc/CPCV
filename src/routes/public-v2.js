import { AuthError } from "../auth/errors.js";
import { assertOnlyFields, readJsonObject } from "../auth/request.js";
import { authJson } from "../auth/http.js";
import { hashToken } from "../auth/passwords.js";
import { getOrCreateParticipantToken } from "../comments/cookies.js";
import { normalizeCommentInput, retentionDays, validPublicCode } from "../comments/validation.js";
import { enforcePublicCommentEdgeLimit, enforcePublicUnderstandingEdgeLimit } from "../realtime/edge-rate-limit.js";
import { persistUnderstandingSignal } from "../pdf-analysis/repository.js";
import { normalizeUnderstandingInput } from "../pdf-analysis/validation.js";

const EXISTING_TABLE_CACHE = new WeakMap();
export async function handlePublicV2Api(request, env) {
  if (!env?.DB_V2) throw new AuthError(500, "DB_V2_NOT_CONFIGURED");

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[2] !== "sessions" || !parts[3]) return authJson({ ok: false, error: "NOT_FOUND" }, 404);

  const publicCode = decodePublicCode(parts[3]);
  const session = await loadPublicSession(env.DB_V2, publicCode);
  if (!isUsableSession(session)) return authJson({ ok: false, error: "SESSION_NOT_FOUND" }, 404);

  const participant = getOrCreateParticipantToken(request, env, publicCode);
  const cookieHeaders = participant.setCookie ? { "set-cookie": participant.setCookie } : {};

  if (request.method === "GET" && parts.length === 4) {
    return authJson({
      ok: true,
      title: session.title,
      postingEnabled: Boolean(session.posting_enabled),
      requiresApproval: session.moderation_mode === "pre",
      understandingEnabled: Boolean(session.understanding_enabled),
      pdfState: session.understanding_enabled ? {
        bindingId: session.pdf_binding_id,
        pageNumber: Number(session.pdf_current_page),
        clientVersion: Number(session.pdf_client_version)
      } : null
    }, 200, cookieHeaders);
  }

  if (request.method === "POST" && parts[4] === "messages" && parts.length === 5) {
    if (!env?.COMMENT_ROOM) throw new AuthError(500, "COMMENT_ROOM_NOT_CONFIGURED");
    await enforcePublicCommentEdgeLimit(request, env, publicCode);
    const input = await readJsonObject(request, { maxBytes: 4096 });
    assertOnlyFields(input, ["nickname", "message", "idempotencyKey", "clientId"]);
    const normalized = normalizeCommentInput(input);
    const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(session.id));
    const roomResponse = await stub.fetch("https://comment-room/message", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-public-comment-verified": "true"
      },
      body: JSON.stringify({
        organizationId: session.organization_id,
        liveSessionId: session.id,
        participantTokenHash: await hashToken(participant.token),
        retentionDays: retentionDays(env),
        ...normalized
      })
    });
    const body = await roomResponse.json();
    return authJson(body, roomResponse.status, cookieHeaders);
  }

  if (request.method === "POST" && parts[4] === "understanding" && parts.length === 5) {
    await enforcePublicUnderstandingEdgeLimit(request, env, publicCode);
    const input = await readJsonObject(request, { maxBytes: 1024 });
    assertOnlyFields(input, ["signal", "bindingId", "pageNumber", "clientVersion"]);
    const normalized = normalizeUnderstandingInput(input);
    const result = await persistUnderstandingSignal(env.DB_V2, {
      organizationId: session.organization_id,
      liveSessionId: session.id,
      participantTokenHash: await hashToken(participant.token),
      ...normalized
    });
    return authJson({ ok: true, ...result }, 200, cookieHeaders);
  }

  return authJson({ ok: false, error: "NOT_FOUND" }, 404);
}

async function loadPublicSession(db, publicCode) {
  const hasPdfState = await tableExists(db, "session_pdf_state");
  const understandingSelect = hasPdfState
    ? `EXISTS(SELECT 1 FROM session_pdf_state sps WHERE sps.organization_id = live_sessions.organization_id AND sps.live_session_id = live_sessions.id)`
    : `0`;
  const bindingSelect = hasPdfState
    ? `(SELECT sps.binding_id FROM session_pdf_state sps WHERE sps.organization_id = live_sessions.organization_id AND sps.live_session_id = live_sessions.id LIMIT 1)`
    : `NULL`;
  const pageSelect = hasPdfState
    ? `(SELECT sps.current_page FROM session_pdf_state sps WHERE sps.organization_id = live_sessions.organization_id AND sps.live_session_id = live_sessions.id LIMIT 1)`
    : `NULL`;
  const versionSelect = hasPdfState
    ? `(SELECT sps.client_version FROM session_pdf_state sps WHERE sps.organization_id = live_sessions.organization_id AND sps.live_session_id = live_sessions.id LIMIT 1)`
    : `NULL`;
  return db.prepare(
    `SELECT id, organization_id, public_code, title, posting_enabled,
            comments_visible, status, expires_at,
            COALESCE((
              SELECT sms.moderation_mode
              FROM session_moderation_settings sms
              WHERE sms.organization_id = live_sessions.organization_id
                AND sms.live_session_id = live_sessions.id
            ), 'off') AS moderation_mode,
            ${understandingSelect} AS understanding_enabled,
            ${bindingSelect} AS pdf_binding_id,
            ${pageSelect} AS pdf_current_page,
            ${versionSelect} AS pdf_client_version
     FROM live_sessions WHERE public_code = ?1 LIMIT 1`
  ).bind(publicCode).first();
}

async function tableExists(db, name) {
  let known = EXISTING_TABLE_CACHE.get(db);
  if (known?.has(name)) return true;
  try {
    const row = await db.prepare(
      `SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1`
    ).bind(name).first();
    if (!row?.present) return false;
    if (!known) {
      known = new Set();
      EXISTING_TABLE_CACHE.set(db, known);
    }
    known.add(name);
    return true;
  } catch {
    return false;
  }
}

function isUsableSession(session) {
  return Boolean(session && session.status === "active" && Date.parse(session.expires_at) > Date.now());
}

function decodePublicCode(value) {
  let decoded;
  try { decoded = decodeURIComponent(value).toUpperCase(); } catch { throw new AuthError(400, "INVALID_PATH_PARAMETER"); }
  if (!validPublicCode(decoded)) throw new AuthError(404, "SESSION_NOT_FOUND");
  return decoded;
}
