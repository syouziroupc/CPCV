import { makeId } from "./request.js";

const FORBIDDEN_DETAIL_KEY = /(password|token|hash|salt|cookie|authorization|ip)/i;

export function auditStatement(db, entry) {
  const details = sanitizeDetails(entry.details || null);
  return db.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, actor_type, actor_user_id, actor_role,
       action, target_type, target_id, details_json, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  ).bind(
    entry.id || makeId("aud"),
    entry.organizationId || null,
    entry.actorType || "system",
    entry.actorUserId || null,
    entry.actorRole || null,
    entry.action,
    entry.targetType || null,
    entry.targetId || null,
    details ? JSON.stringify(details) : null,
    entry.createdAt || new Date().toISOString()
  );
}

export async function writeAudit(db, entry) {
  return auditStatement(db, entry).run();
}

function sanitizeDetails(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(sanitizeDetails);
  if (typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_DETAIL_KEY.test(key)) continue;
    if (item === undefined) continue;
    output[key] = sanitizeDetails(item);
  }
  return output;
}
