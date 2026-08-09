from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:1200]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# ---------------------------------------------------------------------------
# Public registration: exact rapid duplicate submissions are idempotent. They
# no longer revoke the just-issued link and send another verification email.
# ---------------------------------------------------------------------------
replace_once(
    "src/routes/email-auth.js",
    '''  hashPassword,
  hashToken,
  requireValidPassword
} from "../auth/passwords.js";''',
    '''  hashPassword,
  hashToken,
  requireValidPassword,
  verifyPassword
} from "../auth/passwords.js";'''
)

replace_once(
    "src/routes/email-auth.js",
    '''  await requireTurnstile(request, env, input.turnstileToken);
  await consumePublicEmailRateLimit(request, env, email, "registration");

  const salt = createSalt();
  let passwordHash;''',
    '''  await requireTurnstile(request, env, input.turnstileToken);
  await consumePublicEmailRateLimit(request, env, email, "registration");

  const now = new Date();
  const nowIso = now.toISOString();
  const recentPending = await env.DB_V2.prepare(
    `SELECT display_name, organization_name, password_scheme, password_hash, password_salt,
            last_sent_at, expires_at
     FROM pending_registrations
     WHERE email = ?1 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL
       AND expires_at > ?2
     LIMIT 1`
  ).bind(email, nowIso).first();
  if (recentPending
      && recentPending.display_name === displayName
      && recentPending.organization_name === organizationName
      && Date.parse(recentPending.last_sent_at) > now.getTime() - 60_000
      && await verifyPassword(password, recentPending.password_salt,
        recentPending.password_hash, recentPending.password_scheme)) {
    return authJson(ACCEPTED, 202);
  }

  const salt = createSalt();
  let passwordHash;'''
)

replace_once(
    "src/routes/email-auth.js",
    '''  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + REGISTRATION_TTL_MS).toISOString();''',
    '''  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + REGISTRATION_TTL_MS).toISOString();'''
)

# Password reset duplicate clicks: preserve the already-issued token for one
# minute instead of creating multiple emails/links that invalidate each other.
replace_once(
    "src/routes/email-auth.js",
    '''  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  const resetId = makeId("prt");''',
    '''  const now = new Date();
  const nowIso = now.toISOString();
  const recentReset = await env.DB_V2.prepare(
    `SELECT id FROM password_reset_tokens
     WHERE user_id = ?1 AND email_snapshot = ?2 COLLATE NOCASE
       AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?3
       AND delivery_requested_at > ?4
     LIMIT 1`
  ).bind(user.id, email, nowIso, new Date(now.getTime() - 60_000).toISOString()).first();
  if (recentReset) return authJson(ACCEPTED, 202);
  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  const resetId = makeId("prt");'''
)

# ---------------------------------------------------------------------------
# Email change/enrollment: clean legacy pending-registration conflicts owned by
# this user, suppress rapid exact duplicate requests, and revoke stale
# registration links for old/new addresses only after a successful confirm.
# ---------------------------------------------------------------------------
replace_once(
    "src/routes/account-lifecycle.js",
    '''  const now = new Date();
  const nowIso = now.toISOString();
  await releaseExpiredEmailReservations(env.DB_V2, newEmail, nowIso);
  if (await emailUnavailable(env.DB_V2, newEmail, auth.userId, nowIso)) throw new AuthError(409, "EMAIL_UNAVAILABLE");

  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS).toISOString();
  const hasVerifiedEmail = Boolean(user.email && user.email_verified_at);
  const requestId = makeId(hasVerifiedEmail ? "emc" : "eme");''',
    '''  const now = new Date();
  const nowIso = now.toISOString();
  const hasVerifiedEmail = Boolean(user.email && user.email_verified_at);
  if (!hasVerifiedEmail && normalizeEmail(user.email) === newEmail) {
    await env.DB_V2.prepare(
      `UPDATE pending_registrations SET revoked_at = ?1
       WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, newEmail).run();
  }
  await releaseExpiredEmailReservations(env.DB_V2, newEmail, nowIso);
  if (await emailUnavailable(env.DB_V2, newEmail, auth.userId, nowIso)) throw new AuthError(409, "EMAIL_UNAVAILABLE");
  const recentRequest = hasVerifiedEmail
    ? await env.DB_V2.prepare(
      `SELECT id FROM email_change_requests
       WHERE user_id = ?1 AND new_email = ?2 COLLATE NOCASE
         AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?3
         AND created_at > ?4 LIMIT 1`
    ).bind(auth.userId, newEmail, nowIso, new Date(now.getTime() - 60_000).toISOString()).first()
    : await env.DB_V2.prepare(
      `SELECT id FROM email_enrollment_requests
       WHERE user_id = ?1 AND new_email = ?2 COLLATE NOCASE
         AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?3
         AND created_at > ?4 LIMIT 1`
    ).bind(auth.userId, newEmail, nowIso, new Date(now.getTime() - 60_000).toISOString()).first();
  if (recentRequest) return authJson(ACCEPTED, 202);

  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS).toISOString();
  const requestId = makeId(hasVerifiedEmail ? "emc" : "eme");'''
)

