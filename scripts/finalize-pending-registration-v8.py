from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:1200]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# An active unverified registration is immutable from the generic registration
# endpoint. Repeated requests must not act as a password oracle or let another
# caller replace the pending password/profile/token. The dedicated resend route
# remains the only verification-token rotation path.
replace_once(
    "src/routes/email-auth.js",
    '''  hashPassword,
  hashToken,
  requireValidPassword,
  verifyPassword
} from "../auth/passwords.js";''',
    '''  hashPassword,
  hashToken,
  requireValidPassword
} from "../auth/passwords.js";'''
)

replace_once(
    "src/routes/email-auth.js",
    '''  const recentPending = await env.DB_V2.prepare(
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

  const salt = createSalt();''',
    '''  const activePending = await env.DB_V2.prepare(
    `SELECT id FROM pending_registrations
     WHERE email = ?1 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL
       AND expires_at > ?2
     LIMIT 1`
  ).bind(email, nowIso).first();

  const salt = createSalt();'''
)

replace_once(
    "src/routes/email-auth.js",
    '''  const existing = await env.DB_V2.prepare(
    `SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(email).first();
  if (existing) {
    const nowIso = new Date().toISOString();
    await env.DB_V2.prepare(
      `UPDATE pending_registrations SET revoked_at = ?1
       WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, email).run();
    return authJson(ACCEPTED, 202);
  }

  const rawToken = createToken();''',
    '''  const existing = await env.DB_V2.prepare(
    `SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`
  ).bind(email).first();
  if (existing) {
    await env.DB_V2.prepare(
      `UPDATE pending_registrations SET revoked_at = ?1
       WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, email).run();
    return authJson(ACCEPTED, 202);
  }
  if (activePending) return authJson(ACCEPTED, 202);

  const rawToken = createToken();'''
)

# Strengthen the existing duplicate registration regression: a different valid
# display name and password may not mutate the active pending identity or rotate
# its token, while the public response remains the same generic 202.
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    const duplicateRegistrationToken = tokenFromMessage(h.emails.at(-1), "verify-email");
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
''',
    '''    const duplicateRegistrationToken = tokenFromMessage(h.emails.at(-1), "verify-email");
    const duplicateRegistrationHash = await hashToken(duplicateRegistrationToken);
    const duplicateBefore = h.row(
      `SELECT display_name, organization_name, password_hash, password_salt, token_hash
       FROM pending_registrations WHERE email = ?1 AND revoked_at IS NULL`, duplicateEmail
    );
    const duplicateEmailsBefore = h.emails.length;
    response = await h.api("/api/auth/registration/request", {
      method: "POST",
      body: {
        email: duplicateEmail,
        displayName: "Different Registration Attempt",
        password: "Different-Registration-Password-456",
        turnstileToken: "test-turnstile"
      }
    });
    check("active pending registration remains enumeration-safe on a conflicting repeat", response.status === 202);
    await h.drain();
    const duplicateAfter = h.row(
      `SELECT display_name, organization_name, password_hash, password_salt, token_hash
       FROM pending_registrations WHERE email = ?1 AND revoked_at IS NULL`, duplicateEmail
    );
    check("conflicting repeat cannot replace pending registration identity, password, or token",
      h.emails.length === duplicateEmailsBefore
        && duplicateAfter?.token_hash === duplicateRegistrationHash
        && duplicateAfter?.token_hash === duplicateBefore?.token_hash
        && duplicateAfter?.display_name === duplicateBefore?.display_name
        && duplicateAfter?.organization_name === duplicateBefore?.organization_name
        && duplicateAfter?.password_hash === duplicateBefore?.password_hash
        && duplicateAfter?.password_salt === duplicateBefore?.password_salt,
      { duplicateBefore, duplicateAfter, emailsBefore: duplicateEmailsBefore, emailsAfter: h.emails.length });
'''
)

print("Pending registration immutability and password-oracle hardening applied")
