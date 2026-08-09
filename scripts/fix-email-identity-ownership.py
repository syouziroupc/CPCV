from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# This script runs after fix-email-identity-invariants.py. Restore the legacy
# unverified-email enrollment path only when the pending registration can be
# cryptographically tied to the current password. A matching email alone is
# not ownership proof because pending_registrations has no user_id.
replace_once(
    "src/routes/account-lifecycle.js",
    '''  const hasVerifiedEmail = Boolean(user.email && user.email_verified_at);
  await releaseExpiredEmailReservations(env.DB_V2, newEmail, nowIso);
  if (await emailUnavailable(env.DB_V2, newEmail, auth.userId, nowIso)) throw new AuthError(409, "EMAIL_UNAVAILABLE");''',
    '''  const hasVerifiedEmail = Boolean(user.email && user.email_verified_at);
  if (!hasVerifiedEmail && normalizeEmail(user.email) === newEmail) {
    const pendingRegistration = await env.DB_V2.prepare(
      `SELECT id, password_scheme, password_hash, password_salt
       FROM pending_registrations
       WHERE email = ?1 COLLATE NOCASE
         AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
       LIMIT 1`
    ).bind(newEmail, nowIso).first();
    if (pendingRegistration) {
      const ownsPendingRegistration = await verifyPassword(
        currentPassword,
        pendingRegistration.password_salt,
        pendingRegistration.password_hash,
        pendingRegistration.password_scheme
      );
      if (!ownsPendingRegistration) throw new AuthError(409, "EMAIL_UNAVAILABLE");
      const released = await env.DB_V2.prepare(
        `UPDATE pending_registrations SET revoked_at = ?1
         WHERE id = ?2 AND email = ?3 COLLATE NOCASE
           AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?1`
      ).bind(nowIso, pendingRegistration.id, newEmail).run();
      if (Number(released?.meta?.changes || 0) !== 1) {
        throw new AuthError(409, "EMAIL_UNAVAILABLE");
      }
    }
  }
  await releaseExpiredEmailReservations(env.DB_V2, newEmail, nowIso);
  if (await emailUnavailable(env.DB_V2, newEmail, auth.userId, nowIso)) throw new AuthError(409, "EMAIL_UNAVAILABLE");'''
)

# The foreign-registration regression must use a different password so it
# represents another claimant rather than the legitimate legacy self-claim.
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''      body: { email: legacyConflictEmail, displayName: "Foreign Pending", password: PASSWORD,
        turnstileToken: "test-turnstile" }''',
    '''      body: { email: legacyConflictEmail, displayName: "Foreign Pending", password: "Foreign-Pending-Password-999",
        turnstileToken: "test-turnstile" }'''
)

print("Email pending-registration ownership proof patch applied")
