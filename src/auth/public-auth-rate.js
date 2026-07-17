import { AuthError } from "./errors.js";
import { buildRateLimitKey, checkRateLimit } from "./rate-limit.js";

const RECIPIENT_LIMIT = 5;
const IP_LIMIT = 20;

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
  if (!edge.success) throw rateLimited(new Date());

  const now = new Date();
  const windowStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const recipientKey = await buildRateLimitKey(email, pepper, "recipient");
  const ipKey = await buildRateLimitKey(ip, pepper, "request-ip");
  const recipientCount = await increment(env.DB_V2, "recipient_email", recipientKey, windowStart, now.toISOString());
  const ipCount = await increment(env.DB_V2, "request_ip", ipKey, windowStart, now.toISOString());
  if (recipientCount > RECIPIENT_LIMIT || ipCount > IP_LIMIT) throw rateLimited(now);
  return { recipientCount, ipCount };
}

async function increment(db, scope, keyHash, windowStart, updatedAt) {
  const row = await db.prepare(
    `INSERT INTO auth_public_counters (scope, key_hash, window_start, count, updated_at)
     VALUES (?1, ?2, ?3, 1, ?4)
     ON CONFLICT(scope, key_hash, window_start)
     DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
     RETURNING count`
  ).bind(scope, keyHash, windowStart, updatedAt).first();
  return Number(row?.count || 0);
}

function rateLimited(now) {
  const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const retryAfter = Math.max(60, Math.ceil((nextUtcDay - now.getTime()) / 1000));
  return new AuthError(429, "RATE_LIMITED", { headers: { "retry-after": String(retryAfter) } });
}
