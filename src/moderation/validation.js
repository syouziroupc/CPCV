import { AuthError } from "../auth/errors.js";

export const MODERATION_ACTIONS = Object.freeze(["approve", "hide", "delete", "restore"]);
export const MODERATION_STATES = Object.freeze(["visible", "pending", "hidden", "deleted"]);
export const MODERATION_MODES = Object.freeze(["off", "pre"]);
export const MAX_BULK_MODERATION_ITEMS = 25;

const TRANSITIONS = Object.freeze({
  pending: Object.freeze({ approve: "visible", hide: "hidden", delete: "deleted" }),
  visible: Object.freeze({ hide: "hidden", delete: "deleted" }),
  hidden: Object.freeze({ restore: "visible", delete: "deleted" }),
  deleted: Object.freeze({ restore: "hidden" })
});

export function normalizeModerationMode(value) {
  const mode = String(value ?? "off").trim().toLowerCase();
  if (!MODERATION_MODES.includes(mode)) throw new AuthError(400, "MODERATION_MODE_INVALID");
  return mode;
}

export function normalizeModerationAction(value) {
  const action = String(value ?? "").trim().toLowerCase();
  if (!MODERATION_ACTIONS.includes(action)) throw new AuthError(400, "MODERATION_ACTION_INVALID");
  return action;
}

export function nextModerationState(currentState, action) {
  const normalizedAction = normalizeModerationAction(action);
  const next = TRANSITIONS[currentState]?.[normalizedAction];
  if (!next) throw new AuthError(409, "MODERATION_TRANSITION_INVALID");
  return next;
}

export function normalizeModerationReason(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const normalized = String(value).normalize("NFKC").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (Array.from(normalized).length > 200) throw new AuthError(400, "MODERATION_REASON_TOO_LONG");
  return normalized;
}

export function normalizeExpectedUpdatedAt(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new AuthError(400, "EXPECTED_UPDATED_AT_INVALID");
  }
  return text;
}

export function parseModerationStateFilter(value) {
  if (value === undefined || value === null || String(value).trim() === "") return [];
  const states = [...new Set(String(value).split(",").map((part) => part.trim().toLowerCase()).filter(Boolean))];
  if (!states.length || states.some((state) => !MODERATION_STATES.includes(state))) {
    throw new AuthError(400, "MODERATION_STATE_FILTER_INVALID");
  }
  return states;
}

export function normalizeBulkModerationItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_BULK_MODERATION_ITEMS) {
    throw new AuthError(400, "MODERATION_BULK_ITEMS_INVALID");
  }
  const seen = new Set();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new AuthError(400, "MODERATION_BULK_ITEM_INVALID");
    const commentId = String(item.commentId ?? "").trim();
    if (!/^cmt_[a-z0-9]{16,80}$/i.test(commentId)) throw new AuthError(400, "COMMENT_ID_INVALID");
    if (seen.has(commentId)) throw new AuthError(400, "MODERATION_BULK_DUPLICATE_COMMENT");
    seen.add(commentId);
    return {
      commentId,
      action: normalizeModerationAction(item.action),
      expectedUpdatedAt: normalizeExpectedUpdatedAt(item.expectedUpdatedAt),
      reason: normalizeModerationReason(item.reason)
    };
  });
}
