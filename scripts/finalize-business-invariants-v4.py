from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:1000]}")
    write(path, text.replace(old, new, 1))


def replace_between(path, start_marker, end_marker, replacement, search_from=0):
    text = read(path)
    start = text.find(start_marker, search_from)
    if start < 0:
        raise SystemExit(f"{path}: start marker not found: {start_marker}")
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise SystemExit(f"{path}: end marker not found: {end_marker}")
    write(path, text[:start] + replacement + text[end:])


path = "src/routes/account-lifecycle.js"

# ---------------------------------------------------------------------------
# Account deletion: invalidate any stale pre-registration for the current
# address before anonymizing the user. Otherwise an old verification link can
# recreate an identity immediately after account deletion.
# ---------------------------------------------------------------------------
replace_once(
    path,
    '''  const user = await env.DB_V2.prepare(
    `SELECT password_scheme, password_hash, password_salt
     FROM users WHERE id = ?1 AND status = 'active' LIMIT 1`
  ).bind(auth.userId).first();''',
    '''  const user = await env.DB_V2.prepare(
    `SELECT email, password_scheme, password_hash, password_salt
     FROM users WHERE id = ?1 AND status = 'active' LIMIT 1`
  ).bind(auth.userId).first();'''
)
replace_once(
    path,
    '''    env.DB_V2.prepare(`UPDATE email_change_requests SET revoked_at = ?1 WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`).bind(nowIso, auth.userId),
    env.DB_V2.prepare(`UPDATE email_enrollment_requests SET revoked_at = ?1 WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`).bind(nowIso, auth.userId),
    env.DB_V2.prepare(
      `UPDATE live_sessions''',
    '''    env.DB_V2.prepare(`UPDATE email_change_requests SET revoked_at = ?1 WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`).bind(nowIso, auth.userId),
    env.DB_V2.prepare(`UPDATE email_enrollment_requests SET revoked_at = ?1 WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL`).bind(nowIso, auth.userId),
    env.DB_V2.prepare(
      `UPDATE pending_registrations SET revoked_at = ?1
       WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, user.email || ""),
    env.DB_V2.prepare(
      `UPDATE live_sessions'''
)

# ---------------------------------------------------------------------------
# Invitation creation: close the gap between precheck and write. A target that
# becomes unavailable during the request must not revoke an older invite,
# create a dead invite, consume email quota/audit entries, or send an email.
# ---------------------------------------------------------------------------
function_start = read(path).find("async function handleInvitationCreate")
if function_start < 0:
    raise SystemExit("handleInvitationCreate not found")
start = read(path).find("  try {\n    await env.DB_V2.batch([", function_start)
end = read(path).find("  schedule(ctx, sendOrganizationInvitation", start)
if start < 0 or end < 0:
    raise SystemExit("invitation create batch markers not found")
