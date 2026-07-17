import { createToken, hashToken } from "./passwords.js";

export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const AUTH_SESSION_INTERNAL = Symbol("cpcv.auth.session.internal");

export async function createSessionMaterial(now = new Date()) {
  const createdAt = new Date(now);
  if (!Number.isFinite(createdAt.getTime())) throw new TypeError("Invalid session creation time.");
  const rawSessionToken = createToken();
  const rawCsrfToken = createToken();
  const absoluteExpiresAt = new Date(createdAt.getTime() + SESSION_ABSOLUTE_MS);
  const idleExpiresAt = new Date(Math.min(
    createdAt.getTime() + SESSION_IDLE_MS,
    absoluteExpiresAt.getTime()
  ));
  return {
    rawSessionToken,
    rawCsrfToken,
    tokenHash: await hashToken(rawSessionToken),
    csrfTokenHash: await hashToken(rawCsrfToken),
    createdAt: createdAt.toISOString(),
    lastSeenAt: createdAt.toISOString(),
    idleExpiresAt: idleExpiresAt.toISOString(),
    absoluteExpiresAt: absoluteExpiresAt.toISOString()
  };
}

export function shouldRefreshSession(lastSeenAt, now = new Date()) {
  const lastSeen = Date.parse(lastSeenAt);
  const current = new Date(now).getTime();
  return Number.isFinite(lastSeen)
    && Number.isFinite(current)
    && current - lastSeen >= SESSION_REFRESH_INTERVAL_MS;
}

export function refreshedIdleExpiry(absoluteExpiresAt, now = new Date()) {
  const absolute = Date.parse(absoluteExpiresAt);
  const current = new Date(now).getTime();
  if (!Number.isFinite(absolute) || !Number.isFinite(current) || absolute <= current) return "";
  return new Date(Math.min(current + SESSION_IDLE_MS, absolute)).toISOString();
}

export function attachSessionInternal(auth, internal) {
  Object.defineProperty(auth, AUTH_SESSION_INTERNAL, {
    value: Object.freeze({ ...internal }),
    enumerable: false,
    configurable: false,
    writable: false
  });
  return auth;
}

export function getSessionInternal(auth) {
  return auth?.[AUTH_SESSION_INTERNAL] || null;
}
