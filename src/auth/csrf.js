import { AuthError } from "./errors.js";
import { constantTimeEqual, hashToken } from "./passwords.js";
import { getSessionInternal } from "./sessions.js";
import { isValidSecondaryCsrfToken } from "./csrf-tokens.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isUnsafeMethod(method) {
  return UNSAFE_METHODS.has(String(method || "").toUpperCase());
}

export function requireSameOrigin(request, env) {
  const expectedOrigin = normalizeConfiguredOrigin(env?.AUTH_ORIGIN);
  const suppliedOrigin = request.headers.get("origin") || "";
  if (!suppliedOrigin || suppliedOrigin.includes(",") || suppliedOrigin !== expectedOrigin) {
    throw new AuthError(403, "ORIGIN_FORBIDDEN");
  }
  return suppliedOrigin;
}

export function requireJsonContentType(request, options = {}) {
  if (options.allowEmptyLogout && request.method === "POST" && Number(request.headers.get("content-length") || 0) === 0) {
    return;
  }
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new AuthError(415, "JSON_CONTENT_TYPE_REQUIRED");
  }
}

export async function requireCsrf(request, env, auth) {
  if (!isUnsafeMethod(request.method)) return;
  const suppliedToken = request.headers.get("x-csrf-token") || "";
  if (!suppliedToken) throw new AuthError(403, "CSRF_REQUIRED");
  const csrfTokenHash = getSessionInternal(auth)?.csrfTokenHash || "";
  if (!csrfTokenHash) throw new AuthError(403, "CSRF_INVALID");
  const suppliedHash = await hashToken(suppliedToken);
  if (constantTimeEqual(suppliedHash, csrfTokenHash)) return true;
  if (await isValidSecondaryCsrfToken(env?.DB_V2, auth.sessionId, suppliedHash)) return true;
  throw new AuthError(403, "CSRF_INVALID");
}

export async function requireUnsafeRequestProtection(request, env, auth, options = {}) {
  if (!isUnsafeMethod(request.method)) return;
  requireSameOrigin(request, env);
  requireJsonContentType(request, options);
  await requireCsrf(request, env, auth);
}

function normalizeConfiguredOrigin(value) {
  if (typeof value !== "string" || !value) throw new AuthError(500, "AUTH_ORIGIN_NOT_CONFIGURED");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AuthError(500, "AUTH_ORIGIN_INVALID");
  }
  if (parsed.origin !== value || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new AuthError(500, "AUTH_ORIGIN_INVALID");
  }
  return parsed.origin;
}
