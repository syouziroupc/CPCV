import { AuthError } from "./errors.js";
import { hashToken } from "./passwords.js";

export function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length < 3 || email.length > 254) return "";
  if (!/^[\x21-\x7e]+$/.test(email)) return "";
  if (/\s|[\r\n]/.test(email)) return "";
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !domain || domain.length > 253) return "";
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "";
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return "";
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return "";
  const labels = domain.split(".");
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return "";
  return email;
}

export function requireEmail(value) {
  const email = normalizeEmail(value);
  if (!email) throw new AuthError(400, "EMAIL_INVALID");
  return email;
}

export function maskEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return "***";
  const [local, domain] = normalized.split("@");
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.min(6, Math.max(2, local.length - visible.length)))}@${domain}`;
}

export async function hashEmail(email, pepper) {
  const normalized = requireEmail(email);
  if (typeof pepper !== "string" || !pepper) {
    throw new AuthError(500, "AUTH_RATE_LIMIT_PEPPER_NOT_CONFIGURED");
  }
  return hashToken(`${normalized}\u0000${pepper}\u0000email`);
}

export function normalizeOrganizationName(value) {
  const name = String(value ?? "").trim();
  const length = Array.from(name).length;
  return length >= 1 && length <= 120 ? name : "";
}

export function internalLoginId() {
  return `u_${crypto.randomUUID().replaceAll("-", "")}`;
}