new_create = '''  try {
    await env.DB_V2.batch([
      env.DB_V2.prepare(
        `UPDATE organization_invitations SET revoked_at = ?1
         WHERE organization_id = ?2 AND email = ?3 COLLATE NOCASE
           AND accepted_at IS NULL AND revoked_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM email_change_requests c
             WHERE c.new_email = ?3 COLLATE NOCASE
               AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?1
           )
           AND NOT EXISTS (
             SELECT 1 FROM email_enrollment_requests e
             WHERE e.new_email = ?3 COLLATE NOCASE
               AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?1
           )
           AND NOT EXISTS (
             SELECT 1 FROM users u
             WHERE u.email = ?3 COLLATE NOCASE
               AND (u.status <> 'active' OR u.email_verified_at IS NULL)
           )
           AND NOT EXISTS (
             SELECT 1 FROM users u
             JOIN organization_members m ON m.user_id = u.id
             WHERE u.email = ?3 COLLATE NOCASE AND m.organization_id = ?2
               AND m.status <> 'removed'
           )`
      ).bind(nowIso, auth.organizationId, email),
      env.DB_V2.prepare(
        `INSERT INTO organization_invitations (
           id, organization_id, email, role, token_hash, invited_by_user_id,
           created_at, expires_at, accepted_at, accepted_user_id, revoked_at,
           last_sent_at, resend_count
         )
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, NULL, ?7, 0
         WHERE NOT EXISTS (
           SELECT 1 FROM email_change_requests c
           WHERE c.new_email = ?3 COLLATE NOCASE
             AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?7
         )
           AND NOT EXISTS (
             SELECT 1 FROM email_enrollment_requests e
             WHERE e.new_email = ?3 COLLATE NOCASE
               AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?7
           )
           AND NOT EXISTS (
             SELECT 1 FROM users u
             WHERE u.email = ?3 COLLATE NOCASE
               AND (u.status <> 'active' OR u.email_verified_at IS NULL)
           )
           AND NOT EXISTS (
             SELECT 1 FROM users u
             JOIN organization_members m ON m.user_id = u.id
             WHERE u.email = ?3 COLLATE NOCASE AND m.organization_id = ?2
               AND m.status <> 'removed'
           )`
      ).bind(invitationId, auth.organizationId, email, role, tokenHash, auth.userId, nowIso, expiresAt),
      conditionalOrganizationEmailEventStatement(env.DB_V2, {
        id: eventId,
        organizationId: auth.organizationId,
        createdAt: nowIso,
        invitationId,
        tokenHash
      }),
      conditionalInvitationAuditStatement(env.DB_V2, {
        organizationId: auth.organizationId,
        actorType: "user",
        actorUserId: auth.userId,
        actorRole: auth.role,
        action: "organization.invitation.created",
        targetType: "organization_invitation",
        targetId: invitationId,
        details: { role, emailMask: maskEmail(email), expiresAt },
        invitationId,
        tokenHash
      })
    ]);
  } catch (error) {
    throw mapInvitationDatabaseError(error);
  }
  const created = await env.DB_V2.prepare(
    `SELECT 1 AS found FROM organization_invitations
     WHERE id = ?1 AND organization_id = ?2 AND token_hash = ?3
       AND accepted_at IS NULL AND revoked_at IS NULL LIMIT 1`
  ).bind(invitationId, auth.organizationId, tokenHash).first();
  if (!created) {
    await assertInvitationTargetAvailable(env.DB_V2, auth.organizationId, email, nowIso);
    throw new AuthError(409, "INVITATION_CONFLICT");
  }
'''
text = read(path)
write(path, text[:start] + new_create + text[end:])

# ---------------------------------------------------------------------------
# Invitation resend: repeat the target invariant in the UPDATE itself. A state
# change after the precheck may not rotate the token or produce a dead email.
# ---------------------------------------------------------------------------
replace_once(
    path,
    '''        `UPDATE organization_invitations
         SET token_hash = ?1, last_sent_at = ?2, expires_at = ?3, resend_count = resend_count + 1
         WHERE id = ?4 AND organization_id = ?5 AND token_hash = ?6
           AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?2`
      ).bind(tokenHash, nowIso, newExpiry, invitationId, auth.organizationId, invitation.token_hash),''',
    '''        `UPDATE organization_invitations
         SET token_hash = ?1, last_sent_at = ?2, expires_at = ?3, resend_count = resend_count + 1
         WHERE id = ?4 AND organization_id = ?5 AND token_hash = ?6
           AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
           AND NOT EXISTS (
             SELECT 1 FROM email_change_requests c
             WHERE c.new_email = organization_invitations.email COLLATE NOCASE
               AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?2
           )
           AND NOT EXISTS (
             SELECT 1 FROM email_enrollment_requests e
             WHERE e.new_email = organization_invitations.email COLLATE NOCASE
               AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?2
           )
           AND NOT EXISTS (
             SELECT 1 FROM users u
             WHERE u.email = organization_invitations.email COLLATE NOCASE
               AND (u.status <> 'active' OR u.email_verified_at IS NULL)
           )
           AND NOT EXISTS (
             SELECT 1 FROM users u
             JOIN organization_members m ON m.user_id = u.id
             WHERE u.email = organization_invitations.email COLLATE NOCASE
               AND m.organization_id = ?5 AND m.status <> 'removed'
           )`
      ).bind(tokenHash, nowIso, newExpiry, invitationId, auth.organizationId, invitation.token_hash),'''
)
replace_once(
    path,
    '''  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[2]?.meta?.changes || 0) !== 1) {
    throw new AuthError(409, "INVITATION_UPDATE_CONFLICT");
  }
''',
    '''  if (Number(results?.[0]?.meta?.changes || 0) !== 1
      || Number(results?.[1]?.meta?.changes || 0) !== 1
      || Number(results?.[2]?.meta?.changes || 0) !== 1) {
    await assertInvitationTargetAvailable(env.DB_V2, auth.organizationId, invitation.email, nowIso);
    throw new AuthError(409, "INVITATION_UPDATE_CONFLICT");
  }
'''
)

