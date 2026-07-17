import { AuthError, isAuthError } from "../auth/errors.js";
import { authJson } from "../auth/http.js";
import { persistComment } from "../comments/repository.js";
import { scheduleAiForComment } from "../ai/processor.js";
import { evaluateCommentFilter } from "../content-filter/repository.js";
import {
  findRealtimeEventForComment,
  getRealtimeEvent,
  getRealtimeSync
} from "./repository.js";

const MAX_CLIENT_FRAME_BYTES = 256;
const AUTH_REVALIDATION_BATCH_SIZE = 80;
const AUTH_REVALIDATION_INTERVAL_MS = 5 * 60 * 1000;

export class CommentRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    if (typeof state?.setWebSocketAutoResponse === "function" && typeof WebSocketRequestResponsePair !== "undefined") {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/message" && request.method === "POST") return await this.acceptMessage(request);
      if (url.pathname === "/connect" && request.method === "GET") return await this.connect(request);
      if (["/event", "/settings", "/clear", "/moderation"].includes(url.pathname) && request.method === "POST") {
        return await this.deliverEvent(request, false);
      }
      if (url.pathname === "/close" && request.method === "POST") return await this.deliverEvent(request, true);
      return authJson({ ok: false, error: "NOT_FOUND" }, 404);
    } catch (error) {
      if (isAuthError(error)) return authJson({ ok: false, error: error.code }, error.status, error.headers);
      const requestId = `req_${crypto.randomUUID().replaceAll("-", "")}`;
      console.error(requestId, error);
      return authJson({ ok: false, error: "INTERNAL_ERROR", requestId }, 500);
    }
  }

  async connect(request) {
    requireInternalRequest(request, "x-realtime-ticket-consumed");
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return authJson({ ok: false, error: "WEBSOCKET_REQUIRED" }, 426);
    }
    const organizationId = request.headers.get("x-organization-id") || "";
    const sessionId = request.headers.get("x-session-id") || "";
    const userId = request.headers.get("x-user-id") || "";
    const authSessionId = request.headers.get("x-auth-session-id") || "";
    const role = request.headers.get("x-role") || "";
    const lastSequence = normalizeSequence(request.headers.get("x-last-sequence"));
    if (!organizationId || !sessionId || !userId || !authSessionId || !new Set(["owner", "admin", "teacher"]).has(role)) {
      return authJson({ ok: false, error: "REALTIME_CONTEXT_INVALID" }, 400);
    }

    const sync = await getRealtimeSync(this.env.DB_V2, {
      organizationId,
      liveSessionId: sessionId,
      lastSequence
    });
    if (sync.room.status !== "active" || Date.parse(sync.room.expiresAt) <= Date.now()) {
      return authJson({ ok: false, error: "SESSION_EXPIRED" }, 410);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    const attachment = {
      organizationId,
      sessionId,
      userId,
      authSessionId,
      role,
      connectedAt: new Date().toISOString(),
      lastAckSequence: lastSequence,
      lastSentSequence: sync.currentSequence
    };
    server.serializeAttachment(attachment);
    await this.scheduleAuthRevalidation();
    safeSocketSend(server, JSON.stringify({
      type: "room:sync",
      currentSequence: sync.currentSequence,
      oldestAvailableSequence: sync.oldestAvailableSequence,
      resetRequired: sync.resetRequired,
      room: sync.room,
      events: sync.events.map(wireEvent),
      snapshot: sync.snapshot
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async acceptMessage(request) {
    requireInternalRequest(request, "x-public-comment-verified", "COMMENT_VERIFICATION_REQUIRED");
    try {
      if (!this.env?.DB_V2) throw new AuthError(500, "DB_V2_NOT_CONFIGURED");
      const input = await readJson(request);
      const filterDecision = await evaluateCommentFilter(this.env.DB_V2, {
        organizationId: input.organizationId,
        liveSessionId: input.liveSessionId,
        message: input.message
      });
      if (filterDecision.action === "reject") {
        throw new AuthError(422, "CONTENT_REJECTED");
      }
      const result = await persistComment(this.env.DB_V2, { ...input, filterDecision });
      let event = null;
      if (!result.duplicate && result.comment.moderationState === "visible") {
        event = await findRealtimeEventForComment(this.env.DB_V2, {
          organizationId: input.organizationId,
          liveSessionId: input.liveSessionId,
          commentId: result.comment.id,
          eventType: "message:new"
        });
        if (!event) throw new AuthError(500, "REALTIME_EVENT_MISSING");
        await this.broadcastEvent(event);
      }
      if (!result.duplicate) {
        const task = scheduleAiForComment(this.env, {
          organizationId: input.organizationId,
          liveSessionId: input.liveSessionId,
          commentId: result.comment.id
        }).catch((error) => console.error("AI scheduling failed", String(error?.code || error?.name || "ERROR")));
        if (typeof this.state?.waitUntil === "function") this.state.waitUntil(task);
        else void task;
      }
      return authJson({
        ok: true,
        commentId: result.comment.id,
        comment: result.comment,
        moderationState: result.comment.moderationState,
        duplicate: result.duplicate,
        sequence: event?.sequence || null,
        filter: {
          action: result.comment.filter?.action || filterDecision.action || "allow",
          categories: [...new Set((result.duplicate
            ? (result.comment.filter?.matches || [])
            : (filterDecision.matches || [])).map((match) => match.category))]
        }
      }, result.duplicate ? 200 : result.comment.moderationState === "pending" ? 202 : 201);
    } catch (error) {
      if (isAuthError(error)) return authJson({ ok: false, error: error.code }, error.status, error.headers);
      const requestId = `req_${crypto.randomUUID().replaceAll("-", "")}`;
      console.error(requestId, error);
      return authJson({ ok: false, error: "INTERNAL_ERROR", requestId }, 500);
    }
  }

  async deliverEvent(request, closeAfter) {
    requireInternalRequest(request, "x-realtime-internal");
    const input = await readJson(request);
    const organizationId = String(input.organizationId || "");
    const sessionId = String(input.liveSessionId || "");
    const sequence = normalizeSequence(input.sequence);
    if (!organizationId || !sessionId || sequence < 1) {
      return authJson({ ok: false, error: "REALTIME_EVENT_INVALID" }, 400);
    }
    const event = await getRealtimeEvent(this.env.DB_V2, organizationId, sessionId, sequence);
    if (!event) return authJson({ ok: false, error: "REALTIME_EVENT_NOT_FOUND" }, 404);
    let delivered = 0;
    try {
      delivered = await this.broadcastEvent(event);
    } finally {
      if (closeAfter) this.closeAllSockets(1000, "session closed");
    }
    return authJson({ ok: true, sequence: event.sequence, delivered });
  }

  async broadcastEvent(event) {
    if (typeof this.state?.getWebSockets !== "function") {
      this.broadcast(event.payload);
      return 1;
    }
    const sockets = this.state.getWebSockets();
    const authorized = await this.authorizedAuthSessions(sockets);
    const message = JSON.stringify(wireEvent(event));
    let delivered = 0;
    for (const socket of sockets) {
      const attachment = safeAttachment(socket);
      const currentAuth = attachment.authSessionId ? authorized.get(attachment.authSessionId) : null;
      if (!currentAuth
          || currentAuth.organizationId !== attachment.organizationId
          || currentAuth.userId !== attachment.userId
          || currentAuth.role !== attachment.role) {
        safeClose(socket, 4001, "authorization revoked");
        continue;
      }
      if (attachment.sessionId && attachment.sessionId !== event.payload?.liveSessionId && attachment.sessionId !== event.liveSessionId) {
        continue;
      }
      if (Number(attachment.lastSentSequence || 0) >= event.sequence) continue;
      if (!safeSocketSend(socket, message)) continue;
      socket.serializeAttachment({ ...attachment, lastSentSequence: event.sequence });
      delivered += 1;
    }
    return delivered;
  }

  async alarm() {
    if (typeof this.state?.getWebSockets !== "function") return;
    const sockets = this.state.getWebSockets();
    if (!sockets.length) return;
    const authorized = await this.authorizedAuthSessions(sockets);
    for (const socket of sockets) {
      const attachment = safeAttachment(socket);
      const currentAuth = attachment.authSessionId ? authorized.get(attachment.authSessionId) : null;
      if (!currentAuth
          || currentAuth.organizationId !== attachment.organizationId
          || currentAuth.userId !== attachment.userId
          || currentAuth.role !== attachment.role) {
        safeClose(socket, 4001, "authorization revoked");
      }
    }
    if (this.state.getWebSockets().length) await this.scheduleAuthRevalidation();
  }

  async scheduleAuthRevalidation() {
    if (typeof this.state?.storage?.setAlarm !== "function") return;
    await this.state.storage.setAlarm(Date.now() + AUTH_REVALIDATION_INTERVAL_MS);
  }

  async authorizedAuthSessions(sockets) {
    const ids = [...new Set(sockets.map((socket) => safeAttachment(socket).authSessionId).filter(Boolean))];
    if (!ids.length) return new Map();
    const nowIso = new Date().toISOString();
    const authorized = new Map();
    for (let offset = 0; offset < ids.length; offset += AUTH_REVALIDATION_BATCH_SIZE) {
      const chunk = ids.slice(offset, offset + AUTH_REVALIDATION_BATCH_SIZE);
      const placeholders = chunk.map((_, index) => `?${index + 2}`).join(", ");
      const result = await this.env.DB_V2.prepare(
        `SELECT s.id, s.organization_id, s.user_id, m.role
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         JOIN organizations o ON o.id = s.organization_id
         JOIN organization_members m
           ON m.organization_id = s.organization_id AND m.user_id = s.user_id
         WHERE s.id IN (${placeholders})
           AND s.revoked_at IS NULL
           AND s.idle_expires_at > ?1 AND s.absolute_expires_at > ?1
           AND u.status = 'active' AND o.status = 'active' AND m.status = 'active'`
      ).bind(nowIso, ...chunk).all();
      for (const row of result.results || []) {
        authorized.set(row.id, {
          organizationId: row.organization_id,
          userId: row.user_id,
          role: row.role
        });
      }
    }
    return authorized;
  }

  broadcast(payload) {
    if (typeof this.state?.getWebSockets !== "function") return 0;
    const serialized = JSON.stringify(payload);
    let delivered = 0;
    for (const socket of this.state.getWebSockets()) {
      if (safeSocketSend(socket, serialized)) delivered += 1;
    }
    return delivered;
  }

  webSocketMessage(socket, message) {
    const size = typeof message === "string"
      ? new TextEncoder().encode(message).byteLength
      : Number(message?.byteLength || 0);
    if (size > MAX_CLIENT_FRAME_BYTES) {
      safeClose(socket, 1009, "message too large");
      return;
    }
    if (message === "ping") {
      safeSocketSend(socket, "pong");
      return;
    }
    if (typeof message !== "string") return;
    let input;
    try { input = JSON.parse(message); } catch { return; }
    if (input?.type !== "ack") return;
    const sequence = normalizeSequence(input.sequence);
    const attachment = safeAttachment(socket);
    if (sequence < Number(attachment.lastAckSequence || 0)) return;
    if (sequence > Number(attachment.lastSentSequence || 0)) return;
    socket.serializeAttachment({ ...attachment, lastAckSequence: sequence });
  }

  webSocketClose(socket, code, reason) {
    safeClose(socket, code, reason);
  }

  webSocketError(socket) {
    safeClose(socket, 1011, "websocket error");
  }

  closeAllSockets(code, reason) {
    for (const socket of this.state.getWebSockets()) safeClose(socket, code, reason);
  }
}

function wireEvent(event) {
  return {
    type: "realtime:event",
    sequence: event.sequence,
    eventType: event.type,
    event: event.payload,
    createdAt: event.createdAt
  };
}

function requireInternalRequest(request, header, code = "REALTIME_INTERNAL_REQUIRED") {
  if (request.headers.get(header) !== "true") throw new AuthError(401, code);
}

function normalizeSequence(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function safeAttachment(socket) {
  try { return socket.deserializeAttachment() || {}; } catch { return {}; }
}

function safeSocketSend(socket, payload) {
  try {
    socket.send(payload);
    return true;
  } catch {
    safeClose(socket, 1011, "send failed");
    return false;
  }
}

function safeClose(socket, code, reason) {
  try { socket.close(code, String(reason || "").slice(0, 120)); } catch {}
}

async function readJson(request) {
  try { return await request.json(); } catch { throw new AuthError(400, "INVALID_JSON"); }
}
