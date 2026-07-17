import { AuthError } from "../auth/errors.js";

const SHA256_RE = /^[0-9a-f]{64}$/;
const BINDING_ID_RE = /^[A-Za-z0-9_-]{4,128}$/;
const PDF_FINGERPRINT_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const SIGNALS = new Set(["understood", "unsure", "confused"]);

export function normalizePdfBindingInput(input) {
  const sha256Hex = String(input?.sha256Hex || "").trim().toLowerCase();
  if (!SHA256_RE.test(sha256Hex)) throw new AuthError(400, "PDF_HASH_INVALID");
  const pageCount = boundedInteger(input?.pageCount, 1, 5000, "PDF_PAGE_COUNT_INVALID");
  const fileSizeBytes = boundedInteger(input?.fileSizeBytes, 1, 536870912, "PDF_FILE_SIZE_INVALID");
  const rawFingerprint = input?.pdfjsFingerprint == null ? "" : String(input.pdfjsFingerprint).trim();
  const pdfjsFingerprint = rawFingerprint || null;
  if (rawFingerprint && !PDF_FINGERPRINT_RE.test(rawFingerprint)) {
    throw new AuthError(400, "PDF_FINGERPRINT_INVALID");
  }
  return { sha256Hex, pageCount, fileSizeBytes, pdfjsFingerprint };
}

export function normalizePdfPageInput(input) {
  const bindingId = String(input?.bindingId || "").trim();
  if (!BINDING_ID_RE.test(bindingId)) throw new AuthError(400, "PDF_BINDING_INVALID");
  const pageNumber = boundedInteger(input?.pageNumber, 1, 5000, "PDF_PAGE_INVALID");
  const clientVersion = boundedInteger(input?.clientVersion, 2, 2147483647, "PDF_CLIENT_VERSION_INVALID");
  return { bindingId, pageNumber, clientVersion };
}

export function normalizeUnderstandingSignal(input) {
  const signal = String(input?.signal || "").trim();
  if (!SIGNALS.has(signal)) throw new AuthError(400, "UNDERSTANDING_SIGNAL_INVALID");
  return signal;
}

export function normalizeUnderstandingInput(input) {
  const signal = normalizeUnderstandingSignal(input);
  const bindingId = String(input?.bindingId || "").trim();
  if (!BINDING_ID_RE.test(bindingId)) throw new AuthError(400, "PDF_BINDING_INVALID");
  const pageNumber = boundedInteger(input?.pageNumber, 1, 5000, "PDF_PAGE_INVALID");
  const clientVersion = boundedInteger(input?.clientVersion, 1, 2147483647, "PDF_CLIENT_VERSION_INVALID");
  return { signal, bindingId, pageNumber, clientVersion };
}

export function normalizeSnapshotId(value) {
  const id = String(value || "").trim();
  if (!/^anl_[A-Za-z0-9_-]{8,128}$/.test(id)) throw new AuthError(404, "ANALYTICS_SNAPSHOT_NOT_FOUND");
  return id;
}

function boundedInteger(value, min, max, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new AuthError(400, code);
  return number;
}
