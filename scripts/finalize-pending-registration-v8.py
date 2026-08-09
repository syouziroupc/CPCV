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

# Close the write-time race too. Only expired pending registrations may be
# retired here; a concurrent active registration is never revoked. The INSERT
# itself repeats the active-pending exclusion, so the first committed claimant
# keeps the address.
replace_once(
    "src/routes/email-auth.js",
    '''      env.DB_V2.prepare(
        `UPDATE pending_registrations SET revoked_at = ?1
         WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
      ).bind(nowIso, email),''',
    '''      env.DB_V2.prepare(
        `UPDATE pending_registrations SET revoked_at = ?1
         WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL
           AND expires_at <= ?1`
      ).bind(nowIso, email),'''
)

replace_once(
    "src/routes/email-auth.js",
    '''         WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?2 COLLATE NOCASE)
           AND NOT EXISTS (
             SELECT 1 FROM email_change_requests c''',
    '''         WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = ?2 COLLATE NOCASE)
           AND NOT EXISTS (
             SELECT 1 FROM pending_registrations p
             WHERE p.email = ?2 COLLATE NOCASE
               AND p.verified_at IS NULL AND p.revoked_at IS NULL AND p.expires_at > ?9
           )
           AND NOT EXISTS (
             SELECT 1 FROM email_change_requests c'''
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

    const registrationRaceEmail = "registration-write-race@example.com";
    const registrationRaceEmailsBefore = h.emails.length;
    h.db.beforeBatch = (statements) => {
      if (!statements.some((statement) => statement.sql.includes("INSERT INTO pending_registrations"))) return false;
      const source = h.row(
        `SELECT password_scheme,password_hash,password_salt FROM pending_registrations
         WHERE email = ?1 AND revoked_at IS NULL`, duplicateEmail
      );
      const raceNow = new Date().toISOString();
      const raceExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      h.sqlite.prepare(`INSERT INTO pending_registrations
        (id,email,display_name,organization_name,password_scheme,password_hash,password_salt,token_hash,
         created_at,expires_at,verified_at,revoked_at,last_sent_at,resend_count)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,0)`)
        .run("reg_write_race_winner", registrationRaceEmail, "First Registration Writer",
          "First Registration Workspace", source.password_scheme, source.password_hash, source.password_salt,
          "registration_write_race_hash", raceNow, raceExpiry, raceNow);
      return true;
    };
    response = await h.api("/api/auth/registration/request", {
      method: "POST",
      body: {
        email: registrationRaceEmail,
        displayName: "Second Registration Writer",
        password: "Second-Registration-Password-789",
        turnstileToken: "test-turnstile"
      }
    });
    check("concurrent registration remains enumeration-safe when another claimant commits first", response.status === 202);
    await h.drain();
    const registrationRaceWinner = h.row(
      `SELECT id,display_name,organization_name,token_hash,revoked_at FROM pending_registrations
       WHERE email = ?1 AND revoked_at IS NULL`, registrationRaceEmail
    );
    check("second registration cannot revoke or replace a concurrently committed pending identity",
      h.emails.length === registrationRaceEmailsBefore
        && registrationRaceWinner?.id === "reg_write_race_winner"
        && registrationRaceWinner?.display_name === "First Registration Writer"
        && registrationRaceWinner?.organization_name === "First Registration Workspace"
        && registrationRaceWinner?.token_hash === "registration_write_race_hash",
      registrationRaceWinner);
'''
)

print("Pending registration immutability, password-oracle, and write-race hardening applied")
