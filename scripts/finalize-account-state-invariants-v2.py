from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
V1 = ROOT / "scripts" / "fix-account-state-invariants.py"


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:900]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def prepare_v1():
    lines = V1.read_text(encoding="utf-8").splitlines()
    marker = "    if count != 1:"
    index = lines.index(marker)
    raise_line = lines[index + 1]
    lines[index:index + 2] = [
        "    if count == 0:",
        raise_line,
        "    if count > 1 and 'details: { newEmailMask: maskEmail(newEmail), expiresAt }' not in old:",
        raise_line,
    ]
    V1.write_text("\n".join(lines) + "\n", encoding="utf-8")


prepare_v1()
subprocess.run([sys.executable, str(V1)], cwd=ROOT, check=True)

# Registration must release expired account-change reservations immediately;
# otherwise partial unique indexes keep an address locked until cron cleanup.
replace_once(
    "src/routes/email-auth.js",
    '''  const id = makeId("reg");
  try {
    await env.DB_V2.batch([
      env.DB_V2.prepare(
        `UPDATE pending_registrations SET revoked_at = ?1
         WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
      ).bind(nowIso, email),''',
    '''  const id = makeId("reg");
  try {
    await env.DB_V2.batch([
      env.DB_V2.prepare(
        `UPDATE email_change_requests SET revoked_at = ?1
         WHERE new_email = ?2 COLLATE NOCASE
           AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at <= ?1`
      ).bind(nowIso, email),
      env.DB_V2.prepare(
        `UPDATE email_enrollment_requests SET revoked_at = ?1
         WHERE new_email = ?2 COLLATE NOCASE
           AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at <= ?1`
      ).bind(nowIso, email),
      env.DB_V2.prepare(
        `UPDATE pending_registrations SET revoked_at = ?1
         WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
      ).bind(nowIso, email),'''
)

# Preserve the precise legacy race result: if another request completed the
# account first, this is already-completed rather than a generic reservation conflict.
replace_once(
    "src/routes/email-auth.js",
    '''  if (!completed) {
    if (await registrationEmailUnavailable(env.DB_V2, pending.email, nowIso)) {
      throw new AuthError(409, "EMAIL_UNAVAILABLE");
    }
    console.error("Registration verification completion invariant failed");
    throw new AuthError(400, "REGISTRATION_TOKEN_INVALID");
  }
''',
    '''  if (!completed) {
    const completedUser = await env.DB_V2.prepare(
      `SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
    ).bind(pending.email).first();
    if (completedUser) throw new AuthError(400, "REGISTRATION_ALREADY_COMPLETED");
    if (await registrationEmailUnavailable(env.DB_V2, pending.email, nowIso)) {
      throw new AuthError(409, "EMAIL_UNAVAILABLE");
    }
    console.error("Registration verification completion invariant failed");
    throw new AuthError(400, "REGISTRATION_TOKEN_INVALID");
  }
'''
)

# Keep the email-change/enrollment branch decision consistent for legacy users
# that already have an unverified address.
replace_once(
    "src/routes/account-lifecycle.js",
    '''  const requestId = makeId(user.email ? "emc" : "eme");
  try {
    if (user.email && user.email_verified_at) {''',
    '''  const hasVerifiedEmail = Boolean(user.email && user.email_verified_at);
  const requestId = makeId(hasVerifiedEmail ? "emc" : "eme");
  try {
    if (hasVerifiedEmail) {'''
)
replace_once(
    "src/routes/account-lifecycle.js",
    '''    enrollment: !(user.email && user.email_verified_at),''',
    '''    enrollment: !hasVerifiedEmail,'''
)

# Organization invitations must not race or override an existing account's
# active email-change/enrollment claim. Existing but unusable accounts also
# must not be presented as new identities.
replace_once(
    "src/routes/account-lifecycle.js",
    '''  const existingUser = await env.DB_V2.prepare(
    `SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(email).first();
  if (existingUser) {
    const membership = await env.DB_V2.prepare(
      `SELECT status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2 LIMIT 1`
    ).bind(auth.organizationId, existingUser.id).first();
    if (membership && membership.status !== "removed") throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");
  }

  const organization = await env.DB_V2.prepare(''',
    '''  const existingUser = await env.DB_V2.prepare(
    `SELECT id, email_verified_at, status FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(email).first();
  if (existingUser) {
    if (existingUser.status !== "active" || !existingUser.email_verified_at) {
      throw new AuthError(409, "EMAIL_UNAVAILABLE");
    }
    const membership = await env.DB_V2.prepare(
      `SELECT status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2 LIMIT 1`
    ).bind(auth.organizationId, existingUser.id).first();
    if (membership && membership.status !== "removed") throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");
  }
  if (await emailReservedForAccountChange(env.DB_V2, email)) throw new AuthError(409, "EMAIL_UNAVAILABLE");

  const organization = await env.DB_V2.prepare('''
)

