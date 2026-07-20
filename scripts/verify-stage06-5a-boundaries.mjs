import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const text = (path) => readFileSync(resolve(ROOT, path), "utf8");
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
};

const migrations = readdirSync(resolve(ROOT, "migrations-v2")).filter((name) => name.endsWith(".sql")).sort();
check("Stage 6.5-A migration is append-only after Stage 6", migrations.includes("0008_email_auth.sql") && migrations.indexOf("0007_realtime.sql") < migrations.indexOf("0008_email_auth.sql"), migrations);
const migration = text("migrations-v2/0008_email_auth.sql");
for (const name of ["pending_registrations", "organization_origins", "organization_quotas", "email_delivery_attempts", "auth_public_counters"]) {
  check(`email migration creates ${name}`, migration.includes(`CREATE TABLE ${name}`));
}
check("email is unique only when present", migration.includes("idx_users_email_unique") && migration.includes("WHERE email IS NOT NULL"));
check("registration raw token is represented only by token_hash in schema", migration.includes("token_hash TEXT NOT NULL UNIQUE") && !/raw_token/i.test(migration));

const routes = text("src/routes/email-auth.js");
check("registration request route exists", routes.includes('/api/auth/registration/request'));
check("registration verification route exists", routes.includes('/api/auth/registration/verify'));
check("email reset request route exists", routes.includes('/api/auth/password/reset/request'));
check("registration creates Owner and quota", routes.includes("'owner', 'active'") && routes.includes("organization_quotas"));
check("registration email uniqueness conflict aborts the batch", !routes.includes("AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = p.email COLLATE NOCASE)"));
check("registration audit is conditional on the created Owner", routes.includes("conditionalRegistrationAuditStatement") && routes.includes("WHERE EXISTS"));
check("public email routes require Turnstile", routes.includes("requireTurnstile"));
check("public email routes consume exact rate limits", routes.includes("consumePublicEmailRateLimit"));
const publicRate = text("src/auth/public-auth-rate.js");
check("daily recipient and IP limits are aggregate across email purposes", publicRate.includes("buildRateLimitKey(email, pepper, \"recipient\")") && publicRate.includes("buildRateLimitKey(ip, pepper, \"request-ip\")"));

const emailService = text("src/auth/email-service.js");
check("email links use path segments instead of query tokens", emailService.includes('"verify-email"') && emailService.includes('"reset-password"') && !emailService.includes("?token="));
check("email sender uses the Cloudflare binding", emailService.includes("env.EMAIL.send"));
check("delivery attempts never store body or raw token columns", !/INSERT INTO email_delivery_attempts[\s\S]{0,500}(body|raw_token)/i.test(emailService));


const securityHeaders = text("src/security-headers.js");
const publicAuth = text("public/assets/auth-public.js");
check("HTML CSP allows the Turnstile script", securityHeaders.includes("script-src 'self' https://challenges.cloudflare.com"));
check("HTML CSP allows the Turnstile frame", securityHeaders.includes("frame-src https://challenges.cloudflare.com"));
check("public auth pages load one callback-driven Turnstile script", ["signup", "forgot-password"].every((page) => {
  const html = text(`public/${page}/index.html`);
  return html.includes('src="/assets/turnstile-bootstrap.js?v=0.6.5a"')
    && html.includes('api.js?onload=cpcvTurnstileReady&amp;render=explicit" defer');
}) && !publicAuth.includes('document.createElement("script")'));
check("missing production Turnstile configuration fails closed", publicAuth.includes("turnstileTestBypass") && publicAuth.includes("TURNSTILE_NOT_CONFIGURED"));

const auth = text("src/routes/auth.js");
check("login accepts email", auth.includes('assertOnlyFields(input, ["email", "loginId", "password", "organizationId"])'));
check("email-required mode rejects login ID", auth.includes("EMAIL_AUTH_REQUIRED"));
check("reset verifies email snapshot", auth.includes("record.email_snapshot") && auth.includes("record.email"));

const wrangler = text("wrangler.toml");
check("Cloudflare Email binding is configured", /\[\[send_email\]\][\s\S]*name\s*=\s*"EMAIL"/.test(wrangler));
check("real email sender is not committed", !/^AUTH_EMAIL_FROM\s*=/m.test(wrangler));
const packageJson = JSON.parse(text("package.json"));
check("package version identifies Stage 6.5-A", /^(?:0\.6\.5-a\.|0\.[78]\.)/.test(packageJson.version), packageJson.version);
check("Stage 6.5-A test command exists", typeof packageJson.scripts?.["check:stage06-5a"] === "string");

const publicAssets = ["signup", "forgot-password", "verify-email", "reset-password"];
for (const name of publicAssets) {
  check(`${name} page exists`, text(`public/${name}/index.html`).length > 0);
}

const failed = results.filter((item) => !item.ok).length;
console.log(`\nStage 6.5-A boundary summary: ${results.length - failed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;