replace_once(
    "src/routes/account-lifecycle.js",
    '''      env.DB_V2.prepare(
        `UPDATE ${alternateTable} SET revoked_at = ?1
         WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?3 AND confirmed_at = ?4)`
      ).bind(nowIso, record.user_id, record.id, claimMarker),
      emailConfirmationAuditStatement(env.DB_V2, {''',
    '''      env.DB_V2.prepare(
        `UPDATE ${alternateTable} SET revoked_at = ?1
         WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?3 AND confirmed_at = ?4)`
      ).bind(nowIso, record.user_id, record.id, claimMarker),
      env.DB_V2.prepare(
        `UPDATE pending_registrations SET revoked_at = ?1
         WHERE email IN (?2, ?3) COLLATE NOCASE
           AND verified_at IS NULL AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?4 AND confirmed_at = ?5)`
      ).bind(nowIso, record.old_email || record.current_email || "", record.new_email,
        record.id, claimMarker),
      emailConfirmationAuditStatement(env.DB_V2, {'''
)

# Manager reset duplicate clicks preserve the existing usable reset for one
# minute rather than invalidating it and emitting another mail.
replace_once(
    "src/routes/account-lifecycle.js",
    '''  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  const rawToken = createToken();''',
    '''  const now = new Date();
  const nowIso = now.toISOString();
  const recentReset = await env.DB_V2.prepare(
    `SELECT id FROM password_reset_tokens
     WHERE user_id = ?1 AND email_snapshot = ?2 COLLATE NOCASE
       AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?3
       AND delivery_requested_at > ?4
     LIMIT 1`
  ).bind(target.user_id, target.email, nowIso,
    new Date(now.getTime() - 60_000).toISOString()).first();
  if (recentReset) return authJson(ACCEPTED, 202);
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  const rawToken = createToken();'''
)

# Invitation creation exact double-click: if the same role was just mailed,
# return the current invitation rather than invalidating its link and sending a
# replacement. Different roles still intentionally replace the old invitation.
replace_once(
    "src/routes/account-lifecycle.js",
    '''  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
  const invitationId = makeId("inv");''',
    '''  const now = new Date();
  const nowIso = now.toISOString();
  const recentInvitation = await env.DB_V2.prepare(
    `SELECT id, expires_at FROM organization_invitations
     WHERE organization_id = ?1 AND email = ?2 COLLATE NOCASE AND role = ?3
       AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?4
       AND last_sent_at > ?5 LIMIT 1`
  ).bind(auth.organizationId, email, role, nowIso,
    new Date(now.getTime() - 60_000).toISOString()).first();
  if (recentInvitation) {
    return authJson({ ok: true, accepted: true, invitationId: recentInvitation.id,
      expiresAt: recentInvitation.expires_at }, 202);
  }
  const rawToken = createToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
  const invitationId = makeId("inv");'''
)

