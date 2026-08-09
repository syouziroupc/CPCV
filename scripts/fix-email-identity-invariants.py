from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# Split request/IP throttling from recipient delivery quotas so no-send requests
# cannot consume another user's recipient quota.
replace_once(
    "src/auth/public-auth-rate.js",
    '''export async function consumePublicEmailRateLimit(request, env, email, purpose) {
  const production = String(env?.APP_ENV || "").toLowerCase() === "production";
  const pepper = String(env?.AUTH_RATE_LIMIT_PEPPER || "");
  const cloudflareIp = request.headers.get("cf-connecting-ip") || "";
  if (production && !cloudflareIp) throw new AuthError(500, "AUTH_CLIENT_IP_UNAVAILABLE");
  if (production && typeof env?.AUTH_PUBLIC_EMAIL_LIMITER?.limit !== "function") {
    throw new AuthError(500, "AUTH_PUBLIC_EMAIL_LIMITER_NOT_CONFIGURED");
  }
  const ip = cloudflareIp
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local-unknown";
  const edgeKey = await buildRateLimitKey(`${purpose}:${ip}`, pepper, "public-email");
  const edge = await checkRateLimit(env?.AUTH_PUBLIC_EMAIL_LIMITER, edgeKey);
  if (edge.unavailable) {
    throw new AuthError(503, "RATE_LIMIT_UNAVAILABLE", {
      headers: { "retry-after": String(EDGE_RETRY_AFTER_SECONDS) },
      expose: true
    });
  }
  if (!edge.success) throw edgeRateLimited();

  const now = new Date();
  const nowIso = now.toISOString();
  const windowStart = `${nowIso.slice(0, 10)}T00:00:00.000Z`;
  const recipientKey = await buildRateLimitKey(email, pepper, "recipient");
  const ipKey = await buildRateLimitKey(ip, pepper, "request-ip");

  await env.DB_V2.batch([
    incrementStatement(env.DB_V2, "recipient_email", recipientKey, windowStart, nowIso),
    incrementStatement(env.DB_V2, "request_ip", ipKey, windowStart, nowIso)
  ]);
  const counts = await env.DB_V2.prepare(
    `SELECT
       COALESCE((SELECT count FROM auth_public_counters
                 WHERE scope = 'recipient_email' AND key_hash = ?1 AND window_start = ?3), 0) AS recipient_count,
       COALESCE((SELECT count FROM auth_public_counters
                 WHERE scope = 'request_ip' AND key_hash = ?2 AND window_start = ?3), 0) AS ip_count`
  ).bind(recipientKey, ipKey, windowStart).first();
  const recipientCount = Number(counts?.recipient_count || 0);
  const ipCount = Number(counts?.ip_count || 0);
  if (recipientCount > RECIPIENT_LIMIT || ipCount > IP_LIMIT) throw dailyRateLimited(now);
  return { recipientCount, ipCount };
}
''',
    '''export async function consumePublicEmailRequestRateLimit(request, env, purpose) {
  const production = String(env?.APP_ENV || "").toLowerCase() === "production";
  const pepper = String(env?.AUTH_RATE_LIMIT_PEPPER || "");
  const cloudflareIp = request.headers.get("cf-connecting-ip") || "";
  if (production && !cloudflareIp) throw new AuthError(500, "AUTH_CLIENT_IP_UNAVAILABLE");
  if (production && typeof env?.AUTH_PUBLIC_EMAIL_LIMITER?.limit !== "function") {
    throw new AuthError(500, "AUTH_PUBLIC_EMAIL_LIMITER_NOT_CONFIGURED");
  }
  const ip = cloudflareIp
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local-unknown";
  const edgeKey = await buildRateLimitKey(`${purpose}:${ip}`, pepper, "public-email");
  const edge = await checkRateLimit(env?.AUTH_PUBLIC_EMAIL_LIMITER, edgeKey);
  if (edge.unavailable) {
    throw new AuthError(503, "RATE_LIMIT_UNAVAILABLE", {
      headers: { "retry-after": String(EDGE_RETRY_AFTER_SECONDS) },
      expose: true
    });
  }
  if (!edge.success) throw edgeRateLimited();

  const now = new Date();
  const nowIso = now.toISOString();
  const windowStart = `${nowIso.slice(0, 10)}T00:00:00.000Z`;
  const ipKey = await buildRateLimitKey(ip, pepper, "request-ip");
  await incrementStatement(env.DB_V2, "request_ip", ipKey, windowStart, nowIso).run();
  const row = await env.DB_V2.prepare(
    `SELECT count FROM auth_public_counters
     WHERE scope = 'request_ip' AND key_hash = ?1 AND window_start = ?2 LIMIT 1`
  ).bind(ipKey, windowStart).first();
  const ipCount = Number(row?.count || 0);
  if (ipCount > IP_LIMIT) throw dailyRateLimited(now);
  return { ipCount };
}

export async function consumeRecipientEmailRateLimit(env, email) {
  const pepper = String(env?.AUTH_RATE_LIMIT_PEPPER || "");
  const now = new Date();
  const nowIso = now.toISOString();
  const windowStart = `${nowIso.slice(0, 10)}T00:00:00.000Z`;
  const recipientKey = await buildRateLimitKey(email, pepper, "recipient");
  await incrementStatement(env.DB_V2, "recipient_email", recipientKey, windowStart, nowIso).run();
  const row = await env.DB_V2.prepare(
    `SELECT count FROM auth_public_counters
     WHERE scope = 'recipient_email' AND key_hash = ?1 AND window_start = ?2 LIMIT 1`
  ).bind(recipientKey, windowStart).first();
  const recipientCount = Number(row?.count || 0);
  if (recipientCount > RECIPIENT_LIMIT) throw dailyRateLimited(now);
  return { recipientCount };
}

export async function consumePublicEmailRateLimit(request, env, email, purpose) {
  const requestResult = await consumePublicEmailRequestRateLimit(request, env, purpose);
  const recipientResult = await consumeRecipientEmailRateLimit(env, email);
  return { ...requestResult, ...recipientResult };
}
'''
)

