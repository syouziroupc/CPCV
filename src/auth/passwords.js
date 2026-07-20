import { AuthError } from "./errors.js";

export const PASSWORD_SCHEME = "pbkdf2-sha256-600000-v2";
export const LEGACY_PASSWORD_SCHEME = "pbkdf2-sha256-100000-v1";
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const HASH_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;
const TOKEN_LENGTH_BYTES = 32;
const SCHEME_PARAMETERS = Object.freeze({
  [PASSWORD_SCHEME]: Object.freeze({ iterations: 600_000, decodeSalt: true }),
  [LEGACY_PASSWORD_SCHEME]: Object.freeze({ iterations: 100_000, decodeSalt: false })
});

export function createSalt() {
  return bytesToBase64Url(randomBytes(SALT_LENGTH_BYTES));
}

export function createToken(byteLength = TOKEN_LENGTH_BYTES) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 32 || byteLength > 256) {
    throw new TypeError("Token length must be an integer between 32 and 256 bytes.");
  }
  return bytesToBase64Url(randomBytes(byteLength));
}

export function validatePassword(password, loginId = "") {
  if (typeof password !== "string") return "PASSWORD_POLICY_FAILED";
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    return "PASSWORD_POLICY_FAILED";
  }
  if (loginId && password === String(loginId)) return "PASSWORD_POLICY_FAILED";
  return "";
}

export function requireValidPassword(password, loginId = "") {
  const error = validatePassword(password, loginId);
  if (error) throw new AuthError(400, error);
}

export async function hashPassword(password, salt, scheme = PASSWORD_SCHEME) {
  const parameters = SCHEME_PARAMETERS[scheme];
  if (!parameters) throw new TypeError(`Unsupported password scheme: ${scheme}`);
  if (typeof password !== "string") throw new TypeError("Password must be a string.");
  const saltBytes = normalizeSalt(salt, parameters.decodeSalt);
  if (saltBytes.byteLength < SALT_LENGTH_BYTES) {
    throw new TypeError("Password salt must contain at least 16 bytes.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations: parameters.iterations
    },
    key,
    HASH_LENGTH_BYTES * 8
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function verifyPassword(password, salt, expectedHash, scheme = PASSWORD_SCHEME) {
  if (typeof expectedHash !== "string" || !expectedHash) return false;
  let actualHash;
  try {
    actualHash = await hashPassword(password, salt, scheme);
  } catch {
    return false;
  }
  return constantTimeEqual(actualHash, expectedHash);
}

export function needsPasswordRehash(scheme) {
  return scheme !== PASSWORD_SCHEME;
}

export async function hashToken(token) {
  if (typeof token !== "string" || !token) throw new TypeError("Token is required.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export function constantTimeEqual(leftValue, rightValue) {
  const left = new TextEncoder().encode(String(leftValue));
  const right = new TextEncoder().encode(String(rightValue));
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

function normalizeSalt(salt, decodeSalt) {
  if (typeof salt !== "string" || !salt) throw new TypeError("Password salt is required.");
  return decodeSalt ? base64UrlToBytes(salt) : new TextEncoder().encode(salt);
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError("Invalid base64url salt.");
  const paddingLength = (4 - (value.length % 4)) % 4;
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(paddingLength);
  let binary;
  try {
    binary = atob(normalized);
  } catch {
    throw new TypeError("Invalid base64url salt.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