# ---------------------------------------------------------------------------
# Regressions for duplicate operations and stale legacy registration links.
# ---------------------------------------------------------------------------
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    const owner = await register(h, "identity-owner@example.com", "Identity Owner");

    let response = await h.api("/api/auth/registration/request", {''',
    '''    const owner = await register(h, "identity-owner@example.com", "Identity Owner");

    const duplicateEmail = "duplicate-registration@example.com";
    let response = await h.api("/api/auth/registration/request", {
      method: "POST",
      body: { email: duplicateEmail, displayName: "Duplicate Registration", password: PASSWORD,
        turnstileToken: "test-turnstile" }
    });
    check("duplicate-registration fixture is accepted", response.status === 202);
    await h.drain();
    const duplicateRegistrationToken = tokenFromMessage(h.emails.at(-1), "verify-email");
    const duplicateRegistrationHash = await hashToken(duplicateRegistrationToken);
    const duplicateEmailsBefore = h.emails.length;
    response = await h.api("/api/auth/registration/request", {
      method: "POST",
      body: { email: duplicateEmail, displayName: "Duplicate Registration", password: PASSWORD,
        turnstileToken: "test-turnstile" }
    });
    check("rapid exact registration duplicate is idempotent", response.status === 202);
    await h.drain();
    check("rapid exact registration duplicate preserves token and sends no second email",
      h.emails.length === duplicateEmailsBefore
        && h.row("SELECT token_hash FROM pending_registrations WHERE email = ?1 AND revoked_at IS NULL", duplicateEmail)?.token_hash === duplicateRegistrationHash);

    response = await h.api("/api/auth/registration/request", {'''
)

replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("email change reserves its target address", response.status === 202);
    await h.drain();
    const emailsBeforeBlockedRegistration = h.emails.length;''',
    '''    check("email change reserves its target address", response.status === 202);
    await h.drain();
    const originalChangeToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");
    const originalChangeHash = await hashToken(originalChangeToken);
    const emailsBeforeDuplicateChange = h.emails.length;
    response = await h.api("/api/auth/email-change/request", {
      method: "POST", auth: owner,
      body: { newEmail: "reserved-change@example.com", currentPassword: PASSWORD }
    });
    check("rapid exact email-change duplicate is idempotent", response.status === 202);
    await h.drain();
    check("rapid exact email-change duplicate preserves token and sends no second email",
      h.emails.length === emailsBeforeDuplicateChange
        && h.row("SELECT token_hash FROM email_change_requests WHERE user_id = ?1 AND revoked_at IS NULL", owner.data.user.id)?.token_hash === originalChangeHash);
    const emailsBeforeBlockedRegistration = h.emails.length;'''
)

replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("invitation race fixture is created", response.status === 202, raceInvite);
    await h.drain();
    const raceInviteToken = tokenFromMessage(h.emails.at(-1), "accept-invitation");''',
    '''    check("invitation race fixture is created", response.status === 202, raceInvite);
    await h.drain();
    const raceInviteToken = tokenFromMessage(h.emails.at(-1), "accept-invitation");
    const raceInviteHash = await hashToken(raceInviteToken);
    const inviteEmailsBeforeDuplicate = h.emails.length;
    response = await h.api("/api/org/invitations", {
      method: "POST", auth: owner,
      body: { email: "invite-race@example.com", role: "teacher" }
    });
    const duplicateInvite = await response.json();
    check("rapid exact invitation duplicate is idempotent",
      response.status === 202 && duplicateInvite.invitationId === raceInvite.invitationId, duplicateInvite);
    await h.drain();
    check("rapid exact invitation duplicate preserves token and sends no second email",
      h.emails.length === inviteEmailsBeforeDuplicate
        && h.row("SELECT token_hash FROM organization_invitations WHERE id = ?1", raceInvite.invitationId)?.token_hash === raceInviteHash);'''
)

replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    const resetRace = await register(h, "reset-write-race@example.com", "Reset Write Race");
    const resetEmailsBefore = h.emails.length;''',
    '''    const duplicateReset = await register(h, "duplicate-reset@example.com", "Duplicate Reset");
    let resetResponse = await h.api("/api/auth/password/reset/request", {
      method: "POST", body: { email: "duplicate-reset@example.com", turnstileToken: "test-turnstile" }
    });
    check("password-reset duplicate fixture is accepted", resetResponse.status === 202);
    await h.drain();
    const resetTokenHashBefore = h.row("SELECT token_hash FROM password_reset_tokens WHERE user_id = ?1 AND revoked_at IS NULL", duplicateReset.data.user.id)?.token_hash;
    const resetDuplicateEmailsBefore = h.emails.length;
    resetResponse = await h.api("/api/auth/password/reset/request", {
      method: "POST", body: { email: "duplicate-reset@example.com", turnstileToken: "test-turnstile" }
    });
    check("rapid exact password-reset duplicate is idempotent", resetResponse.status === 202);
    await h.drain();
    check("rapid exact password-reset duplicate preserves token and sends no second email",
      h.emails.length === resetDuplicateEmailsBefore
        && h.row("SELECT token_hash FROM password_reset_tokens WHERE user_id = ?1 AND revoked_at IS NULL", duplicateReset.data.user.id)?.token_hash === resetTokenHashBefore);

    const resetRace = await register(h, "reset-write-race@example.com", "Reset Write Race");
    const resetEmailsBefore = h.emails.length;'''
)

replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    const legacyEmail = "legacy-unverified@example.com";
    const legacyNow = new Date().toISOString();
    h.sqlite.prepare("UPDATE users SET email = ?, email_verified_at = NULL, email_updated_at = ?, updated_at = ? WHERE id = ?")
      .run(legacyEmail, legacyNow, legacyNow, legacy.userId);''',
    '''    const legacyEmail = "legacy-unverified@example.com";
    const legacyNow = new Date().toISOString();
    h.sqlite.prepare("UPDATE users SET email = ?, email_verified_at = NULL, email_updated_at = ?, updated_at = ? WHERE id = ?")
      .run(legacyEmail, legacyNow, legacyNow, legacy.userId);
    const legacyCredentials = h.row("SELECT password_scheme,password_hash,password_salt FROM users WHERE id = ?1", legacy.userId);
    const legacyExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    h.sqlite.prepare(`INSERT INTO pending_registrations
      (id,email,display_name,organization_name,password_scheme,password_hash,password_salt,token_hash,
       created_at,expires_at,verified_at,revoked_at,last_sent_at,resend_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,0)`)
      .run("reg_legacy_stale", legacyEmail, "Legacy Stale", "Legacy Stale Workspace",
        legacyCredentials.password_scheme, legacyCredentials.password_hash, legacyCredentials.password_salt,
        "legacy_stale_token_hash", legacyNow, legacyExpiry, legacyNow);'''
)

replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("unverified existing email can be enrolled instead of being trapped as unchanged", response.status === 202, await response.clone().json());
    await h.drain();
    const enrollmentToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");''',
    '''    check("unverified existing email can be enrolled instead of being trapped as unchanged", response.status === 202, await response.clone().json());
    check("enrollment revokes stale pending-registration claim owned by the existing account",
      Boolean(h.row("SELECT revoked_at FROM pending_registrations WHERE id = 'reg_legacy_stale'")?.revoked_at));
    await h.drain();
    const enrollmentToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");'''
)

# Create a stale old-email registration after a change request; successful
# confirmation must invalidate it before freeing the old address.
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("email change raw token is absent from D1", h.row("SELECT token_hash FROM email_change_requests WHERE user_id = ?1", teacher.user.id)?.token_hash === await hashToken(changeToken));

    response = await h.api("/api/auth/email-change/confirm", { method: "POST", body: { token: changeToken } });''',
    '''    check("email change raw token is absent from D1", h.row("SELECT token_hash FROM email_change_requests WHERE user_id = ?1", teacher.user.id)?.token_hash === await hashToken(changeToken));
    const teacherCredentials = h.row("SELECT password_scheme,password_hash,password_salt FROM users WHERE id = ?1", teacher.user.id);
    const staleNow = new Date().toISOString();
    const staleExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    h.sqlite.prepare(`INSERT INTO pending_registrations
      (id,email,display_name,organization_name,password_scheme,password_hash,password_salt,token_hash,
       created_at,expires_at,verified_at,revoked_at,last_sent_at,resend_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,0)`)
      .run("reg_old_email_stale", "teacher@example.com", "Old Email Stale", "Old Email Stale Workspace",
        teacherCredentials.password_scheme, teacherCredentials.password_hash, teacherCredentials.password_salt,
        "old_email_stale_token_hash", staleNow, staleExpiry, staleNow);

    response = await h.api("/api/auth/email-change/confirm", { method: "POST", body: { token: changeToken } });'''
)

replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("email change revokes all sessions", h.row("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL", teacher.user.id)?.count === 0);
    await h.drain();''',
    '''    check("email change revokes all sessions", h.row("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL", teacher.user.id)?.count === 0);
    check("email change revokes stale registration link for the freed old address",
      Boolean(h.row("SELECT revoked_at FROM pending_registrations WHERE id = 'reg_old_email_stale'")?.revoked_at));
    await h.drain();'''
)

print("Final email identity/idempotency hardening v6 applied")
