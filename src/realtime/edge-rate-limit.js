import { AuthError } from "../auth/errors.js";

export async function enforcePublicCommentEdgeLimit(request, env, publicCode) {
  return enforcePublicEdgeLimit(request, env, publicCode, "comment");
}

export async function enforcePublicUnderstandingEdgeLimit(request, env, publicCode) {
  return enforcePublicEdgeLimit(request, env, publicCode, "understanding");
}

async function enforcePublicEdgeLimit(request, env, publicCode, scope) {
  const limiter = env?.PUBLIC_COMMENT_RATE_LIMITER;
  const production = String(env?.APP_ENV || "").toLowerCase() === "production";
  if (!limiter || typeof limiter.limit !== "function") {
    if (production) throw new AuthError(500, "PUBLIC_COMMENT_RATE_LIMITER_NOT_CONFIGURED");
    return { success: true, skipped: true };
  }
  const pepper = String(env?.PUBLIC_RATE_LIMIT_PEPPER || env?.AUTH_RATE_LIMIT_PEPPER || "");
  if (!pepper) {
    if (production) throw new AuthError(500, "PUBLIC_RATE_LIMIT_PEPPER_NOT_CONFIGURED");
    return { success: true, skipped: true };
  }
  const address = String(request.headers.get("cf-connecting-ip") || "local").trim();
  const key = await hmacHex(pepper, `${publicCode}\n${scope}\n${address}`);
  const result = await limiter.limit({ key });
  if (!result?.success) throw new AuthError(429, "RATE_LIMITED");
  return result;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
