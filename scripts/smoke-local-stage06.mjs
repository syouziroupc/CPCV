import { WebSocket } from "ws";

const baseUrl = String(process.env.CPCV_LOCAL_BASE_URL || "http://localhost:8787").replace(/\/$/, "");
const loginId = String(process.env.CPCV_LOCAL_LOGIN_ID || "");
const password = String(process.env.CPCV_LOCAL_PASSWORD || "");
if (!loginId || !password) {
  console.error("Set CPCV_LOCAL_LOGIN_ID and CPCV_LOCAL_PASSWORD before running the local Stage 6 smoke test.");
  process.exit(2);
}

class CookieJar {
  constructor() { this.cookies = new Map(); }
  absorb(headers) {
    const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const first = String(value).split(";", 1)[0];
      const separator = first.indexOf("=");
      if (separator < 1) continue;
      const name = first.slice(0, separator);
      const cookieValue = first.slice(separator + 1);
      if (cookieValue) this.cookies.set(name, cookieValue); else this.cookies.delete(name);
    }
  }
  header() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "); }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.origin !== false) headers.set("origin", baseUrl);
  if (options.jar?.header()) headers.set("cookie", options.jar.header());
  if (options.csrfToken) headers.set("x-csrf-token", options.csrfToken);
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET", headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual"
  });
  options.jar?.absorb(response.headers);
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${text.slice(0, 500)}`);
  return { response, parsed, text };
}

async function issueTicket(jar, csrfToken, sessionId, lastSequence) {
  const result = await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/live-ticket`, {
    method: "POST", jar, csrfToken, body: { lastSequence }
  });
  if (!result.parsed.ticket) throw new Error("Realtime ticket was not issued.");
  return result.parsed.ticket;
}

function connectSocket(jar, sessionId, ticket) {
  const wsUrl = new URL(`/api/private/sessions/${encodeURIComponent(sessionId)}/live`, baseUrl);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("ticket", ticket);
  const socket = new WebSocket(wsUrl, {
    headers: { Cookie: jar.header(), Origin: baseUrl }
  });
  const queue = [];
  const waiters = [];
  socket.on("message", (data) => {
    let value;
    try { value = JSON.parse(String(data)); } catch { value = String(data); }
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(value));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    } else queue.push(value);
  });
  function waitFor(predicate, timeoutMs = 10_000) {
    const index = queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const position = waiters.indexOf(waiter);
        if (position >= 0) waiters.splice(position, 1);
        reject(new Error("Timed out waiting for WebSocket message."));
      }, timeoutMs);
      waiters.push(waiter);
    });
  }
  const opened = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
    socket.once("unexpected-response", (_request, response) => reject(new Error(`WebSocket upgrade returned ${response.statusCode}`)));
  });
  return { socket, opened, waitFor };
}

async function expectTicketReuseRejected(jar, sessionId, ticket) {
  const wsUrl = new URL(`/api/private/sessions/${encodeURIComponent(sessionId)}/live`, baseUrl);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("ticket", ticket);
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, { headers: { Cookie: jar.header(), Origin: baseUrl } });
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error("Reused ticket was not rejected.")); }, 5000);
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      if (response.statusCode !== 401) reject(new Error(`Reused ticket returned ${response.statusCode}, expected 401.`));
      else resolve();
    });
    socket.once("open", () => { clearTimeout(timeout); socket.terminate(); reject(new Error("Reused ticket opened a WebSocket.")); });
    socket.once("error", () => {});
  });
}

