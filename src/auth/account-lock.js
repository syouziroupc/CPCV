export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export async function recordLoginFailure(db, userId, now = new Date()) {
  const nowDate = new Date(now);
  const nowIso = nowDate.toISOString();
  const lockedUntil = new Date(nowDate.getTime() + LOGIN_LOCK_MS).toISOString();
  const result = await db.prepare(
    `UPDATE users
     SET failed_login_count = CASE
           WHEN locked_until IS NOT NULL AND locked_until <= ?1 THEN 1
           ELSE MIN(failed_login_count + 1, 1000000)
         END,
         locked_until = CASE
           WHEN (CASE
             WHEN locked_until IS NOT NULL AND locked_until <= ?1 THEN 1
             ELSE failed_login_count + 1
           END) >= ?2 THEN ?3
           ELSE CASE WHEN locked_until IS NOT NULL AND locked_until <= ?1 THEN NULL ELSE locked_until END
         END,
         updated_at = ?1
     WHERE id = ?4`
  ).bind(nowIso, LOGIN_FAILURE_LIMIT, lockedUntil, userId).run();
  const row = await db.prepare(
    `SELECT failed_login_count, locked_until FROM users WHERE id = ?1 LIMIT 1`
  ).bind(userId).first();
  return {
    changes: Number(result?.meta?.changes || 0),
    failedLoginCount: Number(row?.failed_login_count || 0),
    lockedUntil: row?.locked_until || null
  };
}

export async function clearLoginFailures(db, userId, now = new Date()) {
  return db.prepare(
    `UPDATE users
     SET failed_login_count = 0, locked_until = NULL, updated_at = ?1
     WHERE id = ?2 AND (failed_login_count <> 0 OR locked_until IS NOT NULL)`
  ).bind(new Date(now).toISOString(), userId).run();
}

export function isAccountLocked(row, now = new Date()) {
  const lockedUntil = Date.parse(row?.locked_until || "");
  return Number.isFinite(lockedUntil) && lockedUntil > new Date(now).getTime();
}
