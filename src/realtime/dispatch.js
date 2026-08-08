const REALTIME_RETRY_DELAYS_MS = Object.freeze([0, 100, 300]);
const RETRYABLE_RESPONSE_STATUSES = new Set([500, 502, 503, 504]);

export async function dispatchRealtimeEvent(env, sessionId, event, closeAfter = false) {
  if (!event || !env?.COMMENT_ROOM || !sessionId) return false;
  const dispatchType = String(event?.payload?.type || event?.type || "");
  const path = closeAfter
    ? "/close"
    : dispatchType === "settings:update"
      ? "/settings"
      : dispatchType === "message:clear"
        ? "/clear"
        : ["message:remove", "message:restore"].includes(dispatchType)
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
