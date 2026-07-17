import { AuthError } from "./errors.js";
import { requireJsonContentType } from "./csrf.js";

const ORGANIZATION_SELECTOR = "organizationid";
const DEFAULT_JSON_MAX_BYTES = 16 * 1024;

export async function readJsonObject(request, options = {}) {
  requireJsonContentType(request, options);
  const text = await readRequestTextLimited(request, options);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AuthError(400, "INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthError(400, "INVALID_JSON");
  }
  return value;
}

export async function readOptionalJsonObject(request, options = {}) {
  requireJsonContentType(request, options);
  const text = await readRequestTextLimited(request, options);
  if (!text.trim()) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AuthError(400, "INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthError(400, "INVALID_JSON");
  }
  return value;
}

export async function readRequestTextLimited(request, options = {}) {
  const maxBytes = normalizeBodyLimit(options.maxBytes);
  const declaredLength = parseContentLength(request.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new AuthError(413, "REQUEST_BODY_TOO_LARGE");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value?.byteLength || 0;
      if (total > maxBytes) {
        await reader.cancel("request body limit exceeded").catch(() => {});
        throw new AuthError(413, "REQUEST_BODY_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(400, "INVALID_JSON");
  } finally {
    reader.releaseLock();
  }
}

export function rejectOrganizationSelector(request, body) {
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    if (normalizeSelectorKey(key) === ORGANIZATION_SELECTOR) {
      throw new AuthError(400, "ORGANIZATION_ID_NOT_ALLOWED");
    }
  }
  for (const [key] of request.headers) {
    const normalized = normalizeSelectorKey(key);
    if (normalized === ORGANIZATION_SELECTOR
        || normalized === `x${ORGANIZATION_SELECTOR}`
        || normalized === `xcpcv${ORGANIZATION_SELECTOR}`) {
      throw new AuthError(400, "ORGANIZATION_ID_NOT_ALLOWED");
    }
  }
  if (body) {
    for (const key of Object.keys(body)) {
      if (normalizeSelectorKey(key) === ORGANIZATION_SELECTOR) {
        throw new AuthError(400, "ORGANIZATION_ID_NOT_ALLOWED");
      }
    }
  }
}

function normalizeSelectorKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeLoginId(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{1,64}$/.test(normalized) ? normalized : "";
}

export function normalizeDisplayName(value) {
  const normalized = String(value ?? "").trim();
  const length = Array.from(normalized).length;
  return length >= 1 && length <= 80 ? normalized : "";
}

export function normalizeRole(value) {
  const normalized = String(value ?? "").toLowerCase();
  return ["owner", "admin", "teacher"].includes(normalized) ? normalized : "";
}

export function normalizeMembershipStatus(value) {
  const normalized = String(value ?? "").toLowerCase();
  return ["active", "suspended"].includes(normalized) ? normalized : "";
}

export function parseLimit(value, defaultValue = 50) {
  if (value === null || value === "") return defaultValue;
  if (!/^\d+$/.test(String(value))) throw new AuthError(400, "INVALID_LIMIT");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new AuthError(400, "INVALID_LIMIT");
  }
  return parsed;
}

export function assertOnlyFields(object, allowedFields) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new AuthError(400, "UNEXPECTED_FIELD");
  }
}

export function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function encodeCursor(values) {
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeCursor(value, expectedLength) {
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new AuthError(400, "INVALID_CURSOR");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed) || parsed.length !== expectedLength || parsed.some((item) => typeof item !== "string")) {
      throw new Error("shape");
    }
    return parsed;
  } catch {
    throw new AuthError(400, "INVALID_CURSOR");
  }
}

function normalizeBodyLimit(value) {
  const number = Number(value ?? DEFAULT_JSON_MAX_BYTES);
  if (!Number.isSafeInteger(number) || number < 1 || number > 1024 * 1024) {
    throw new TypeError("Invalid request body limit.");
  }
  return number;
}

function parseContentLength(value) {
  if (value === null || value === "") return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
