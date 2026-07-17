import { createToken } from "../auth/passwords.js";

export function participantCookieName(publicCode) {
  return `cpcv_p_${String(publicCode || "").toLowerCase()}`;
}

export function getOrCreateParticipantToken(request, env, publicCode) {
  const name = participantCookieName(publicCode);
  const existing = parseCookies(request.headers.get("cookie") || "").get(name);
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) {
    return { token: existing, setCookie: "" };
  }
  const token = createToken();
  return { token, setCookie: serializeParticipantCookie(request, env, name, token, publicCode) };
}

function serializeParticipantCookie(request, env, name, token, publicCode) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" || !["local", "test"].includes(String(env?.APP_ENV || "").toLowerCase());
  const attributes = [
    `${name}=${encodeURIComponent(token)}`,
    `Path=/api/public/sessions/${String(publicCode).toUpperCase()}`,
    "Max-Age=2592000",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || cookies.has(name)) continue;
    try { cookies.set(name, decodeURIComponent(value)); } catch { cookies.set(name, value); }
  }
  return cookies;
}
