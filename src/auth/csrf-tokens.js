import { AuthError } from "./errors.js";
import { createToken, hashToken } from "./passwords.js";
import { makeId } from "./request.js";

const CSRF_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SECONDARY_TOKENS_PER_SESSION = 8;

export async function issueSessionCsrfToken(db, sessionId, absoluteExpiresAt, now = new Date()) {
  const createdAt = new Date(now);
  const createdMs = createdAt.getTime();
  const absoluteMs = Date.parse(absoluteExpiresAt || "");
  if (!Number.isFinite(createdMs) || !Number.isFinite(absoluteMs) || absoluteMs <= createdMs) {
    throw new AuthError(401, "AUTH_REQUIRED");
  }
  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const createdAtIso = createdAt.toISOString();
  const expiresAt = new Date(Math.min(createdMs + CSRF_TOKEN_TTL_MS, absoluteMs)).toISOString();
  const id = makeId("csrf");

  const results = await db.batch([
    db.prepare(
      `DELETE FROM auth_session_csrf_tokens
       WHERE auth_session_id = ?1 AND expires_at <= ?2`
    ).bind(sessionId, createdAtIso),
    db.prepare(
      `INSERT INTO auth_session_csrf_tokens (
         id, auth_session_id, token_hash, created_at, expires_at
       )
       SELECT ?1, id, ?2, ?3, ?4
       FROM auth_sessions
       WHERE id = ?5 AND revoked_at IS NULL AND absolute_expires_at > ?3`
    ).bind(id, tokenHash, createdAtIso, expiresAt, sessionId),
    db.prepare(
      `DELETE FROM auth_session_csrf_tokens
       WHERE id IN (
         SELECT id FROM auth_session_csrf_tokens
         WHERE auth_session_id = ?1
         ORDER BY created_at DESC, id DESC
         LIMIT -1 OFFSET ?2
       )`
    ).bind(sessionId, MAX_SECONDARY_TOKENS_PER_SESSION)
  ]);
  if (changesOf(results?.[1]) !== 1) throw new AuthError(401, "AUTH_REQUIRED");
  return { rawToken, expiresAt };
}

export async function isValidSecondaryCsrfToken(db, sessionId, tokenHash, now = new Date()) {
  if (!db || typeof db.prepare !== "function") return false;
  const nowIso = new Date(now).toISOString();
  const row = await db.prepare(
    `SELECT 1 AS valid
     FROM auth_session_csrf_tokens
     WHERE auth_session_id = ?1 AND token_hash = ?2 AND expires_at > ?3
     LIMIT 1`
  ).bind(sessionId, tokenHash, nowIso).first();
  return Boolean(row?.valid);
}

export async function pruneExpiredCsrfTokens(db, options = {}) {
  const nowIso = new Date(options.now ?? Date.now()).toISOString();
  const limit = normalizeLimit(options.limit);
  const result = await db.prepare(
    `DELETE FROM auth_session_csrf_tokens
     WHERE id IN (
       SELECT id FROM auth_session_csrf_tokens
       WHERE expires_at <= ?1
       ORDER BY expires_at ASC, id ASC
       LIMIT ?2
     )`
  ).bind(nowIso, limit).run();
  return { csrfTokensDeleted: changesOf(result), limit };
}

function normalizeLimit(value) {
  const number = Number(value ?? 500);
  return Number.isInteger(number) && number >= 1 && number <= 5000 ? number : 500;
}

function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}
