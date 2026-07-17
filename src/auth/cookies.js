import { AuthError } from "./errors.js";

export const PRODUCTION_SESSION_COOKIE = "__Host-cpcv_session";
export const LOCAL_SESSION_COOKIE = "cpcv_session_dev";

export function parseCookies(headerValue) {
  const cookies = new Map();
  for (const segment of String(headerValue || "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    if (!name || cookies.has(name)) continue;
    const encodedValue = segment.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(encodedValue));
    } catch {
      cookies.set(name, encodedValue);
    }
  }
  return cookies;
}

export function sessionCookieName(request, env) {
  const appEnvironment = String(env?.APP_ENV || "production").toLowerCase();
  if (appEnvironment !== "local") return PRODUCTION_SESSION_COOKIE;
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!isLoopbackHostname(hostname)) {
    throw new AuthError(500, "LOCAL_COOKIE_FORBIDDEN");
  }
  return LOCAL_SESSION_COOKIE;
}

export function readSessionToken(request, env) {
  const name = sessionCookieName(request, env);
  return parseCookies(request.headers.get("cookie")).get(name) || "";
}

export function serializeSessionCookie(token, request, env, absoluteExpiresAt, now = new Date()) {
  if (typeof token !== "string" || !token) throw new TypeError("Session token is required.");
  const expiresAt = new Date(absoluteExpiresAt);
  if (!Number.isFinite(expiresAt.getTime())) throw new TypeError("A valid absolute expiry is required.");
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - new Date(now).getTime()) / 1000));
  return serializeCookie({
    name: sessionCookieName(request, env),
    value: token,
    secure: String(env?.APP_ENV || "production").toLowerCase() !== "local",
    maxAge,
    expiresAt
  });
}

export function serializeClearedSessionCookie(request, env) {
  return serializeCookie({
    name: sessionCookieName(request, env),
    value: "",
    secure: String(env?.APP_ENV || "production").toLowerCase() !== "local",
    maxAge: 0,
    expiresAt: new Date(0)
  });
}

function serializeCookie({ name, value, secure, maxAge, expiresAt }) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    `Expires=${expiresAt.toUTCString()}`
  ];
  if (secure) attributes.splice(2, 0, "Secure");
  return attributes.join("; ");
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
