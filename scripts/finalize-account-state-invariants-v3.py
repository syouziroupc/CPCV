from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:900]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# A new identity-change request invalidates both flavors of prior request for
# the same user. This prevents a stale enrollment link surviving a later email
# change (or vice versa) after unusual legacy/admin state transitions.
replace_once(
    "src/routes/account-lifecycle.js",
    '''    if (hasVerifiedEmail) {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `UPDATE email_change_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`
        ).bind(nowIso, auth.userId),
        env.DB_V2.prepare(
          `INSERT INTO email_change_requests (''',
    '''    if (hasVerifiedEmail) {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `UPDATE email_change_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`
        ).bind(nowIso, auth.userId),
        env.DB_V2.prepare(
          `UPDATE email_enrollment_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`
        ).bind(nowIso, auth.userId),
        env.DB_V2.prepare(
          `INSERT INTO email_change_requests ('''
)

replace_once(
    "src/routes/account-lifecycle.js",
    '''    } else {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `UPDATE email_enrollment_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`
        ).bind(nowIso, auth.userId),
        env.DB_V2.prepare(
          `INSERT INTO email_enrollment_requests (''',
    '''    } else {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `UPDATE email_enrollment_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`
        ).bind(nowIso, auth.userId),
        env.DB_V2.prepare(
          `UPDATE email_change_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`
        ).bind(nowIso, auth.userId),
        env.DB_V2.prepare(
          `INSERT INTO email_enrollment_requests ('''
)

# Confirmation also invalidates the alternate request type atomically.
replace_once(
    "src/routes/account-lifecycle.js",
    '''  const claimMarker = makeClaimMarker(now);
  const table = change ? "email_change_requests" : "email_enrollment_requests";
  let results;''',
    '''  const claimMarker = makeClaimMarker(now);
  const table = change ? "email_change_requests" : "email_enrollment_requests";
  const alternateTable = change ? "email_enrollment_requests" : "email_change_requests";
  let results;'''
)

replace_once(
    "src/routes/account-lifecycle.js",
    '''      env.DB_V2.prepare(
        `UPDATE password_reset_tokens SET revoked_at = ?1
         WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?3 AND confirmed_at = ?4)`
      ).bind(nowIso, record.user_id, record.id, claimMarker),
      emailConfirmationAuditStatement(env.DB_V2, {''',
    '''      env.DB_V2.prepare(
        `UPDATE password_reset_tokens SET revoked_at = ?1
         WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?3 AND confirmed_at = ?4)`
      ).bind(nowIso, record.user_id, record.id, claimMarker),
      env.DB_V2.prepare(
        `UPDATE ${alternateTable} SET revoked_at = ?1
         WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?3 AND confirmed_at = ?4)`
      ).bind(nowIso, record.user_id, record.id, claimMarker),
      emailConfirmationAuditStatement(env.DB_V2, {'''
)

# Resend revalidates the current identity state instead of sending a token that
# the acceptance path is guaranteed to reject.
replace_once(
    "src/routes/account-lifecycle.js",
    '''  if (!invitation) throw new AuthError(404, "INVITATION_NOT_FOUND");
  requireRoleAssignment(auth.role, invitation.role);
  if (Date.parse(invitation.last_sent_at) > now.getTime() - 60_000) {''',
    '''  if (!invitation) throw new AuthError(404, "INVITATION_NOT_FOUND");
  requireRoleAssignment(auth.role, invitation.role);
  const currentUser = await env.DB_V2.prepare(
    `SELECT id, email_verified_at, status FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(invitation.email).first();
  if (currentUser) {
    if (currentUser.status !== "active" || !currentUser.email_verified_at) {
      throw new AuthError(409, "EMAIL_UNAVAILABLE");
    }
    const currentMembership = await env.DB_V2.prepare(
      `SELECT status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2 LIMIT 1`
    ).bind(auth.organizationId, currentUser.id).first();
    if (currentMembership && currentMembership.status !== "removed") {
      throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");
    }
  }
  if (await emailReservedForAccountChange(env.DB_V2, invitation.email, nowIso)) {
    throw new AuthError(409, "EMAIL_UNAVAILABLE");
  }
  if (Date.parse(invitation.last_sent_at) > now.getTime() - 60_000) {'''
)

# The reservation-after-invite regression also checks that resend does not
# generate another unusable email.
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("invitation acceptance cannot steal a later account-change reservation",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");
    response = await h.api("/api/auth/email-change/request", {''',
    '''    check("invitation acceptance cannot steal a later account-change reservation",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");
    const emailsBeforeBlockedResend = h.emails.length;
    response = await h.api(`/api/org/invitations/${raceInvite.invitationId}/resend`, {
      method: "POST", auth: owner, body: {}
    });
    check("invitation resend refuses a target now reserved by an account change",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");
    await h.drain();
    check("blocked invitation resend sends no useless email", h.emails.length === emailsBeforeBlockedResend);
    response = await h.api("/api/auth/email-change/request", {'''
)

print("Cross-flow token cleanup and invitation resend invariants applied")
