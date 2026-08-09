from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:800]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def insert_before(path, marker, addition):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f"{path}: expected one marker, found {count}: {marker}")
    target.write_text(text.replace(marker, addition + marker, 1), encoding="utf-8")

# ---------------------------------------------------------------------------
# src/routes/account-lifecycle.js
# ---------------------------------------------------------------------------
path = "src/routes/account-lifecycle.js"

replace_once(
    path,
    '  if (normalizeEmail(user.email) === newEmail) throw new AuthError(409, "EMAIL_UNCHANGED");\n  await consumePublicEmailRateLimit(request, env, newEmail, "email-change");\n  if (await emailUnavailable(env.DB_V2, newEmail, auth.userId)) throw new AuthError(409, "EMAIL_UNAVAILABLE");\n\n  const rawToken = createToken();\n  const tokenHash = await hashToken(rawToken);\n  const now = new Date();\n  const nowIso = now.toISOString();\n  const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS).toISOString();\n',
    '  if (user.email_verified_at && normalizeEmail(user.email) === newEmail) throw new AuthError(409, "EMAIL_UNCHANGED");\n  await consumePublicEmailRateLimit(request, env, newEmail, "email-change");\n  const now = new Date();\n  const nowIso = now.toISOString();\n  await releaseExpiredEmailReservations(env.DB_V2, newEmail, nowIso);\n  if (await emailUnavailable(env.DB_V2, newEmail, auth.userId, nowIso)) throw new AuthError(409, "EMAIL_UNAVAILABLE");\n\n  const rawToken = createToken();\n  const tokenHash = await hashToken(rawToken);\n  const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS).toISOString();\n'
)

replace_once(
    path,
    '''        env.DB_V2.prepare(\n          `INSERT INTO email_change_requests (\n             id, user_id, old_email, new_email, token_hash, created_at, expires_at, confirmed_at, revoked_at\n           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL)`\n        ).bind(requestId, auth.userId, user.email, newEmail, tokenHash, nowIso, expiresAt),''',
    '''        env.DB_V2.prepare(\n          `INSERT INTO email_change_requests (\n             id, user_id, old_email, new_email, token_hash, created_at, expires_at, confirmed_at, revoked_at\n           )\n           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL\n           WHERE NOT EXISTS (\n             SELECT 1 FROM users u WHERE u.email = ?4 COLLATE NOCASE AND u.id <> ?2\n           )\n             AND NOT EXISTS (\n               SELECT 1 FROM pending_registrations p\n               WHERE p.email = ?4 COLLATE NOCASE AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?6\n             )\n             AND NOT EXISTS (\n               SELECT 1 FROM email_change_requests c\n               WHERE c.new_email = ?4 COLLATE NOCASE AND c.user_id <> ?2\n                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?6\n             )\n             AND NOT EXISTS (\n               SELECT 1 FROM email_enrollment_requests e\n               WHERE e.new_email = ?4 COLLATE NOCASE AND e.user_id <> ?2\n                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?6\n             )`\n        ).bind(requestId, auth.userId, user.email, newEmail, tokenHash, nowIso, expiresAt),'''
)

replace_once(
    path,
    '''          details: { newEmailMask: maskEmail(newEmail), expiresAt }\n        })''',
    '''          details: { newEmailMask: maskEmail(newEmail), expiresAt },\n          condition: {\n            sql: "EXISTS (SELECT 1 FROM email_change_requests WHERE id = ?11)",\n            bindings: [requestId]\n          }\n        })'''
)

