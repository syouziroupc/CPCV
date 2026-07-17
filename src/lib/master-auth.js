import { constantTimeEqual, createToken, hashToken } from "./password.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireMasterToken(inputToken, env) {
  if (!env.MASTER_TOKEN) throw new HttpError(500, "MASTER_TOKEN_NOT_CONFIGURED");
  if (!inputToken) throw new HttpError(401, "MASTER_TOKEN_REQUIRED");
  if (!constantTimeEqual(inputToken, env.MASTER_TOKEN)) throw new HttpError(401, "INVALID_MASTER_TOKEN");
}

export async function createMasterSession(env) {
  const token = createToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO master_sessions (id, session_token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?)`
  ).bind(`ms_${crypto.randomUUID().replaceAll("-", "")}`, await hashToken(token), now.toISOString(), expiresAt).run();
  return { token, expiresAt };
}

export async function requireMasterSession(request, env) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, "MASTER_SESSION_REQUIRED");
  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT id, expires_at, revoked_at
     FROM master_sessions
     WHERE session_token_hash = ?
     LIMIT 1`
  ).bind(tokenHash).first();
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
    throw new HttpError(401, "INVALID_MASTER_SESSION");
  }
  return { id: row.id, tokenHash };
}

export async function revokeMasterSession(request, env) {
  const token = bearerToken(request);
  if (!token) return;
  await env.DB.prepare(
    `UPDATE master_sessions SET revoked_at = ? WHERE session_token_hash = ? AND revoked_at IS NULL`
  ).bind(new Date().toISOString(), await hashToken(token)).run();
}

export function bearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