replace_once(
    "src/routes/account-lifecycle.js",
    '''  if (await env.DB_V2.prepare(`SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`).bind(invitation.email).first()) {
    throw new AuthError(409, "INVITATION_LOGIN_REQUIRED");
  }
  const salt = createSalt();''',
    '''  if (await env.DB_V2.prepare(`SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`).bind(invitation.email).first()) {
    throw new AuthError(409, "INVITATION_LOGIN_REQUIRED");
  }
  if (await emailReservedForAccountChange(env.DB_V2, invitation.email)) {
    throw new AuthError(409, "EMAIL_UNAVAILABLE");
  }
  const salt = createSalt();'''
)

# Write-time guards close the precheck race. D1 batch serialization then gives
# the address to whichever valid identity transition commits first.
replace_once(
    "src/routes/account-lifecycle.js",
    '''           FROM organization_invitations i
           WHERE i.id = ?8 AND i.token_hash = ?9 AND i.accepted_at IS NULL
             AND i.revoked_at IS NULL AND i.expires_at > ?7`''',
    '''           FROM organization_invitations i
           WHERE i.id = ?8 AND i.token_hash = ?9 AND i.accepted_at IS NULL
             AND i.revoked_at IS NULL AND i.expires_at > ?7
             AND NOT EXISTS (
               SELECT 1 FROM email_change_requests c
               WHERE c.new_email = i.email COLLATE NOCASE
                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?7
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_enrollment_requests e
               WHERE e.new_email = i.email COLLATE NOCASE
                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?7
             )`'''
)

# If an invitation creates the account first, a previously started self-signup
# for the same address becomes stale and must not keep sending usable links.
replace_once(
    "src/routes/account-lifecycle.js",
    '''      invitationAuditStatement(env.DB_V2, {
        invitationId: invitation.id,
        claimMarker,
        organizationId: invitation.organization_id,
        userId,
        role: invitation.role,
        action: "organization.invitation.accepted",
        createdAt: nowIso
      })
    ]);''',
    '''      invitationAuditStatement(env.DB_V2, {
        invitationId: invitation.id,
        claimMarker,
        organizationId: invitation.organization_id,
        userId,
        role: invitation.role,
        action: "organization.invitation.accepted",
        createdAt: nowIso
      }),
      env.DB_V2.prepare(
        `UPDATE pending_registrations SET revoked_at = ?1
         WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL
           AND EXISTS (SELECT 1 FROM users WHERE id = ?3)`
      ).bind(nowIso, invitation.email, userId)
    ]);'''
)

replace_once(
    "src/routes/account-lifecycle.js",
    '''  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[2]?.meta?.changes || 0) !== 1
      || Number(results?.[3]?.meta?.changes || 0) !== 1) {
    throw new AuthError(409, "INVITATION_UPDATE_CONFLICT");
  }
  return invitationAcceptedResponse(request, env, {
    userId,
    email: invitation.email,''',
    '''  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[2]?.meta?.changes || 0) !== 1
      || Number(results?.[3]?.meta?.changes || 0) !== 1) {
    if (await env.DB_V2.prepare(`SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`).bind(invitation.email).first()) {
      throw new AuthError(409, "INVITATION_LOGIN_REQUIRED");
    }
    if (await emailReservedForAccountChange(env.DB_V2, invitation.email)) {
      throw new AuthError(409, "EMAIL_UNAVAILABLE");
    }
    throw new AuthError(409, "INVITATION_UPDATE_CONFLICT");
  }
  return invitationAcceptedResponse(request, env, {
    userId,
    email: invitation.email,'''
)

replace_once(
    "src/routes/account-lifecycle.js",
    '''async function emailUnavailable(db, email, userId, nowIso = new Date().toISOString()) {''',
    '''async function emailReservedForAccountChange(db, email, nowIso = new Date().toISOString()) {
  const row = await db.prepare(
    `SELECT 1 AS found FROM email_change_requests
     WHERE new_email = ?1 COLLATE NOCASE
       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
     UNION ALL
     SELECT 1 AS found FROM email_enrollment_requests
     WHERE new_email = ?1 COLLATE NOCASE
       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
     LIMIT 1`
  ).bind(email, nowIso).first();
  return Boolean(row);
}

async function emailUnavailable(db, email, userId, nowIso = new Date().toISOString()) {'''
)

# Invitation inspection should not offer "create a new account" when any
# account already owns the address. It separately reports whether that account
# is currently eligible to accept an invitation.
replace_once(
    "src/routes/account-lifecycle.js",
    '''      accountExists: Boolean(user && user.email_verified_at && user.status === "active")
''',
    '''      accountExists: Boolean(user),
      accountAvailable: !user || Boolean(user.email_verified_at && user.status === "active")
'''
)