replace_once(
    path,
    '''        env.DB_V2.prepare(\n          `INSERT INTO email_enrollment_requests (\n             id, user_id, new_email, token_hash, created_at, expires_at, confirmed_at, revoked_at\n           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL)`\n        ).bind(requestId, auth.userId, newEmail, tokenHash, nowIso, expiresAt),''',
    '''        env.DB_V2.prepare(\n          `INSERT INTO email_enrollment_requests (\n             id, user_id, new_email, token_hash, created_at, expires_at, confirmed_at, revoked_at\n           )\n           SELECT ?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL\n           WHERE NOT EXISTS (\n             SELECT 1 FROM users u WHERE u.email = ?3 COLLATE NOCASE AND u.id <> ?2\n           )\n             AND NOT EXISTS (\n               SELECT 1 FROM pending_registrations p\n               WHERE p.email = ?3 COLLATE NOCASE AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?5\n             )\n             AND NOT EXISTS (\n               SELECT 1 FROM email_change_requests c\n               WHERE c.new_email = ?3 COLLATE NOCASE AND c.user_id <> ?2\n                 AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?5\n             )\n             AND NOT EXISTS (\n               SELECT 1 FROM email_enrollment_requests e\n               WHERE e.new_email = ?3 COLLATE NOCASE AND e.user_id <> ?2\n                 AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?5\n             )`\n        ).bind(requestId, auth.userId, newEmail, tokenHash, nowIso, expiresAt),'''
)

replace_once(
    path,
    '''          details: { newEmailMask: maskEmail(newEmail), expiresAt }\n        })\n      ]);\n    }\n  } catch (error) {''',
    '''          details: { newEmailMask: maskEmail(newEmail), expiresAt },\n          condition: {\n            sql: "EXISTS (SELECT 1 FROM email_enrollment_requests WHERE id = ?11)",\n            bindings: [requestId]\n          }\n        })\n      ]);\n    }\n  } catch (error) {'''
)

replace_once(
    path,
    '''  } catch (error) {\n    if (isEmailConflict(error)) throw new AuthError(409, "EMAIL_UNAVAILABLE");\n    throw error;\n  }\n  schedule(ctx, sendEmailChangeConfirmation(env, {''',
    '''  } catch (error) {\n    if (isEmailConflict(error)) throw new AuthError(409, "EMAIL_UNAVAILABLE");\n    throw error;\n  }\n  const reserved = await env.DB_V2.prepare(\n    `SELECT 1 AS found FROM email_change_requests WHERE id = ?1\n     UNION ALL\n     SELECT 1 AS found FROM email_enrollment_requests WHERE id = ?1\n     LIMIT 1`\n  ).bind(requestId).first();\n  if (!reserved) throw new AuthError(409, "EMAIL_UNAVAILABLE");\n  schedule(ctx, sendEmailChangeConfirmation(env, {'''
)

replace_once(
    path,
    '''            u.email AS current_email, u.status AS user_status\n     FROM email_change_requests r JOIN users u ON u.id = r.user_id''',
    '''            u.email AS current_email, u.email_verified_at AS current_email_verified_at, u.status AS user_status\n     FROM email_change_requests r JOIN users u ON u.id = r.user_id'''
)
replace_once(
    path,
    '''            u.email AS current_email, u.status AS user_status\n     FROM email_enrollment_requests r JOIN users u ON u.id = r.user_id''',
    '''            u.email AS current_email, u.email_verified_at AS current_email_verified_at, u.status AS user_status\n     FROM email_enrollment_requests r JOIN users u ON u.id = r.user_id'''
)
replace_once(
    path,
    '  if (enrollment && record.current_email) throw new AuthError(400, "EMAIL_CHANGE_TOKEN_INVALID");\n  if (await emailUnavailable(env.DB_V2, record.new_email, record.user_id)) throw new AuthError(409, "EMAIL_UNAVAILABLE");\n',
    '  if (enrollment && record.current_email_verified_at) throw new AuthError(400, "EMAIL_CHANGE_TOKEN_INVALID");\n  if (await emailUnavailable(env.DB_V2, record.new_email, record.user_id, nowIso)) throw new AuthError(409, "EMAIL_UNAVAILABLE");\n'
)