replace_once(
    "src/routes/email-auth.js",
    '''import { consumePublicEmailRateLimit } from "../auth/public-auth-rate.js";''',
    '''import { consumePublicEmailRequestRateLimit, consumeRecipientEmailRateLimit } from "../auth/public-auth-rate.js";'''
)
replace_once(
    "src/routes/email-auth.js",
    '''  await consumePublicEmailRateLimit(request, env, email, "registration");''',
    '''  await consumePublicEmailRequestRateLimit(request, env, "registration");'''
)
replace_once(
    "src/routes/email-auth.js",
    '''  if (activePending) return authJson(ACCEPTED, 202);

  const rawToken = createToken();''',
    '''  if (activePending) return authJson(ACCEPTED, 202);
  if (await registrationEmailUnavailable(env.DB_V2, email, nowIso)) return authJson(ACCEPTED, 202);
  await consumeRecipientEmailRateLimit(env, email);

  const rawToken = createToken();'''
)
replace_once(
    "src/routes/email-auth.js",
    '''  await consumePublicEmailRateLimit(request, env, email, "registration-resend");''',
    '''  await consumePublicEmailRequestRateLimit(request, env, "registration-resend");'''
)
replace_once(
    "src/routes/email-auth.js",
    '''  if (Date.parse(pending.last_sent_at) > now.getTime() - 60_000) {
    throw new AuthError(429, "RATE_LIMITED", { headers: { "retry-after": "60" } });
  }
  const rawToken = createToken();''',
    '''  if (Date.parse(pending.last_sent_at) > now.getTime() - 60_000) {
    throw new AuthError(429, "RATE_LIMITED", { headers: { "retry-after": "60" } });
  }
  await consumeRecipientEmailRateLimit(env, email);
  const rawToken = createToken();'''
)
replace_once(
    "src/routes/email-auth.js",
    '''  await consumePublicEmailRateLimit(request, env, email, "password-reset");''',
    '''  await consumePublicEmailRequestRateLimit(request, env, "password-reset");'''
)
replace_once(
    "src/routes/email-auth.js",
    '''  if (recentReset) return authJson(ACCEPTED, 202);
  const rawToken = createToken();''',
    '''  if (recentReset) return authJson(ACCEPTED, 202);
  await consumeRecipientEmailRateLimit(env, email);
  const rawToken = createToken();'''
)

