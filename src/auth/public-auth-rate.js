import { AuthError } from "./errors.js";
import { buildRateLimitKey, checkRateLimit } from "./rate-limit.js";

const RECIPIENT_LIMIT = 5;
const IP_LIMIT = 20;
const EDGE_RETRY_AFTER_SECONDS = 60;

export async function consumePublicEmailRateLimit(request, env, email, purpose) {
  const production = String(env?.APP_ENV || "").toLowerCase() === "production";
  const pepper = String(env?.AUTH_RATE_LIMIT_PEPPER || "");
  const cloudflareIp = request.headers.get("cf-connecting-ip") || "";
  if (production && !cloudflareIp) throw new AuthError(500, "AUTH_CLIENT_IP_UNAVAILABLE");
  if (production && typeof env?.AUTH_PUBLIC_EMAIL_LIMITER?.limit !== "function") {
    throw new AuthError(500, "AUTH_PUBLIC_EMAIL_LIMITER_NOT_CONFIGURED");
  }
  const ip = cloudflareIp
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local-unknown";
  const edgeKey = await buildRateLimitKey(`${purpose}:${ip}`, pepper, "public-email");
  const edge = await checkRateLimit(env?.AUTH_PUBLIC_EMAIL_LIMITER, edgeKey);
  if (edge.unavailable) {
    throw new AuthError(503, "RATE_LIMIT_UNAVAILABLE", {
      headers: { "retry-after": String(EDGE_RETRY_AFTER_SECONDS) },
      expose: true
    });
  }
  if (!edge.success) throw edgeRateLimited();

  const now = new Date();
  const nowIso = now.toISOString();
  const windowStart = `${nowIso.slice(0, 10)}T00:00:00.000Z`;
  const recipientKey = await buildRateLimitKey(email, pepper, "recipient");
  const ipKey = await buildRateLimitKey(ip, pepper, "request-ip");

  await env.DB_V2.batch([
    incrementStatement(env.DB_V2, "recipient_email", recipientKey, windowStart, nowIso),
    incrementStatement(env.DB_V2, "request_ip", ipKey, windowStart, nowIso)
  ]);
  const counts = await env.DB_V2.prepare(
    `SELECT
       COALESCE((SELECT count FROM auth_public_counters
                 WHERE scope = 'recipient_email' AND key_hash = ?1 AND window_start = ?3), 0) AS recipient_count,
       COALESCE((SELECT count FROM auth_public_counters
                 WHERE scope = 'request_ip' AND key_hash = ?2 AND window_start = ?3), 0) AS ip_count`
  ).bind(recipientKey, ipKey, windowStart).first();
  const recipientCount = Number(counts?.recipient_count || 0);
  const ipCount = Number(counts?.ip_count || 0);
  if (recipientCount > RECIPIENT_LIMIT || ipCount > IP_LIMIT) throw dailyRateLimited(now);
  return { recipientCount, ipCount };
}

function incrementStatement(db, scope, keyHash, windowStart, updatedAt) {
  return db.prepare(
    `INSERT INTO auth_public_counters (scope, key_hash, window_start, count, updated_at)
     VALUES (?1, ?2, ?3, 1, ?4)
     ON CONFLICT(scope, key_hash, window_start)
     DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
  ).bind(scope, keyHash, windowStart, updatedAt);
}

function edgeRateLimited() {
  return new AuthError(429, "RATE_LIMITED", {
    headers: { "retry-after": String(EDGE_RETRY_AFTER_SECONDS) }
  });
}

function dailyRateLimited(now) {
  const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const retryAfter = Math.max(60, Math.ceil((nextUtcDay - now.getTime()) / 1000));
  return new AuthError(429, "RATE_LIMITED", { headers: { "retry-after": String(retryAfter) } });
}
