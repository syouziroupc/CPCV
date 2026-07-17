const baseUrl = String(process.env.CPCV_LOCAL_BASE_URL || "http://localhost:8787").replace(/\/$/, "");
const loginId = String(process.env.CPCV_LOCAL_LOGIN_ID || "");
const password = String(process.env.CPCV_LOCAL_PASSWORD || "");
if (!loginId || !password) {
  console.error("Set CPCV_LOCAL_LOGIN_ID and CPCV_LOCAL_PASSWORD before running the local Stage 4 smoke test.");
  process.exit(2);
}

class CookieJar {
  constructor() { this.cookies = new Map(); }
  absorb(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const first = String(value).split(";", 1)[0];
      const separator = first.indexOf("=");
      if (separator < 1) continue;
      const name = first.slice(0, separator);
      const cookieValue = first.slice(separator + 1);
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
  }
  header() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "); }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const jar = options.jar;
  let body;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  if (options.origin !== false) headers.set("origin", baseUrl);
  if (jar?.header()) headers.set("cookie", jar.header());
  if (options.csrfToken) headers.set("x-csrf-token", options.csrfToken);
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body,
    redirect: "manual"
  });
  jar?.absorb(response.headers);
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${text.slice(0, 500)}`);
  }
  return { response, parsed, text };
}

const authJar = new CookieJar();
const participantJar = new CookieJar();
let sessionId = "";
let publicCode = "";
let commentId = "";

try {
  const login = await request("/api/auth/login", {
    method: "POST",
    jar: authJar,
    body: { loginId, password }
  });
  let csrfToken = login.parsed.csrfToken;

  const current = await request("/api/auth/session", { jar: authJar });
  csrfToken = current.parsed.csrfToken || csrfToken;
  await request("/api/org", { jar: authJar });

  const created = await request("/api/private/sessions", {
    method: "POST",
    jar: authJar,
    csrfToken,
    body: { title: `Stage 4 local smoke ${new Date().toISOString()}` }
  });
  sessionId = created.parsed.sessionId;
  publicCode = created.parsed.publicCode;

  await request(`/api/private/sessions/${encodeURIComponent(sessionId)}`, { jar: authJar });
  await request(`/api/public/sessions/${encodeURIComponent(publicCode)}`, {
    jar: participantJar,
    origin: false
  });

  const idempotencyKey = `smoke-${crypto.randomUUID()}`;
  const postBody = {
    nickname: "Local smoke",
    message: "Stage 4 end-to-end smoke comment",
    idempotencyKey
  };
  const firstPost = await request(`/api/public/sessions/${encodeURIComponent(publicCode)}/messages`, {
    method: "POST",
    jar: participantJar,
    origin: false,
    body: postBody
  });
  commentId = firstPost.parsed.commentId;
  const repeatedPost = await request(`/api/public/sessions/${encodeURIComponent(publicCode)}/messages`, {
    method: "POST",
    jar: participantJar,
    origin: false,
    body: postBody
  });
  if (repeatedPost.parsed.commentId !== commentId || repeatedPost.parsed.duplicate !== true) {
    throw new Error("Idempotent replay did not return the original comment.");
  }

  const history = await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments?limit=20`, {
    jar: authJar
  });
  if (!history.parsed.comments?.some((comment) => comment.id === commentId)) {
    throw new Error("Saved comment was not returned by the authenticated history API.");
  }

  const exported = await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/export`, {
    jar: authJar,
    headers: { accept: "text/csv" }
  });
  if (!exported.text.includes(commentId) || !exported.text.includes("Stage 4 end-to-end smoke comment")) {
    throw new Error("Saved comment was not returned by the CSV export.");
  }

  await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/settings`, {
    method: "POST",
    jar: authJar,
    csrfToken,
    body: { status: "ended" }
  });
  await request("/api/auth/logout", {
    method: "POST",
    jar: authJar,
    csrfToken,
    body: {}
  });

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    sessionId,
    publicCode,
    commentId,
    idempotentReplayVerified: true,
    historyVerified: true,
    csvVerified: true,
    sessionEndVerified: true,
    logoutVerified: true
  }, null, 2));
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