replace_once(
    path,
    '''async function emailUnavailable(db, email, userId) {\n  const user = await db.prepare(\n    `SELECT id FROM users WHERE email = ?1 COLLATE NOCASE AND id <> ?2 LIMIT 1`\n  ).bind(email, userId).first();\n  if (user) return true;\n  const pending = await db.prepare(\n    `SELECT 1 AS found FROM email_change_requests\n     WHERE new_email = ?1 COLLATE NOCASE AND user_id <> ?2\n       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?3\n     UNION ALL\n     SELECT 1 AS found FROM email_enrollment_requests\n     WHERE new_email = ?1 COLLATE NOCASE AND user_id <> ?2\n       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?3\n     LIMIT 1`\n  ).bind(email, userId, new Date().toISOString()).first();\n  return Boolean(pending);\n}\n''',
    '''async function emailUnavailable(db, email, userId, nowIso = new Date().toISOString()) {\n  const pending = await db.prepare(\n    `SELECT 1 AS found FROM users\n     WHERE email = ?1 COLLATE NOCASE AND id <> ?2\n     UNION ALL\n     SELECT 1 AS found FROM pending_registrations\n     WHERE email = ?1 COLLATE NOCASE\n       AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?3\n     UNION ALL\n     SELECT 1 AS found FROM email_change_requests\n     WHERE new_email = ?1 COLLATE NOCASE AND user_id <> ?2\n       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?3\n     UNION ALL\n     SELECT 1 AS found FROM email_enrollment_requests\n     WHERE new_email = ?1 COLLATE NOCASE AND user_id <> ?2\n       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?3\n     LIMIT 1`\n  ).bind(email, userId, nowIso).first();\n  return Boolean(pending);\n}\n\nasync function releaseExpiredEmailReservations(db, email, nowIso) {\n  await db.batch([\n    db.prepare(\n      `UPDATE email_change_requests SET revoked_at = ?1\n       WHERE new_email = ?2 COLLATE NOCASE\n         AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at <= ?1`\n    ).bind(nowIso, email),\n    db.prepare(\n      `UPDATE email_enrollment_requests SET revoked_at = ?1\n       WHERE new_email = ?2 COLLATE NOCASE\n         AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at <= ?1`\n    ).bind(nowIso, email)\n  ]);\n}\n'''
)

# ---------------------------------------------------------------------------
# src/routes/email-auth.js
# ---------------------------------------------------------------------------
path = "src/routes/email-auth.js"

replace_once(
    path,
    '  if (existing) return authJson(ACCEPTED, 202);\n\n  const rawToken = createToken();\n',
    '''  if (existing) {\n    const nowIso = new Date().toISOString();\n    await env.DB_V2.prepare(\n      `UPDATE pending_registrations SET revoked_at = ?1\n       WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`\n    ).bind(nowIso, email).run();\n    return authJson(ACCEPTED, 202);\n  }\n\n  const rawToken = createToken();\n'''
)

replace_once(
    path,
    '''      env.DB_V2.prepare(\n        `INSERT INTO pending_registrations (\n           id, email, display_name, organization_name,\n           password_scheme, password_hash, password_salt, token_hash,\n           created_at, expires_at, verified_at, revoked_at, last_sent_at, resend_count\n         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, ?9, 0)`\n      ).bind(id, email, displayName, organizationName, PASSWORD_SCHEME, passwordHash, salt, tokenHash, nowIso, expiresAt)''',
    '''      env.DB_V2.prepare(\n        `INSERT INTO pending_registrations (\n           id, email, display_name, organization_name,\n           password_scheme, password_hash, password_salt, token_hash,\n           created_at, expires_at, verified_at, revoked_at, last_sent_at, resend_count\n         )\n         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, ?9, 0\n         WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?2 COLLATE NOCASE)\n           AND NOT EXISTS (\n             SELECT 1 FROM email_change_requests c\n             WHERE c.new_email = ?2 COLLATE NOCASE\n               AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?9\n           )\n           AND NOT EXISTS (\n             SELECT 1 FROM email_enrollment_requests e\n             WHERE e.new_email = ?2 COLLATE NOCASE\n               AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?9\n           )`\n      ).bind(id, email, displayName, organizationName, PASSWORD_SCHEME, passwordHash, salt, tokenHash, nowIso, expiresAt)'''
)