replace_once(
    "src/routes/account-lifecycle.js",
    '''import { consumePublicEmailRateLimit } from "../auth/public-auth-rate.js";''',
    '''import { consumePublicEmailRequestRateLimit, consumeRecipientEmailRateLimit } from "../auth/public-auth-rate.js";'''
)
replace_once(
    "src/routes/account-lifecycle.js",
    '''  await consumePublicEmailRateLimit(request, env, newEmail, "email-change");
  const now = new Date();
  const nowIso = now.toISOString();
  const hasVerifiedEmail = Boolean(user.email && user.email_verified_at);
  if (!hasVerifiedEmail && normalizeEmail(user.email) === newEmail) {
    await env.DB_V2.prepare(
      `UPDATE pending_registrations SET revoked_at = ?1
       WHERE email = ?2 COLLATE NOCASE AND verified_at IS NULL AND revoked_at IS NULL`
    ).bind(nowIso, newEmail).run();
  }
  await releaseExpiredEmailReservations(env.DB_V2, newEmail, nowIso);''',
    '''  await consumePublicEmailRequestRateLimit(request, env, "email-change");
  const now = new Date();
  const nowIso = now.toISOString();
  const hasVerifiedEmail = Boolean(user.email && user.email_verified_at);
  await releaseExpiredEmailReservations(env.DB_V2, newEmail, nowIso);'''
)
replace_once(
    "src/routes/account-lifecycle.js",
    '''  if (recentRequest) return authJson(ACCEPTED, 202);

  const rawToken = createToken();''',
    '''  if (recentRequest) return authJson(ACCEPTED, 202);
  await consumeRecipientEmailRateLimit(env, newEmail);

  const rawToken = createToken();'''
)

# Improve account UI without exposing a public account-enumeration API.
replace_once(
    "public/assets/account.js",
    '''let csrfToken = "";''',
    '''let csrfToken = "";
let currentAccountEmail = "";
let currentAccountEmailVerified = false;'''
)
replace_once(
    "public/assets/account.js",
    '''    EMAIL_UNAVAILABLE: "このメールアドレスは使用できません。",''',
    '''    EMAIL_UNAVAILABLE: "このメールアドレスは、既存アカウントまたは別の登録・変更手続きで使用中です。別のアドレスを指定してください。",'''
)
replace_once(
    "public/assets/account.js",
    '''    const verified = account.user.emailVerified;
    $("emailState").textContent = account.user.email''',
    '''    const verified = account.user.emailVerified;
    currentAccountEmail = String(account.user.email || "").trim().toLowerCase();
    currentAccountEmailVerified = Boolean(verified);
    $("emailState").textContent = account.user.email'''
)
replace_once(
    "public/assets/account.js",
    '''    if (account.pendingEmail) {
      $("pendingEmail").textContent = `確認待ち: ${account.pendingEmail.email} / 有効期限 ${new Date(account.pendingEmail.expiresAt).toLocaleString("ja-JP")}`;
    }
''',
    '''    $("pendingEmail").textContent = account.pendingEmail
      ? `${account.pendingEmail.kind === "enrollment" ? "初回メール登録" : "メール変更"}の確認待ち: ${account.pendingEmail.email} / 有効期限 ${new Date(account.pendingEmail.expiresAt).toLocaleString("ja-JP")}`
      : "";
'''
)
replace_once(
    "public/assets/account.js",
    '''  const button = $("emailButton");
  button.disabled = true; setStatus("送信しています。");
  try {
    await api("/api/auth/email-change/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newEmail: $("newEmail").value, currentPassword: $("currentPassword").value })
    });''',
    '''  const button = $("emailButton");
  const requestedEmail = String($("newEmail").value || "").trim().toLowerCase();
  if (currentAccountEmailVerified && requestedEmail === currentAccountEmail) {
    setStatus(errorText("EMAIL_UNCHANGED"), true);
    return;
  }
  button.disabled = true; setStatus("登録状況と確認待ち手続きを確認しています。");
  try {
    await api("/api/auth/email-change/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newEmail: requestedEmail, currentPassword: $("currentPassword").value })
    });'''
)

