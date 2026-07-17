const LEGACY_DEFAULT_SECONDS = 60;
const LEGACY_DEFAULT_MODE = "stack3";

export async function ensureLegacyTeacher(db, auth) {
  const now = new Date().toISOString();
  const email = `${auth.userId}@v2.local`;
  await db.prepare(
    `INSERT INTO teachers (id, email, name, created_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`
  ).bind(auth.userId, email, auth.displayName || auth.loginId || auth.userId, now).run();
}

export async function createLegacyProjection(db, session, auth) {
  await ensureLegacyTeacher(db, auth);
  return db.prepare(
    `INSERT INTO sessions (
       id, public_code, teacher_id, title,
       posting_enabled, comments_visible, comment_display_seconds,
       status, created_at, ended_at, comment_display_mode
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
  ).bind(
    session.id,
    session.publicCode,
    session.createdByUserId,
    session.title,
    session.postingEnabled ? 1 : 0,
    session.commentsVisible ? 1 : 0,
    session.commentDisplaySeconds,
    session.status,
    session.createdAt,
    session.endedAt || null,
    session.commentDisplayMode
  ).run();
}

export async function loadLegacyProjection(db, sessionId) {
  return db.prepare(
    `SELECT id, public_code, teacher_id, title,
            posting_enabled, comments_visible, comment_display_seconds,
            comment_display_mode, status, created_at, ended_at
     FROM sessions WHERE id = ?1 LIMIT 1`
  ).bind(sessionId).first();
}

export async function updateLegacyProjection(db, sessionId, state) {
  return db.prepare(
    `UPDATE sessions
     SET title = ?1,
         posting_enabled = ?2,
         comments_visible = ?3,
         comment_display_seconds = ?4,
         comment_display_mode = ?5,
         status = ?6,
         ended_at = ?7
     WHERE id = ?8`
  ).bind(
    state.title,
    state.postingEnabled ? 1 : 0,
    state.commentsVisible ? 1 : 0,
    state.commentDisplaySeconds,
    state.commentDisplayMode,
    state.status,
    state.endedAt || null,
    sessionId
  ).run();
}

export async function restoreLegacyProjection(db, snapshot) {
  if (!snapshot) throw new Error("LEGACY_PROJECTION_SNAPSHOT_REQUIRED");
  return updateLegacyProjection(db, snapshot.id, legacySnapshotToState(snapshot));
}

export async function stopLegacyProjection(db, sessionId, status, nowIso) {
  if (!new Set(["ended", "deleted"]).has(status)) throw new TypeError("Invalid legacy stop status.");
  return db.prepare(
    `UPDATE sessions
     SET posting_enabled = 0,
         comments_visible = 0,
         status = ?1,
         ended_at = COALESCE(ended_at, ?2)
     WHERE id = ?3`
  ).bind(status, nowIso, sessionId).run();
}

export function legacySnapshotToState(row) {
  return {
    title: String(row?.title || ""),
    postingEnabled: Boolean(row?.posting_enabled),
    commentsVisible: Boolean(row?.comments_visible),
    commentDisplaySeconds: normalizeSeconds(row?.comment_display_seconds),
    commentDisplayMode: normalizeMode(row?.comment_display_mode),
    status: normalizeStatus(row?.status),
    endedAt: row?.ended_at || null
  };
}

export function projectionMatches(v2, legacy) {
  if (!v2 || !legacy) return false;
  return v2.id === legacy.id
    && v2.public_code === legacy.public_code
    && v2.created_by_user_id === legacy.teacher_id
    && v2.title === legacy.title
    && Number(v2.posting_enabled) === Number(legacy.posting_enabled)
    && Number(v2.comments_visible) === Number(legacy.comments_visible)
    && normalizeSeconds(v2.comment_display_seconds) === normalizeSeconds(legacy.comment_display_seconds)
    && normalizeMode(v2.comment_display_mode) === normalizeMode(legacy.comment_display_mode)
    && v2.status === legacy.status;
}

function normalizeSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return LEGACY_DEFAULT_SECONDS;
  return Math.min(300, Math.max(10, Math.round(number)));
}

function normalizeMode(value) {
  return ["stack3", "stack5", "stack7", "scroll"].includes(value) ? value : LEGACY_DEFAULT_MODE;
}

function normalizeStatus(value) {
  return ["active", "ended", "deleted"].includes(value) ? value : "active";
}