replace_once(
    path,
    '''  } catch (error) {\n    if (isEmailConflict(error)) return authJson(ACCEPTED, 202);\n    console.error("Registration persistence failed", safeErrorCode(error));\n    throw new AuthError(503, "REGISTRATION_PERSISTENCE_UNAVAILABLE", { expose: true });\n  }\n  const requestId = makeId("req");\n  schedule(ctx, sendRegistrationVerification(env, { email, rawToken, requestId }));\n''',
    '''  } catch (error) {\n    if (isEmailConflict(error)) return authJson(ACCEPTED, 202);\n    console.error("Registration persistence failed", safeErrorCode(error));\n    throw new AuthError(503, "REGISTRATION_PERSISTENCE_UNAVAILABLE", { expose: true });\n  }\n  const created = await env.DB_V2.prepare(\n    `SELECT 1 AS found FROM pending_registrations\n     WHERE id = ?1 AND verified_at IS NULL AND revoked_at IS NULL LIMIT 1`\n  ).bind(id).first();\n  if (!created) return authJson(ACCEPTED, 202);\n  const requestId = makeId("req");\n  schedule(ctx, sendRegistrationVerification(env, { email, rawToken, requestId }));\n'''
)

replace_once(
    path,
    '''  if (!pending || Date.parse(pending.expires_at) <= now.getTime()) return authJson(ACCEPTED, 202);\n  if (Date.parse(pending.last_sent_at) > now.getTime() - 60_000) {''',
    '''  if (!pending || Date.parse(pending.expires_at) <= now.getTime()) return authJson(ACCEPTED, 202);\n  if (await registrationEmailUnavailable(env.DB_V2, email, nowIso)) {\n    await env.DB_V2.prepare(\n      `UPDATE pending_registrations SET revoked_at = ?1\n       WHERE id = ?2 AND verified_at IS NULL AND revoked_at IS NULL`\n    ).bind(nowIso, pending.id).run();\n    return authJson(ACCEPTED, 202);\n  }\n  if (Date.parse(pending.last_sent_at) > now.getTime() - 60_000) {'''
)

replace_once(
    path,
    '''     SET token_hash = ?1, last_sent_at = ?2, resend_count = resend_count + 1\n     WHERE id = ?3 AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?2`\n  ).bind(tokenHash, nowIso, pending.id).run();''',
    '''     SET token_hash = ?1, last_sent_at = ?2, resend_count = resend_count + 1\n     WHERE id = ?3 AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?2\n       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?4 COLLATE NOCASE)\n       AND NOT EXISTS (\n         SELECT 1 FROM email_change_requests c\n         WHERE c.new_email = ?4 COLLATE NOCASE\n           AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?2\n       )\n       AND NOT EXISTS (\n         SELECT 1 FROM email_enrollment_requests e\n         WHERE e.new_email = ?4 COLLATE NOCASE\n           AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?2\n       )`\n  ).bind(tokenHash, nowIso, pending.id, email).run();'''
)

replace_once(
    path,
    '''        `UPDATE pending_registrations SET verified_at = ?1\n         WHERE id = ?2 AND token_hash = ?3 AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?4`\n      ).bind(claimMarker, pending.id, tokenHash, nowIso),''',
    '''        `UPDATE pending_registrations SET verified_at = ?1\n         WHERE id = ?2 AND token_hash = ?3 AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ?4\n           AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = pending_registrations.email COLLATE NOCASE)\n           AND NOT EXISTS (\n             SELECT 1 FROM email_change_requests c\n             WHERE c.new_email = pending_registrations.email COLLATE NOCASE\n               AND c.confirmed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?4\n           )\n           AND NOT EXISTS (\n             SELECT 1 FROM email_enrollment_requests e\n             WHERE e.new_email = pending_registrations.email COLLATE NOCASE\n               AND e.confirmed_at IS NULL AND e.revoked_at IS NULL AND e.expires_at > ?4\n           )`\n      ).bind(claimMarker, pending.id, tokenHash, nowIso),'''
)