replace_once(
    "public/forgot-password/index.html",
    '''      <p>登録済みのメールアドレスへ再設定リンクを送ります。メールが届かない場合は入力内容と迷惑メールを確認してください。</p>''',
    '''      <p>登録済みのメールアドレスにだけ再設定リンクを送ります。第三者による登録状況の確認を防ぐため、この画面では登録済みかどうかは表示しません。</p>'''
)
replace_once(
    "public/assets/forgot-password.js",
    '''    status.textContent = "登録済みの場合は再設定メールを送信しました。";''',
    '''    status.textContent = "受付しました。安全のため登録状況は表示しません。登録済みの場合のみ再設定メールが送信されます。";'''
)

# Add regression coverage for foreign pending-registration preservation and
# existing-account target rejection.
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    check("email change rejects an address reserved by pending registration",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");

    response = await h.api("/api/org/invitations", {''',
    '''    check("email change rejects an address reserved by pending registration",
      response.status === 409 && (await response.json()).error === "EMAIL_UNAVAILABLE");

    const legacyConflictEmail = "legacy-pending-owner@example.com";
    response = await h.api("/api/auth/registration/request", {
      method: "POST",
      body: { email: legacyConflictEmail, displayName: "Foreign Pending", password: PASSWORD,
        turnstileToken: "test-turnstile" }
    });
    check("foreign pending registration fixture is created", response.status === 202);
    await h.drain();
    const foreignPendingBefore = h.row(
      "SELECT id,revoked_at FROM pending_registrations WHERE email = ?1 AND verified_at IS NULL", legacyConflictEmail
    );
    const ownerEmailBeforeLegacyConflict = h.row(
      "SELECT email,email_verified_at FROM users WHERE id = ?1", owner.data.user.id
    );
    const legacyMutationAt = new Date(Date.now() + 1000).toISOString();
    h.sqlite.prepare(
      "UPDATE users SET email = ?1, email_verified_at = NULL, email_updated_at = ?2, updated_at = ?2 WHERE id = ?3"
    ).run(legacyConflictEmail, legacyMutationAt, owner.data.user.id);
    response = await h.api("/api/auth/email-change/request", {
      method: "POST", auth: owner,
      body: { newEmail: legacyConflictEmail, currentPassword: PASSWORD }
    });
    const legacyConflictBody = await response.clone().json();
    const foreignPendingAfter = h.row(
      "SELECT id,revoked_at FROM pending_registrations WHERE email = ?1 AND verified_at IS NULL", legacyConflictEmail
    );
    check("unverified existing account cannot steal a foreign pending registration",
      response.status === 409 && legacyConflictBody.error === "EMAIL_UNAVAILABLE"
        && foreignPendingAfter?.id === foreignPendingBefore?.id && foreignPendingAfter?.revoked_at === null,
      { legacyConflictBody, foreignPendingBefore, foreignPendingAfter });
    const restoreAt = new Date(Date.now() + 2000).toISOString();
    h.sqlite.prepare(
      "UPDATE users SET email = ?1, email_verified_at = ?2, email_updated_at = ?3, updated_at = ?3 WHERE id = ?4"
    ).run(ownerEmailBeforeLegacyConflict.email, ownerEmailBeforeLegacyConflict.email_verified_at,
      restoreAt, owner.data.user.id);

    response = await h.api("/api/org/invitations", {'''
)
replace_once(
    "scripts/test-account-lifecycle-v2.mjs",
    '''    const second = await register(h, "identity-second@example.com", "Identity Second");
    response = await h.api("/api/org/invitations", {''',
    '''    const second = await register(h, "identity-second@example.com", "Identity Second");
    response = await h.api("/api/auth/email-change/request", {
      method: "POST", auth: owner,
      body: { newEmail: "identity-second@example.com", currentPassword: PASSWORD }
    });
    const registeredTargetBody = await response.clone().json();
    check("email change rejects an address already owned by another account",
      response.status === 409 && registeredTargetBody.error === "EMAIL_UNAVAILABLE", registeredTargetBody);
    response = await h.api("/api/org/invitations", {'''
)

replace_once(
    "scripts/test-email-auth-v2.mjs",
    '''import { consumePublicEmailRateLimit } from "../src/auth/public-auth-rate.js";''',
    '''import { consumeRecipientEmailRateLimit } from "../src/auth/public-auth-rate.js";'''
)
replace_once(
    "scripts/test-email-auth-v2.mjs",
    '''    const request = new Request(`${ORIGIN}/api/auth/registration/request`, {
      method: "POST",
      headers: { "cf-connecting-ip": "127.0.0.9" }
    });
    for (const purpose of ["registration", "registration-resend", "password-reset", "invitation", "email-change"]) {
      await consumePublicEmailRateLimit(request, h.env, "aggregate@example.com", purpose);
    }
    let error;
    try {
      await consumePublicEmailRateLimit(request, h.env, "aggregate@example.com", "another-purpose");
    } catch (caught) {
      error = caught;
    }
    check("daily recipient limit is aggregate across email purposes", error?.status === 429 && error?.code === "RATE_LIMITED", error);''',
    '''    for (let index = 0; index < 5; index += 1) {
      await consumeRecipientEmailRateLimit(h.env, "aggregate@example.com");
    }
    let error;
    try {
      await consumeRecipientEmailRateLimit(h.env, "aggregate@example.com");
    } catch (caught) {
      error = caught;
    }
    check("daily recipient limit is aggregate across actual deliveries", error?.status === 429 && error?.code === "RATE_LIMITED", error);'''
)
replace_once(
    "scripts/test-email-auth-v2.mjs",
    '''    let last;
    for (let index = 0; index < 6; index += 1) {
      last = await h.api("/api/auth/password/reset/request", {
        method: "POST",
        body: { email: "rate@example.com", turnstileToken: "test-turnstile" }
      });
    }
    check("sixth public email request is rate limited", last.status === 429 && (await last.json()).error === "RATE_LIMITED");

    h.env.EMAIL = { async send() { throw Object.assign(new Error("provider down"), { code: "PROVIDER_DOWN" }); } };''',
    '''    let last;
    for (let index = 0; index < 6; index += 1) {
      last = await h.api("/api/auth/password/reset/request", {
        method: "POST",
        body: { email: "rate@example.com", turnstileToken: "test-turnstile" }
      });
    }
    check("unknown reset requests remain enumeration-safe without consuming recipient quota",
      last.status === 202
        && h.row("SELECT COALESCE(SUM(count),0) AS count FROM auth_public_counters WHERE scope='recipient_email'")?.count === 0,
      { status: last.status, counters: h.row("SELECT COALESCE(SUM(count),0) AS count FROM auth_public_counters WHERE scope='recipient_email'") });
    for (let index = 6; index < 21; index += 1) {
      last = await h.api("/api/auth/password/reset/request", {
        method: "POST",
        body: { email: `missing-${index}@example.com`, turnstileToken: "test-turnstile" }
      });
    }
    check("public no-send attempts are still bounded by request IP quota",
      last.status === 429 && (await last.json()).error === "RATE_LIMITED");

    h.env.EMAIL = { async send() { throw Object.assign(new Error("provider down"), { code: "PROVIDER_DOWN" }); } };'''
)

print("Email identity and delivery quota hardening patch applied")
