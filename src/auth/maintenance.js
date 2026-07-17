const DEFAULT_SECURITY_RECORD_RETENTION_DAYS = 7;

export async function pruneAuthSecurityRecords(db, options = {}) {
  const nowMs = new Date(options.now ?? Date.now()).getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError("Invalid security-maintenance time.");
  const retentionDays = normalizeRetentionDays(options.retentionDays);
  const cutoff = new Date(nowMs - retentionDays * 86_400_000).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const counterCutoff = new Date(nowMs - 2 * 86_400_000).toISOString();
  const limit = normalizeLimit(options.limit);
  const results = await db.batch([
    db.prepare(
      `DELETE FROM auth_sessions
       WHERE id IN (
         SELECT id FROM auth_sessions
         WHERE absolute_expires_at <= ?1
            OR (revoked_at IS NOT NULL AND revoked_at <= ?1)
         ORDER BY COALESCE(revoked_at, absolute_expires_at) ASC, id ASC
         LIMIT ?2
       )`
    ).bind(cutoff, limit),
    db.prepare(
      `DELETE FROM password_reset_tokens
       WHERE id IN (
         SELECT id FROM password_reset_tokens
         WHERE expires_at <= ?1
            OR (used_at IS NOT NULL AND used_at <= ?1)
            OR (revoked_at IS NOT NULL AND revoked_at <= ?1)
         ORDER BY COALESCE(used_at, revoked_at, expires_at) ASC, id ASC
         LIMIT ?2
       )`
    ).bind(cutoff, limit),
    db.prepare(
      `DELETE FROM pending_registrations
       WHERE id IN (
         SELECT id FROM pending_registrations
         WHERE expires_at <= ?1
            OR (verified_at IS NOT NULL AND verified_at <= ?2)
            OR (revoked_at IS NOT NULL AND revoked_at <= ?2)
         ORDER BY COALESCE(verified_at, revoked_at, expires_at) ASC, id ASC
         LIMIT ?3
       )`
    ).bind(nowIso, cutoff, limit),
    db.prepare(
      `DELETE FROM organization_invitations
       WHERE id IN (
         SELECT id FROM organization_invitations
         WHERE expires_at <= ?1
            OR (accepted_at IS NOT NULL AND accepted_at <= ?2)
            OR (revoked_at IS NOT NULL AND revoked_at <= ?2)
         ORDER BY COALESCE(accepted_at, revoked_at, expires_at) ASC, id ASC
         LIMIT ?3
       )`
    ).bind(nowIso, cutoff, limit),
    db.prepare(
      `DELETE FROM email_change_requests
       WHERE id IN (
         SELECT id FROM email_change_requests
         WHERE expires_at <= ?1
            OR (confirmed_at IS NOT NULL AND confirmed_at <= ?2)
            OR (revoked_at IS NOT NULL AND revoked_at <= ?2)
         ORDER BY COALESCE(confirmed_at, revoked_at, expires_at) ASC, id ASC
         LIMIT ?3
       )`
    ).bind(nowIso, cutoff, limit),
    db.prepare(
      `DELETE FROM email_enrollment_requests
       WHERE id IN (
         SELECT id FROM email_enrollment_requests
         WHERE expires_at <= ?1
            OR (confirmed_at IS NOT NULL AND confirmed_at <= ?2)
            OR (revoked_at IS NOT NULL AND revoked_at <= ?2)
         ORDER BY COALESCE(confirmed_at, revoked_at, expires_at) ASC, id ASC
         LIMIT ?3
       )`
    ).bind(nowIso, cutoff, limit),
    db.prepare(
      `DELETE FROM email_delivery_attempts
       WHERE id IN (
         SELECT id FROM email_delivery_attempts
         WHERE created_at <= ?1
         ORDER BY created_at ASC, id ASC
         LIMIT ?2
       )`
    ).bind(cutoff, limit),
    db.prepare(
      `DELETE FROM organization_email_events
       WHERE id IN (
         SELECT id FROM organization_email_events
         WHERE created_at <= ?1
         ORDER BY created_at ASC, id ASC
         LIMIT ?2
       )`
    ).bind(cutoff, limit),
    db.prepare(
      `DELETE FROM auth_public_counters
       WHERE rowid IN (
         SELECT rowid FROM auth_public_counters
         WHERE window_start <= ?1
         ORDER BY window_start ASC, scope ASC, key_hash ASC
         LIMIT ?2
       )`
    ).bind(counterCutoff, limit)
  ]);
  return {
    authSessionsDeleted: changesOf(results?.[0]),
    resetTokensDeleted: changesOf(results?.[1]),
    pendingRegistrationsDeleted: changesOf(results?.[2]),
    invitationsDeleted: changesOf(results?.[3]),
    emailChangesDeleted: changesOf(results?.[4]),
    emailEnrollmentsDeleted: changesOf(results?.[5]),
    emailAttemptsDeleted: changesOf(results?.[6]),
    organizationEmailEventsDeleted: changesOf(results?.[7]),
    publicCountersDeleted: changesOf(results?.[8]),
    retentionDays,
    limit
  };
}

function normalizeRetentionDays(value) {
  const number = Number(value ?? DEFAULT_SECURITY_RECORD_RETENTION_DAYS);
  return Number.isInteger(number) && number >= 1 && number <= 90
    ? number
    : DEFAULT_SECURITY_RECORD_RETENTION_DAYS;
}

function normalizeLimit(value) {
  const number = Number(value ?? 500);
  return Number.isInteger(number) && number >= 1 && number <= 5000 ? number : 500;
}

function changesOf(result) {
  return Number(result?.meta?.changes || 0);
}
