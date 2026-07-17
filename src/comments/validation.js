import { AuthError } from "../auth/errors.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const URI_SCHEME_PATTERN = /(?:^|[^A-Za-z0-9_-])(?:https?|ftp|file|data|javascript|mailto|tel):/iu;
const WWW_PATTERN = /(?:^|[^A-Za-z0-9_-])www\./iu;
const DOMAIN_PATTERN = /(?:^|[^A-Za-z0-9_-])(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}(?=$|[^A-Za-z0-9_-])/u;
const IPV4_PATTERN = /(?:^|[^0-9])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?=$|[^0-9])/u;
const CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/gu;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/gu;

export function normalizeCommentInput(input) {
  const requestedKey = String(input?.idempotencyKey || "").trim();
  const idempotencyKey = requestedKey || `legacy_${crypto.randomUUID()}`;
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new AuthError(400, "IDEMPOTENCY_KEY_INVALID");
  }

  const message = normalizeText(input?.message, 140);
  if (!message) throw new AuthError(400, "EMPTY_MESSAGE");
  if (Array.from(message).length > 140) throw new AuthError(400, "MESSAGE_TOO_LONG");
  if (containsUrlLikeContent(message)) throw new AuthError(400, "URL_NOT_ALLOWED");

  const nickname = normalizeText(input?.nickname, 20);
  if (Array.from(nickname).length > 20) throw new AuthError(400, "NICKNAME_TOO_LONG");

  return {
    idempotencyKey,
    nickname,
    message,
    messageLength: Array.from(message).length
  };
}

export function normalizeText(value, hardLimit) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(CONTROL_PATTERN, " ")
    .replace(ZERO_WIDTH_PATTERN, "")
    .replace(/\s+/gu, " ")
    .trim();
  return Array.from(normalized).slice(0, Math.max(hardLimit + 1, hardLimit)).join("");
}

export function retentionDays(env) {
  const raw = Number(env?.COMMENT_RETENTION_DAYS ?? 30);
  if (!Number.isInteger(raw) || raw < 1 || raw > 365) return 30;
  return raw;
}

export function validPublicCode(value) {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(String(value || ""));
}

export function containsUrlLikeContent(value) {
  const text = String(value ?? "").normalize("NFKC");
  return URI_SCHEME_PATTERN.test(text) || WWW_PATTERN.test(text) || DOMAIN_PATTERN.test(text) || IPV4_PATTERN.test(text);
}
