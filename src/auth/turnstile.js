import { AuthError } from "./errors.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function requireTurnstile(request, env, token) {
  if (String(env?.APP_ENV || "").toLowerCase() !== "production"
      && String(env?.TURNSTILE_TEST_BYPASS || "") === "1") {
    if (!token) throw new AuthError(400, "TURNSTILE_REQUIRED");
    return { success: true, testBypass: true };
  }
  if (typeof token !== "string" || !token || token.length > 2048) {
    throw new AuthError(400, "TURNSTILE_REQUIRED");
  }
  const secret = String(env?.TURNSTILE_SECRET_KEY || "");
  if (!secret) throw new AuthError(500, "TURNSTILE_NOT_CONFIGURED");
  const remoteIp = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || undefined;
  let response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: remoteIp,
        idempotency_key: crypto.randomUUID()
      }),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new AuthError(503, "TURNSTILE_UNAVAILABLE", { expose: true });
  }
  if (!response.ok) throw new AuthError(503, "TURNSTILE_UNAVAILABLE", { expose: true });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new AuthError(503, "TURNSTILE_UNAVAILABLE", { expose: true });
  }
  if (!result?.success) throw new AuthError(400, "TURNSTILE_INVALID");
  return result;
}