const authJar = new CookieJar();
const participantJar = new CookieJar();
let sessionId = "";
try {
  const login = await request("/api/auth/login", { method: "POST", jar: authJar, body: { loginId, password } });
  let csrfToken = login.parsed.csrfToken;
  const current = await request("/api/auth/session", { jar: authJar });
  csrfToken = current.parsed.csrfToken || csrfToken;

  const created = await request("/api/private/sessions", {
    method: "POST", jar: authJar, csrfToken,
    body: { title: `Stage 6 local smoke ${new Date().toISOString()}`, moderationMode: "off" }
  });
  sessionId = created.parsed.sessionId;
  const publicCode = created.parsed.publicCode;

  const firstTicket = await issueTicket(authJar, csrfToken, sessionId, 0);
  const live = connectSocket(authJar, sessionId, firstTicket);
  await live.opened;
  const initialSync = await live.waitFor((value) => value?.type === "room:sync");
  if (initialSync.currentSequence !== 0 || initialSync.resetRequired !== false) throw new Error("Initial realtime sync is invalid.");

  const post = await request(`/api/public/sessions/${encodeURIComponent(publicCode)}/messages`, {
    method: "POST", jar: participantJar, origin: false,
    body: { nickname: "Stage 6 smoke", message: "first realtime event", idempotencyKey: `stage6-${crypto.randomUUID()}` }
  });
  const firstEvent = await live.waitFor((value) => value?.type === "realtime:event" && value?.eventType === "message:new");
  if (firstEvent.sequence !== post.parsed.sequence || firstEvent.event?.id !== post.parsed.commentId) throw new Error("First realtime event did not match the persisted comment.");
  live.socket.send(JSON.stringify({ type: "ack", sequence: firstEvent.sequence }));
  live.socket.terminate();
  await waitForSocketClosed(live.socket);

  await expectTicketReuseRejected(authJar, sessionId, firstTicket);

  const settings = await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/settings`, {
    method: "POST", jar: authJar, csrfToken, body: { commentsVisible: false }
  });
  if (!settings.parsed.sequence) throw new Error("Disconnected settings event did not receive a sequence.");

  const reconnectTicket = await issueTicket(authJar, csrfToken, sessionId, firstEvent.sequence);
  const resumed = connectSocket(authJar, sessionId, reconnectTicket);
  await resumed.opened;
  const resumedSync = await resumed.waitFor((value) => value?.type === "room:sync");
  const catchUp = resumedSync.events || [];
  if (resumedSync.resetRequired || catchUp.length !== 1 || catchUp[0]?.eventType !== "settings:update") {
    throw new Error(`Reconnect catch-up is invalid: ${JSON.stringify(resumedSync)}`);
  }

  const clear = await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/clear`, {
    method: "POST", jar: authJar, csrfToken, body: {}
  });
  const clearEvent = await resumed.waitFor((value) => value?.type === "realtime:event" && value?.eventType === "message:clear");
  if (clearEvent.sequence !== clear.parsed.sequence) throw new Error("Clear event sequence mismatch.");

  await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/settings`, {
    method: "POST", jar: authJar, csrfToken, body: { status: "ended" }
  });
  const closedEvent = await resumed.waitFor((value) => value?.type === "realtime:event" && value?.eventType === "room:closed");
  if (!closedEvent.sequence) throw new Error("Room closure was not sequenced.");
  resumed.socket.close(1000, "client acknowledged room closure");
  await waitForSocketClosed(resumed.socket);

  await request("/api/auth/logout", { method: "POST", jar: authJar, csrfToken, body: {} });
  console.log(JSON.stringify({
    ok: true, baseUrl, sessionId, publicCode,
    oneTimeTicketVerified: true,
    persistedSequenceVerified: true,
    catchUpVerified: true,
    duplicateTicketRejected: true,
    clearWatermarkVerified: true,
    roomClosureVerified: true,
    logoutVerified: true
  }, null, 2));
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}

function waitForSocketClosed(socket, timeoutMs = 2_000) {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    socket.once("close", () => { clearTimeout(timer); resolve(); });
  });
}

function onceClosed(socket, timeoutMs = 10_000) {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { socket.terminate(); } catch {} reject(new Error("WebSocket did not close.")); }, timeoutMs);
    socket.once("close", () => { clearTimeout(timer); resolve(); });
  });
}
