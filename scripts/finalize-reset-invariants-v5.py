from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:1000]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# ---------------------------------------------------------------------------
# Public password reset issuance: revalidate the same active verified email in
# the write transaction. If identity state changes after the precheck, do not
# revoke older tokens, create a dead token, or send an unusable email.
# ---------------------------------------------------------------------------
replace_once(
    "src/routes/email-auth.js",
    '''  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET revoked_at = ?1
       WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, user.id),
    env.DB_V2.prepare(
      `INSERT INTO password_reset_tokens (
         id, user_id, token_hash, created_by_user_id, created_at, expires_at,
         used_at, revoked_at, email_snapshot, delivery_requested_at
       ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, NULL, NULL, ?6, ?4)`
    ).bind(makeId("prt"), user.id, tokenHash, nowIso, expiresAt, email)
  ]);
  schedule(ctx, sendPasswordReset(env, { email, rawToken, requestId: makeId("req") }));
''',
    '''  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  const resetId = makeId("prt");
  await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET revoked_at = ?1
       WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1 FROM users u
           WHERE u.id = ?2 AND u.email = ?3 COLLATE NOCASE
             AND u.email_verified_at IS NOT NULL AND u.status = 'active'
         )`
    ).bind(nowIso, user.id, email),
    env.DB_V2.prepare(
      `INSERT INTO password_reset_tokens (
         id, user_id, token_hash, created_by_user_id, created_at, expires_at,
         used_at, revoked_at, email_snapshot, delivery_requested_at
       )
       SELECT ?1, ?2, ?3, NULL, ?4, ?5, NULL, NULL, ?6, ?4
       FROM users u
       WHERE u.id = ?2 AND u.email = ?6 COLLATE NOCASE
         AND u.email_verified_at IS NOT NULL AND u.status = 'active'`
    ).bind(resetId, user.id, tokenHash, nowIso, expiresAt, email)
  ]);
  const created = await env.DB_V2.prepare(
    `SELECT 1 AS found FROM password_reset_tokens
     WHERE id = ?1 AND user_id = ?2 AND token_hash = ?3
       AND used_at IS NULL AND revoked_at IS NULL LIMIT 1`
  ).bind(resetId, user.id, tokenHash).first();
  if (!created) return authJson(ACCEPTED, 202);
  schedule(ctx, sendPasswordReset(env, { email, rawToken, requestId: makeId("req") }));
'''
)