replace_once(
    path,
    '''  if (!completed) {\n    console.error("Registration verification completion invariant failed");\n    throw new AuthError(400, "REGISTRATION_TOKEN_INVALID");\n  }\n''',
    '''  if (!completed) {\n    if (await registrationEmailUnavailable(env.DB_V2, pending.email, nowIso)) {\n      throw new AuthError(409, "EMAIL_UNAVAILABLE");\n    }\n    console.error("Registration verification completion invariant failed");\n    throw new AuthError(400, "REGISTRATION_TOKEN_INVALID");\n  }\n'''
)

insert_before(
    path,
    'function conditionalRegistrationAuditStatement(db, entry) {\n',
    '''async function registrationEmailUnavailable(db, email, nowIso = new Date().toISOString()) {\n  const row = await db.prepare(\n    `SELECT 1 AS found FROM users WHERE email = ?1 COLLATE NOCASE\n     UNION ALL\n     SELECT 1 AS found FROM email_change_requests\n     WHERE new_email = ?1 COLLATE NOCASE\n       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?2\n     UNION ALL\n     SELECT 1 AS found FROM email_enrollment_requests\n     WHERE new_email = ?1 COLLATE NOCASE\n       AND confirmed_at IS NULL AND revoked_at IS NULL AND expires_at > ?2\n     LIMIT 1`\n  ).bind(email, nowIso).first();\n  return Boolean(row);\n}\n\n'''
)

# ---------------------------------------------------------------------------
# src/routes/auth.js -- credential changes revoke pending identity changes.
# ---------------------------------------------------------------------------
path = "src/routes/auth.js"

replace_once(
    path,
    '''    userAuditStatement(env.DB_V2, {\n      userId: auth.userId,\n      userUpdatedAt: changeMarker,\n      organizationId: auth.organizationId,\n      actorUserId: auth.userId,\n      actorRole: auth.role,\n      action: "auth.password.changed",\n      targetType: "user",\n      targetId: auth.userId,\n      createdAt: nowIso\n    })\n  ]);''',
    '''    userAuditStatement(env.DB_V2, {\n      userId: auth.userId,\n      userUpdatedAt: changeMarker,\n      organizationId: auth.organizationId,\n      actorUserId: auth.userId,\n      actorRole: auth.role,\n      action: "auth.password.changed",\n      targetType: "user",\n      targetId: auth.userId,\n      createdAt: nowIso\n    }),\n    env.DB_V2.prepare(\n      `UPDATE email_change_requests SET revoked_at = ?1\n       WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL\n         AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND updated_at = ?3)`\n    ).bind(nowIso, auth.userId, changeMarker),\n    env.DB_V2.prepare(\n      `UPDATE email_enrollment_requests SET revoked_at = ?1\n       WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL\n         AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND updated_at = ?3)`\n    ).bind(nowIso, auth.userId, changeMarker),\n    env.DB_V2.prepare(\n      `UPDATE pending_registrations SET revoked_at = ?1\n       WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL\n         AND EXISTS (SELECT 1 FROM users WHERE id = ?3 AND updated_at = ?4)`\n    ).bind(nowIso, user.email || "", auth.userId, changeMarker)\n  ]);'''
)

replace_once(
    path,
    '''    conditionalAuditStatement(env.DB_V2, {\n      claimTokenId: record.id,\n      claimMarker,\n      actorType: "system",\n      action: "auth.password_reset.used",\n      targetType: "user",\n      targetId: record.user_id,\n      createdAt: nowIso\n    })\n  ]);''',
    '''    conditionalAuditStatement(env.DB_V2, {\n      claimTokenId: record.id,\n      claimMarker,\n      actorType: "system",\n      action: "auth.password_reset.used",\n      targetType: "user",\n      targetId: record.user_id,\n      createdAt: nowIso\n    }),\n    env.DB_V2.prepare(\n      `UPDATE email_change_requests SET revoked_at = ?1\n       WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL\n         AND EXISTS (SELECT 1 FROM password_reset_tokens WHERE id = ?3 AND used_at = ?4)`\n    ).bind(nowIso, record.user_id, record.id, claimMarker),\n    env.DB_V2.prepare(\n      `UPDATE email_enrollment_requests SET revoked_at = ?1\n       WHERE user_id = ?2 AND confirmed_at IS NULL AND revoked_at IS NULL\n         AND EXISTS (SELECT 1 FROM password_reset_tokens WHERE id = ?3 AND used_at = ?4)`\n    ).bind(nowIso, record.user_id, record.id, claimMarker),\n    env.DB_V2.prepare(\n      `UPDATE pending_registrations SET revoked_at = ?1\n       WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL\n         AND EXISTS (SELECT 1 FROM password_reset_tokens WHERE id = ?3 AND used_at = ?4)`\n    ).bind(nowIso, record.email || "", record.id, claimMarker)\n  ]);'''
)