# ---------------------------------------------------------------------------
# Email-change/enrollment replacement: a failed new target must not revoke the
# user's currently valid confirmation link. The revocation statements repeat
# the target availability predicate before they invalidate older requests.
# ---------------------------------------------------------------------------
text = read(path)
func = text.find("async function handleEmailChangeRequest")
start = text.find("    if (hasVerifiedEmail) {", func)
end = text.find("  } catch (error) {", start)
if start < 0 or end < 0:
    raise SystemExit("email-change branch markers not found")
new_email_branches = '''    if (hasVerifiedEmail) {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `UPDATE email_change_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?3 COLLATE NOCASE AND u.id <> ?2)
             AND NOT EXISTS (
               SELECT 1 FROM pending_registrations p
               WHERE p.email = ?3 COLLATE NOCASE AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?1
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_change_requests c
               WHERE c.new_email = ?3 COLLATE NOCASE AND c.user_id <> ?2
                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?1
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_enrollment_requests e
               WHERE e.new_email = ?3 COLLATE NOCASE AND e.user_id <> ?2
                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?1
             )`
        ).bind(nowIso, auth.userId, newEmail),
        env.DB_V2.prepare(
          `UPDATE email_enrollment_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?3 COLLATE NOCASE AND u.id <> ?2)
             AND NOT EXISTS (
               SELECT 1 FROM pending_registrations p
               WHERE p.email = ?3 COLLATE NOCASE AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?1
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_change_requests c
               WHERE c.new_email = ?3 COLLATE NOCASE AND c.user_id <> ?2
                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?1
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_enrollment_requests e
               WHERE e.new_email = ?3 COLLATE NOCASE AND e.user_id <> ?2
                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?1
             )`
        ).bind(nowIso, auth.userId, newEmail),
        env.DB_V2.prepare(
          `INSERT INTO email_change_requests (
             id, user_id, old_email, new_email, token_hash, created_at, expires_at, confirmed_at, revoked_at
           )
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL
           WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?4 COLLATE NOCASE AND u.id <> ?2)
             AND NOT EXISTS (
               SELECT 1 FROM pending_registrations p
               WHERE p.email = ?4 COLLATE NOCASE AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?6
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_change_requests c
               WHERE c.new_email = ?4 COLLATE NOCASE AND c.user_id <> ?2
                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?6
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_enrollment_requests e
               WHERE e.new_email = ?4 COLLATE NOCASE AND e.user_id <> ?2
                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?6
             )`
        ).bind(requestId, auth.userId, user.email, newEmail, tokenHash, nowIso, expiresAt),
        auditStatement(env.DB_V2, {
          organizationId: auth.organizationId,
          actorType: "user",
          actorUserId: auth.userId,
          actorRole: auth.role,
          action: "auth.email_change.requested",
          targetType: "user",
          targetId: auth.userId,
          details: { newEmailMask: maskEmail(newEmail), expiresAt },
          condition: { sql: "EXISTS (SELECT 1 FROM email_change_requests WHERE id = ?11)", bindings: [requestId] }
        })
      ]);
    } else {
      await env.DB_V2.batch([
        env.DB_V2.prepare(
          `UPDATE email_enrollment_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?3 COLLATE NOCASE AND u.id <> ?2)
             AND NOT EXISTS (
               SELECT 1 FROM pending_registrations p
               WHERE p.email = ?3 COLLATE NOCASE AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?1
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_change_requests c
               WHERE c.new_email = ?3 COLLATE NOCASE AND c.user_id <> ?2
                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?1
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_enrollment_requests e
               WHERE e.new_email = ?3 COLLATE NOCASE AND e.user_id <> ?2
                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?1
             )`
        ).bind(nowIso, auth.userId, newEmail),
        env.DB_V2.prepare(
          `UPDATE email_change_requests SET revoked_at = ?1
           WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?3 COLLATE NOCASE AND u.id <> ?2)
             AND NOT EXISTS (
               SELECT 1 FROM pending_registrations p
               WHERE p.email = ?3 COLLATE NOCASE AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?1
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_change_requests c
               WHERE c.new_email = ?3 COLLATE NOCASE AND c.user_id <> ?2
                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?1
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_enrollment_requests e
               WHERE e.new_email = ?3 COLLATE NOCASE AND e.user_id <> ?2
                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?1
             )`
        ).bind(nowIso, auth.userId, newEmail),
        env.DB_V2.prepare(
          `INSERT INTO email_enrollment_requests (
             id, user_id, new_email, token_hash, created_at, expires_at, confirmed_at, revoked_at
           )
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL
           WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?3 COLLATE NOCASE AND u.id <> ?2)
             AND NOT EXISTS (
               SELECT 1 FROM pending_registrations p
               WHERE p.email = ?3 COLLATE NOCASE AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?5
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_change_requests c
               WHERE c.new_email = ?3 COLLATE NOCASE AND c.user_id <> ?2
                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?5
             )
             AND NOT EXISTS (
               SELECT 1 FROM email_enrollment_requests e
               WHERE e.new_email = ?3 COLLATE NOCASE AND e.user_id <> ?2
                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?5
             )`
        ).bind(requestId, auth.userId, newEmail, tokenHash, nowIso, expiresAt),
        auditStatement(env.DB_V2, {
          organizationId: auth.organizationId,
          actorType: "user",
          actorUserId: auth.userId,
          actorRole: auth.role,
          action: "auth.email_enrollment.requested",
          targetType: "user",
          targetId: auth.userId,
          details: { newEmailMask: maskEmail(newEmail), expiresAt },
          condition: { sql: "EXISTS (SELECT 1 FROM email_enrollment_requests WHERE id = ?11)", bindings: [requestId] }
        })
      ]);
    }
'''
text = read(path)
write(path, text[:start] + new_email_branches + text[end:])