# ---------------------------------------------------------------------------
# Manager-issued reset: the target must still have the same verified active
# email and still be single-organization when the token is actually written.
# The audit is conditional on successful token creation.
# ---------------------------------------------------------------------------
replace_once(
    "src/routes/account-lifecycle.js",
    '''  await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET revoked_at = ?1
       WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, target.user_id),
    env.DB_V2.prepare(
      `INSERT INTO password_reset_tokens (
         id, user_id, token_hash, created_by_user_id, created_at, expires_at,
         used_at, revoked_at, email_snapshot, delivery_requested_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?5)`
    ).bind(tokenId, target.user_id, tokenHash, auth.userId, nowIso, expiresAt, target.email),
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "auth.password_reset.email_requested",
      targetType: "user",
      targetId: target.user_id,
      details: { targetRole: target.role, expiresAt, emailMask: maskEmail(target.email) }
    })
  ]);
  schedule(ctx, sendPasswordReset(env, {
''',
    '''  await env.DB_V2.batch([
    env.DB_V2.prepare(
      `UPDATE password_reset_tokens SET revoked_at = ?1
       WHERE user_id = ?2 AND used_at IS NULL AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1 FROM users u
           WHERE u.id = ?2 AND u.email = ?3 COLLATE NOCASE
             AND u.email_verified_at IS NOT NULL AND u.status = 'active'
         )
         AND (SELECT COUNT(*) FROM organization_members WHERE user_id = ?2 AND status = 'active') <= 1`
    ).bind(nowIso, target.user_id, target.email),
    env.DB_V2.prepare(
      `INSERT INTO password_reset_tokens (
         id, user_id, token_hash, created_by_user_id, created_at, expires_at,
         used_at, revoked_at, email_snapshot, delivery_requested_at
       )
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?5
       FROM users u
       WHERE u.id = ?2 AND u.email = ?7 COLLATE NOCASE
         AND u.email_verified_at IS NOT NULL AND u.status = 'active'
         AND (SELECT COUNT(*) FROM organization_members WHERE user_id = ?2 AND status = 'active') <= 1`
    ).bind(tokenId, target.user_id, tokenHash, auth.userId, nowIso, expiresAt, target.email),
    auditStatement(env.DB_V2, {
      organizationId: auth.organizationId,
      actorType: "user",
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: "auth.password_reset.email_requested",
      targetType: "user",
      targetId: target.user_id,
      details: { targetRole: target.role, expiresAt, emailMask: maskEmail(target.email) },
      condition: {
        sql: "EXISTS (SELECT 1 FROM password_reset_tokens WHERE id = ?11 AND token_hash = ?12 AND revoked_at IS NULL)",
        bindings: [tokenId, tokenHash]
      }
    })
  ]);
  const created = await env.DB_V2.prepare(
    `SELECT 1 AS found FROM password_reset_tokens
     WHERE id = ?1 AND user_id = ?2 AND token_hash = ?3
       AND used_at IS NULL AND revoked_at IS NULL LIMIT 1`
  ).bind(tokenId, target.user_id, tokenHash).first();
  if (!created) {
    const memberships = await env.DB_V2.prepare(
      `SELECT COUNT(*) AS count FROM organization_members WHERE user_id = ?1 AND status = 'active'`
    ).bind(target.user_id).first();
    if (Number(memberships?.count || 0) > 1) throw new AuthError(409, "RESET_REQUIRES_SYSTEM_OPERATOR");
    const current = await env.DB_V2.prepare(
      `SELECT email, email_verified_at, status FROM users WHERE id = ?1 LIMIT 1`
    ).bind(target.user_id).first();
    if (!current || current.status !== "active" || !current.email_verified_at
        || normalizeEmail(current.email) !== normalizeEmail(target.email)) {
      throw new AuthError(409, "MEMBER_EMAIL_REQUIRED");
    }
    throw new AuthError(409, "RESET_UPDATE_CONFLICT");
  }
  schedule(ctx, sendPasswordReset(env, {
'''
)

# ---------------------------------------------------------------------------
# Race regression for public reset issuance. The user changes email after the
# initial lookup but immediately before the reset-token batch. Response remains
# enumeration-safe and no dead reset email/token is generated.
# ---------------------------------------------------------------------------
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("previous email-change token remains usable after a failed replacement",
      response.status === 200 && (await response.json()).email === "preserve-valid@example.com");

    response = await h.api("/api/auth/email-change/request", {''',
    '''    check("previous email-change token remains usable after a failed replacement",
      response.status === 200 && (await response.json()).email === "preserve-valid@example.com");

    const resetRace = await register(h, "reset-write-race@example.com", "Reset Write Race");
    const resetEmailsBefore = h.emails.length;
    h.db.beforeBatch = (statements) => {
      if (!statements.some((statement) => statement.sql.includes("INSERT INTO password_reset_tokens"))) return false;
      const changedAt = new Date().toISOString();
      h.sqlite.prepare("UPDATE users SET email = ?, email_updated_at = ?, updated_at = ? WHERE id = ?")
        .run("reset-write-race-changed@example.com", changedAt, changedAt, resetRace.data.user.id);
      return true;
    };
    response = await h.api("/api/auth/password/reset/request", {
      method: "POST",
      body: { email: "reset-write-race@example.com", turnstileToken: "test-turnstile" }
    });
    check("password reset remains enumeration-safe when identity changes after precheck", response.status === 202);
    await h.drain();
    check("write-time password reset conflict sends no dead email or token",
      h.emails.length === resetEmailsBefore
        && h.row("SELECT COUNT(*) AS count FROM password_reset_tokens WHERE user_id = ?1", resetRace.data.user.id)?.count === 0);

    response = await h.api("/api/auth/email-change/request", {'''
)

print("Password reset write-time invariant hardening v5 applied")
