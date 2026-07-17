import { AuthError } from "./errors.js";
import { hashToken } from "./passwords.js";

export async function buildRateLimitKey(value, pepper, prefix) {
  if (typeof pepper !== "string" || !pepper) {
    throw new AuthError(500, "AUTH_RATE_LIMIT_PEPPER_NOT_CONFIGURED");
  }
  const normalizedPrefix = String(prefix || "auth").replace(/[^a-z0-9:_-]/gi, "").slice(0, 32) || "auth";
  return `${normalizedPrefix}:${await hashToken(`${String(value)}\u0000${pepper}`)}`;
}

export async function checkRateLimit(limiter, key, options = {}) {
  if (!limiter || typeof limiter.limit !== "function") {
    return { success: false, unavailable: true };
  }
  try {
    const result = await limiter.limit({ key });
    return { success: Boolean(result?.success), unavailable: false };
  } catch (error) {
    if (typeof options.onFailure === "function") {
      try {
        await options.onFailure(error);
      } catch {
        // Audit failure must not hide the limiter outage.
      }
    }
    return { success: false, unavailable: true };
  }
}

export async function requireRateLimit(limiter, key, options = {}) {
  const result = await checkRateLimit(limiter, key, options);
  if (result.unavailable) throw new AuthError(503, "RATE_LIMIT_UNAVAILABLE", { expose: true });
  if (!result.success) throw new AuthError(429, "RATE_LIMITED");
  return result;
}