# Shared post-write invitation target classification for races.
replace_once(
    path,
    '''async function emailReservedForAccountChange(db, email, nowIso = new Date().toISOString()) {''',
    '''async function assertInvitationTargetAvailable(db, organizationId, email, nowIso = new Date().toISOString()) {
  const user = await db.prepare(
    `SELECT id, email_verified_at, status FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(email).first();
  if (user) {
    if (user.status !== "active" || !user.email_verified_at) throw new AuthError(409, "EMAIL_UNAVAILABLE");
    const membership = await db.prepare(
      `SELECT status FROM organization_members WHERE organization_id = ?1 AND user_id = ?2 LIMIT 1`
    ).bind(organizationId, user.id).first();
    if (membership && membership.status !== "removed") throw new AuthError(409, "MEMBERSHIP_ALREADY_EXISTS");
  }
  if (await emailReservedForAccountChange(db, email, nowIso)) throw new AuthError(409, "EMAIL_UNAVAILABLE");
}

async function emailReservedForAccountChange(db, email, nowIso = new Date().toISOString()) {'''
)

# ---------------------------------------------------------------------------
# Regressions: inject state changes immediately before the target DB batch to
# exercise race windows that ordinary sequential tests cannot reach.
# ---------------------------------------------------------------------------
path = "scripts/test-account-lifecycle-v2.mjs"
replace_once(
    path,
    '''    check("blocked invitation resend sends no useless email", h.emails.length === emailsBeforeBlockedResend);
    response = await h.api("/api/auth/email-change/request", {''',
    '''    check("blocked invitation resend sends no useless email", h.emails.length === emailsBeforeBlockedResend);

    const writeRaceAccount = await register(h, "write-race-owner@example.com", "Write Race Owner");
    const inviteWriteRaceEmail = "invite-write-race@example.com";
    const inviteEmailsBeforeRace = h.emails.length;
    h.db.beforeBatch = (statements) => {
      if (!statements.some((statement) => statement.sql.includes("INSERT INTO organization_invitations"))) return false;
      const row = h.row("SELECT email FROM users WHERE id = ?1", writeRaceAccount.data.user.id);
      const raceNow = new Date().toISOString();
      const raceExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      h.sqlite.prepare(`INSERT INTO email_change_requests
        (id,user_id,old_email,new_email,token_hash,created_at,expires_at,confirmed_at,revoked_at)
        VALUES (?,?,?,?,?,?,?,NULL,NULL)`)
        .run("emc_write_race", writeRaceAccount.data.user.id, row.email, inviteWriteRaceEmail,
          "write_race_token_hash", raceNow, raceExpiry);
      return true;
    };
    response = await h.api("/api/org/invitations", {
      method: "POST", auth: owner,
      body: { email: inviteWriteRaceEmail, role: "teacher" }
    });
    check("invitation creation rechecks target availability at write time",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");
    await h.drain();
    check("write-time invitation conflict creates no dead invite or email",
      h.emails.length === inviteEmailsBeforeRace
        && h.row("SELECT COUNT(*) AS count FROM organization_invitations WHERE email = ?1", inviteWriteRaceEmail)?.count === 0);

    const preserveOwner = await register(h, "preserve-change-owner@example.com", "Preserve Change Owner");
    response = await h.api("/api/auth/email-change/request", {
      method: "POST", auth: preserveOwner,
      body: { newEmail: "preserve-valid@example.com", currentPassword: PASSWORD }
    });
    check("preservation fixture email change requested", response.status === 202);
    await h.drain();
    const preserveToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");
    const preserveRow = h.row("SELECT id FROM email_change_requests WHERE user_id = ?1 AND revoked_at IS NULL", preserveOwner.data.user.id);
    const conflictEmail = "change-write-race@example.com";
    h.db.beforeBatch = (statements) => {
      if (!statements.some((statement) => statement.sql.includes("INSERT INTO email_change_requests"))) return false;
      const source = h.row("SELECT password_scheme,password_hash,password_salt FROM users WHERE id = ?1", preserveOwner.data.user.id);
      const raceNow = new Date().toISOString();
      const raceExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      h.sqlite.prepare(`INSERT INTO pending_registrations
        (id,email,display_name,organization_name,password_scheme,password_hash,password_salt,token_hash,
         created_at,expires_at,verified_at,revoked_at,last_sent_at,resend_count)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,0)`)
        .run("reg_change_write_race", conflictEmail, "Race Pending", "Race Pending Workspace",
          source.password_scheme, source.password_hash, source.password_salt, "change_write_race_token_hash",
          raceNow, raceExpiry, raceNow);
      return true;
    };
    response = await h.api("/api/auth/email-change/request", {
      method: "POST", auth: preserveOwner,
      body: { newEmail: conflictEmail, currentPassword: PASSWORD }
    });
    check("email change detects a target claimed after its precheck",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");
    check("failed replacement does not revoke the previous valid email-change request",
      h.row("SELECT revoked_at FROM email_change_requests WHERE id = ?1", preserveRow.id)?.revoked_at === null);
    response = await h.api("/api/auth/email-change/confirm", { method: "POST", body: { token: preserveToken } });
    check("previous email-change token remains usable after a failed replacement",
      response.status === 200 && (await response.json()).email === "preserve-valid@example.com");

    response = await h.api("/api/auth/email-change/request", {'''
)

