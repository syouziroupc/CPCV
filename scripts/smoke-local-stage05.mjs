const baseUrl = String(process.env.CPCV_LOCAL_BASE_URL || "http://localhost:8787").replace(/\/$/, "");
const loginId = String(process.env.CPCV_LOCAL_LOGIN_ID || "");
const password = String(process.env.CPCV_LOCAL_PASSWORD || "");
if (!loginId || !password) {
  console.error("Set CPCV_LOCAL_LOGIN_ID and CPCV_LOCAL_PASSWORD before running the local Stage 5 smoke test.");
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

async function moderate(authJar, csrfToken, sessionId, comment, action, reason = undefined) {
  return request(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/${encodeURIComponent(comment.id)}/moderate`, {
    method: "POST",
    jar: authJar,
    csrfToken,
    body: {
      action,
      expectedUpdatedAt: comment.updatedAt,
      ...(reason === undefined ? {} : { reason })
    }
  });
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

  const created = await request("/api/private/sessions", {
    method: "POST",
    jar: authJar,
    csrfToken,
    body: {
      title: `Stage 5 local smoke ${new Date().toISOString()}`,
      moderationMode: "pre"
    }
  });
  sessionId = created.parsed.sessionId;
  publicCode = created.parsed.publicCode;
  if (created.parsed.session?.moderationMode !== "pre") throw new Error("Premoderation was not enabled on session creation.");

  const publicSession = await request(`/api/public/sessions/${encodeURIComponent(publicCode)}`, {
    jar: participantJar,
    origin: false
  });
  if (publicSession.parsed.requiresApproval !== true) throw new Error("Public session did not advertise premoderation.");

  const idempotencyKey = `stage5-${crypto.randomUUID()}`;
  const postBody = {
    nickname: "Stage 5 smoke",
    message: "Stage 5 moderation smoke comment",
    idempotencyKey
  };
  const firstPost = await request(`/api/public/sessions/${encodeURIComponent(publicCode)}/messages`, {
    method: "POST",
    jar: participantJar,
    origin: false,
    body: postBody
  });
  if (firstPost.response.status !== 202 || firstPost.parsed.moderationState !== "pending") {
    throw new Error("Premoderated post was not stored as pending.");
  }
  commentId = firstPost.parsed.commentId;

  const repeatedPost = await request(`/api/public/sessions/${encodeURIComponent(publicCode)}/messages`, {
    method: "POST",
    jar: participantJar,
    origin: false,
    body: postBody
  });
  if (repeatedPost.parsed.commentId !== commentId || repeatedPost.parsed.duplicate !== true) {
    throw new Error("Idempotent replay did not return the original pending comment.");
  }

  const pendingList = await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments?state=pending&limit=20`, { jar: authJar });
  let comment = pendingList.parsed.comments?.find((item) => item.id === commentId);
  if (!comment || comment.moderationState !== "pending") throw new Error("Pending comment was not returned by moderation history.");

  let action = await moderate(authJar, csrfToken, sessionId, comment, "approve");
  comment = action.parsed.comment;
  if (comment.moderationState !== "visible") throw new Error("Approve did not make the comment visible.");

  action = await moderate(authJar, csrfToken, sessionId, comment, "hide", "smoke hide");
  comment = action.parsed.comment;
  if (comment.moderationState !== "hidden") throw new Error("Hide did not retract the comment.");

  action = await moderate(authJar, csrfToken, sessionId, comment, "restore");
  comment = action.parsed.comment;
  if (comment.moderationState !== "visible") throw new Error("Hidden restore did not return the comment to visible.");

  action = await moderate(authJar, csrfToken, sessionId, comment, "delete", "smoke delete");
  comment = action.parsed.comment;
  if (comment.moderationState !== "deleted") throw new Error("Delete did not logically delete the comment.");

  action = await moderate(authJar, csrfToken, sessionId, comment, "restore");
  comment = action.parsed.comment;
  if (comment.moderationState !== "hidden") throw new Error("Deleted restore did not return to the safe-side hidden state.");

  const moderationHistory = await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/${encodeURIComponent(commentId)}/moderation`, { jar: authJar });
  if (!Array.isArray(moderationHistory.parsed.actions) || moderationHistory.parsed.actions.length !== 5) {
    throw new Error("Moderation action history is incomplete.");
  }

  const exported = await request(`/api/private/sessions/${encodeURIComponent(sessionId)}/comments/export`, {
    jar: authJar,
    headers: { accept: "text/csv" }
  });
  if (!exported.text.includes(commentId) || !exported.text.includes("Stage 5 moderation smoke comment")) {
    throw new Error("Moderated comment was not returned by CSV export.");
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
    premoderationVerified: true,
    idempotentReplayVerified: true,
    approveVerified: true,
    hideVerified: true,
    visibleRestoreVerified: true,
    deleteVerified: true,
    safeSideRestoreVerified: true,
    moderationHistoryVerified: true,
    csvVerified: true,
    sessionEndVerified: true,
    logoutVerified: true
  }, null, 2));
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