replace_once(
    "public/assets/accept-invitation.js",
    '''  show(invitation.accountExists ? "existingSection" : "newSection", true);
  setStatus(invitation.accountExists ? "ログイン後に招待を承認します。" : "アカウントを作成して招待を承認します。");
''',
    '''  if (invitation.accountExists && invitation.accountAvailable === false) {
    setStatus("このメールアドレスの既存アカウントは現在この招待を承認できません。組織の管理者に確認してください。", true);
    return;
  }
  show(invitation.accountExists ? "existingSection" : "newSection", true);
  setStatus(invitation.accountExists ? "ログイン後に招待を承認します。" : "アカウントを作成して招待を承認します。");
'''
)

# Extend the existing lifecycle regression with cross-flow invitation cases.
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("email change rejects an address reserved by pending registration",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");

    response = await h.api("/api/auth/email-change/request", {''',
    '''    check("email change rejects an address reserved by pending registration",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");

    response = await h.api("/api/org/invitations", {
      method: "POST", auth: owner,
      body: { email: "pending-claim@example.com", role: "teacher" }
    });
    const pendingInvite = await response.json();
    check("pending self-registration can receive an organization invitation", response.status === 202, pendingInvite);
    await h.drain();
    const pendingInviteToken = tokenFromMessage(h.emails.at(-1), "accept-invitation");
    response = await h.api("/api/auth/invitations/accept", {
      method: "POST",
      body: { token: pendingInviteToken, displayName: "Pending Claim", password: PASSWORD }
    });
    check("invitation may complete the identity before self-registration", response.status === 201, await response.clone().json());
    check("invitation-created identity revokes the stale self-registration",
      Boolean(h.row("SELECT revoked_at FROM pending_registrations WHERE email = 'pending-claim@example.com'")?.revoked_at));

    response = await h.api("/api/auth/email-change/request", {'''
)

replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("reserved email does not create a competing pending registration or send verification",
      h.emails.length === emailsBeforeBlockedRegistration
        && h.row("SELECT COUNT(*) AS count FROM pending_registrations WHERE email = 'reserved-change@example.com' AND verified_at IS NULL AND revoked_at IS NULL")?.count === 0);

    const second = await register(h, "identity-second@example.com", "Identity Second");
''',
    '''    check("reserved email does not create a competing pending registration or send verification",
      h.emails.length === emailsBeforeBlockedRegistration
        && h.row("SELECT COUNT(*) AS count FROM pending_registrations WHERE email = 'reserved-change@example.com' AND verified_at IS NULL AND revoked_at IS NULL")?.count === 0);
    response = await h.api("/api/org/invitations", {
      method: "POST", auth: owner,
      body: { email: "reserved-change@example.com", role: "teacher" }
    });
    check("organization invitation cannot override an active email-change reservation",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");

    const second = await register(h, "identity-second@example.com", "Identity Second");
    response = await h.api("/api/org/invitations", {
      method: "POST", auth: owner,
      body: { email: "invite-race@example.com", role: "teacher" }
    });
    const raceInvite = await response.json();
    check("invitation race fixture is created", response.status === 202, raceInvite);
    await h.drain();
    const raceInviteToken = tokenFromMessage(h.emails.at(-1), "accept-invitation");
    response = await h.api("/api/auth/email-change/request", {
      method: "POST", auth: second,
      body: { newEmail: "invite-race@example.com", currentPassword: PASSWORD }
    });
    check("existing account can reserve an address after an invitation was issued", response.status === 202);
    response = await h.api("/api/auth/invitations/accept", {
      method: "POST",
      body: { token: raceInviteToken, displayName: "Race Invite", password: PASSWORD }
    });
    check("invitation acceptance cannot steal a later account-change reservation",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");
'''
)

replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    h.sqlite.prepare("UPDATE users SET email = ?, email_verified_at = NULL, email_updated_at = ?, updated_at = ? WHERE id = ?")
      .run(legacyEmail, legacyNow, legacyNow, legacy.userId);
    response = await h.api("/api/auth/email-change/request", {''',
    '''    h.sqlite.prepare("UPDATE users SET email = ?, email_verified_at = NULL, email_updated_at = ?, updated_at = ? WHERE id = ?")
      .run(legacyEmail, legacyNow, legacyNow, legacy.userId);
    const externalOwner = await register(h, "identity-external-owner@example.com", "External Owner");
    response = await h.api("/api/org/invitations", {
      method: "POST", auth: externalOwner,
      body: { email: legacyEmail, role: "teacher" }
    });
    check("invitation rejects an existing account whose email is not verified",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");
    response = await h.api("/api/auth/email-change/request", {'''
)

print("Complete account and email identity invariant hardening applied")