# ---------------------------------------------------------------------------
# scripts/test-account-lifecycle-v2.mjs -- cross-flow business invariants.
# ---------------------------------------------------------------------------
path = "scripts/test-account-lifecycle-v2.mjs"
replace_once(
    path,
    '''  await testInvitationAndAccountLifecycle();\n  await testInvitationAuthorizationAndQuotas();\n  await testAccountDeletion();\n''',
    '''  await testInvitationAndAccountLifecycle();\n  await testInvitationAuthorizationAndQuotas();\n  await testEmailIdentityInvariants();\n  await testCredentialChangeInvalidation();\n  await testAccountDeletion();\n'''
)

insert_before(
    path,
    'async function testAccountDeletion() {\n',
    '''async function testEmailIdentityInvariants() {\n  const h = createHarness();\n  try {\n    const owner = await register(h, "identity-owner@example.com", "Identity Owner");\n\n    let response = await h.api("/api/auth/registration/request", {\n      method: "POST",\n      body: {\n        email: "pending-claim@example.com",\n        displayName: "Pending Claim",\n        password: PASSWORD,\n        turnstileToken: "test-turnstile"\n      }\n    });\n    check("pending registration can be created for identity conflict test", response.status === 202);\n    await h.drain();\n    response = await h.api("/api/auth/email-change/request", {\n      method: "POST", auth: owner,\n      body: { newEmail: "pending-claim@example.com", currentPassword: PASSWORD }\n    });\n    check("email change rejects an address reserved by pending registration",\n      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");\n\n    response = await h.api("/api/auth/email-change/request", {\n      method: "POST", auth: owner,\n      body: { newEmail: "reserved-change@example.com", currentPassword: PASSWORD }\n    });\n    check("email change reserves its target address", response.status === 202);\n    await h.drain();\n    const emailsBeforeBlockedRegistration = h.emails.length;\n    response = await h.api("/api/auth/registration/request", {\n      method: "POST",\n      body: {\n        email: "reserved-change@example.com",\n        displayName: "Should Not Register",\n        password: PASSWORD,\n        turnstileToken: "test-turnstile"\n      }\n    });\n    check("self-registration against an email-change reservation stays enumeration-safe", response.status === 202);\n    await h.drain();\n    check("reserved email does not create a competing pending registration or send verification",\n      h.emails.length === emailsBeforeBlockedRegistration\n        && h.row("SELECT COUNT(*) AS count FROM pending_registrations WHERE email = 'reserved-change@example.com' AND verified_at IS NULL AND revoked_at IS NULL")?.count === 0);\n\n    const second = await register(h, "identity-second@example.com", "Identity Second");\n    response = await h.api("/api/auth/email-change/request", {\n      method: "POST", auth: owner,\n      body: { newEmail: "expired-reservation@example.com", currentPassword: PASSWORD }\n    });\n    check("expiring reservation fixture is created", response.status === 202);\n    await h.drain();\n    const expired = h.row("SELECT id, created_at FROM email_change_requests WHERE user_id = ?1 AND new_email = 'expired-reservation@example.com'", owner.data.user.id);\n    const expiredAt = new Date(Date.parse(expired.created_at) + 1).toISOString();\n    h.sqlite.prepare("UPDATE email_change_requests SET expires_at = ? WHERE id = ?").run(expiredAt, expired.id);\n    response = await h.api("/api/auth/email-change/request", {\n      method: "POST", auth: second,\n      body: { newEmail: "expired-reservation@example.com", currentPassword: PASSWORD }\n    });\n    check("expired reservation cannot lock an email until scheduled cleanup", response.status === 202, await response.clone().json());\n    check("expired reservation is explicitly released before reuse",\n      Boolean(h.row("SELECT revoked_at FROM email_change_requests WHERE id = ?1", expired.id)?.revoked_at));\n\n    const legacy = await createLegacyMember(h, owner.data.organization.id);\n    const legacyEmail = "legacy-unverified@example.com";\n    const legacyNow = new Date().toISOString();\n    h.sqlite.prepare("UPDATE users SET email = ?, email_verified_at = NULL, email_updated_at = ?, updated_at = ? WHERE id = ?")\n      .run(legacyEmail, legacyNow, legacyNow, legacy.userId);\n    response = await h.api("/api/auth/email-change/request", {\n      method: "POST", auth: legacy,\n      body: { newEmail: legacyEmail, currentPassword: PASSWORD }\n    });\n    check("unverified existing email can be enrolled instead of being trapped as unchanged", response.status === 202, await response.clone().json());\n    await h.drain();\n    const enrollmentToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");\n    response = await h.api("/api/auth/email-change/confirm", { method: "POST", body: { token: enrollmentToken } });\n    check("unverified existing email becomes verified",\n      response.status === 200 && Boolean(h.row("SELECT email_verified_at FROM users WHERE id = ?1", legacy.userId)?.email_verified_at));\n  } finally { h.close(); }\n}\n\nasync function testCredentialChangeInvalidation() {\n  const h = createHarness();\n  try {\n    const owner = await register(h, "credential-owner@example.com", "Credential Owner");\n    let response = await h.api("/api/auth/email-change/request", {\n      method: "POST", auth: owner,\n      body: { newEmail: "credential-pending@example.com", currentPassword: PASSWORD }\n    });\n    check("credential invalidation fixture email change requested", response.status === 202);\n    await h.drain();\n    const pendingChangeToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");\n\n    const changedPassword = "Changed-Correct-Horse-456";\n    response = await h.api("/api/auth/password/change", {\n      method: "POST", auth: owner,\n      body: { currentPassword: PASSWORD, newPassword: changedPassword }\n    });\n    const changedSession = await response.clone().json();\n    check("password change succeeds before invalidation check", response.status === 200, changedSession);\n    owner.cookie = cookieFrom(response);\n    owner.csrf = changedSession.csrfToken;\n    response = await h.api("/api/auth/email-change/confirm", {\n      method: "POST", body: { token: pendingChangeToken }\n    });\n    check("password change revokes previously issued email-change token",\n      response.status === 400 && (await response.json()).error === "EMAIL_CHANGE_TOKEN_INVALID");\n\n    response = await h.api("/api/auth/email-change/request", {\n      method: "POST", auth: owner,\n      body: { newEmail: "credential-reset-pending@example.com", currentPassword: changedPassword }\n    });\n    check("second email change can be requested for reset invalidation test", response.status === 202);\n    await h.drain();\n    const resetPendingEmailToken = tokenFromMessage(h.emails.at(-1), "confirm-email-change");\n\n    response = await h.api("/api/auth/password/reset/request", {\n      method: "POST",\n      body: { email: "credential-owner@example.com", turnstileToken: "test-turnstile" }\n    });\n    check("password reset request succeeds", response.status === 202);\n    await h.drain();\n    const resetToken = tokenFromMessage(h.emails.at(-1), "reset-password");\n    response = await h.api("/api/auth/password/reset", {\n      method: "POST", body: { token: resetToken, newPassword: "Reset-Correct-Horse-789" }\n    });\n    check("password reset succeeds", response.status === 200, await response.clone().json());\n    response = await h.api("/api/auth/email-change/confirm", {\n      method: "POST", body: { token: resetPendingEmailToken }\n    });\n    check("password reset revokes previously issued email-change token",\n      response.status === 400 && (await response.json()).error === "EMAIL_CHANGE_TOKEN_INVALID");\n  } finally { h.close(); }\n}\n\n'''
)

print("Account and email identity invariant hardening patch applied")