# Account deletion regression gets a deliberately inconsistent stale pending
# registration to ensure deletion invalidates it before anonymization.
replace_once(
    path,
    '''    check("account deletion requires the current password", response.status === 401 && (await response.json()).error === "CURRENT_PASSWORD_INVALID");

    response = await h.api("/api/auth/account", {''',
    '''    check("account deletion requires the current password", response.status === 401 && (await response.json()).error === "CURRENT_PASSWORD_INVALID");

    const deleteUserCredentials = h.row("SELECT password_scheme,password_hash,password_salt FROM users WHERE id = ?1", owner.data.user.id);
    const pendingNow = new Date().toISOString();
    const pendingExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    h.sqlite.prepare(`INSERT INTO pending_registrations
      (id,email,display_name,organization_name,password_scheme,password_hash,password_salt,token_hash,
       created_at,expires_at,verified_at,revoked_at,last_sent_at,resend_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,0)`)
      .run("reg_delete_stale", "delete-owner@example.com", "Delete Stale", "Delete Stale Workspace",
        deleteUserCredentials.password_scheme, deleteUserCredentials.password_hash, deleteUserCredentials.password_salt,
        "delete_stale_token_hash", pendingNow, pendingExpiry, pendingNow);

    response = await h.api("/api/auth/account", {'''
)
replace_once(
    path,
    '''    check("account deletion revokes every session", h.row("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL", owner.data.user.id)?.count === 0);

    response = await h.api("/api/auth/login",''',
    '''    check("account deletion revokes every session", h.row("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL", owner.data.user.id)?.count === 0);
    check("account deletion revokes stale pending registration for the old email",
      Boolean(h.row("SELECT revoked_at FROM pending_registrations WHERE id = 'reg_delete_stale'")?.revoked_at));

    response = await h.api("/api/auth/login",'''
)

