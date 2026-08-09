from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}\n--- OLD ---\n{old[:1200]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# Initial v8 already made active pending registrations immutable at the request
# precheck and removed password verification. This pass closes the remaining
# TOCTOU window at the D1 batch itself: only expired pending rows may be retired,
# and a concurrently committed active pending row blocks the INSERT.
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

# Directly inject a first claimant immediately before the second request's
# registration batch. The second request must return the same generic 202,
# preserve the first claimant, and send no verification email for its skipped
# insert.
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''      { duplicateBefore, duplicateAfter, emailsBefore: duplicateEmailsBefore, emailsAfter: h.emails.length });

    response = await h.api("/api/auth/registration/request", {''',
    '''      { duplicateBefore, duplicateAfter, emailsBefore: duplicateEmailsBefore, emailsAfter: h.emails.length });

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
      `SELECT id,display_name,organization_name,token_hash FROM pending_registrations
       WHERE email = ?1 AND revoked_at IS NULL`, registrationRaceEmail
    );
    check("second registration cannot revoke or replace a concurrently committed pending identity",
      h.emails.length === registrationRaceEmailsBefore
        && registrationRaceWinner?.id === "reg_write_race_winner"
        && registrationRaceWinner?.display_name === "First Registration Writer"
        && registrationRaceWinner?.organization_name === "First Registration Workspace"
        && registrationRaceWinner?.token_hash === "registration_write_race_hash",
      registrationRaceWinner);

    response = await h.api("/api/auth/registration/request", {'''
)

print("Concurrent pending registration write-race hardening applied")