# Add a deterministic before-batch hook to the local D1 adapter. Returning
# false leaves the hook armed for a later, more specific batch.
replace_once(
    path,
    '''class D1DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new D1PreparedAdapter(this.sqlite, sql); }
  async batch(statements) { this.sqlite.exec("BEGIN IMMEDIATE;"); try { const output = statements.map((s) => s.executeRun()); this.sqlite.exec("COMMIT;"); return output; } catch (e) { this.sqlite.exec("ROLLBACK;"); throw e; } }
  async exec(sql) { this.sqlite.exec(sql); return { count: 0, duration: 0 }; }
}''',
    '''class D1DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; this.beforeBatch = null; }
  prepare(sql) { return new D1PreparedAdapter(this.sqlite, sql); }
  async batch(statements) {
    if (typeof this.beforeBatch === "function") {
      const hook = this.beforeBatch;
      const handled = hook(statements);
      if (handled !== false) this.beforeBatch = null;
    }
    this.sqlite.exec("BEGIN IMMEDIATE;");
    try { const output = statements.map((s) => s.executeRun()); this.sqlite.exec("COMMIT;"); return output; }
    catch (e) { this.sqlite.exec("ROLLBACK;"); throw e; }
  }
  async exec(sql) { this.sqlite.exec(sql); return { count: 0, duration: 0 }; }
}'''
)

print("Final business invariant hardening v4 applied")
