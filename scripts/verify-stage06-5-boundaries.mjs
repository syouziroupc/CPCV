import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const text = (path) => readFileSync(resolve(ROOT, path), "utf8");
const check = (name, condition, detail = "") => { const ok = Boolean(condition); results.push({ name, ok }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`); if (!ok && detail) console.error(detail); };
const migrations = readdirSync(resolve(ROOT, "migrations-v2")).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();

check("Stage 6.5 migrations remain present and ordered", migrations.includes("0008_email_auth.sql") && migrations.includes("0009_account_lifecycle.sql") && migrations.indexOf("0008_email_auth.sql") < migrations.indexOf("0009_account_lifecycle.sql"), migrations);
const migration = text("migrations-v2/0009_account_lifecycle.sql");
for (const name of ["email_enrollment_requests", "organization_email_events"]) check(`Stage 6.5 table exists: ${name}`, migration.includes(`CREATE TABLE ${name}`));
check("email delivery attempts are organization attributable", migration.includes("ALTER TABLE email_delivery_attempts ADD COLUMN organization_id"));
check("active membership quota is enforced in D1", migration.includes("MEMBER_LIMIT_REACHED") && migration.includes("trg_organization_members_active_limit"));
check("pending invitation quota is enforced in D1", migration.includes("INVITATION_LIMIT_REACHED") && migration.includes("trg_organization_invitations_pending_limit"));
check("daily invitation email quota is enforced in D1", migration.includes("INVITATION_EMAIL_DAILY_LIMIT_REACHED") && migration.includes("trg_organization_invitation_daily_email_limit"));

const lifecycle = text("src/routes/account-lifecycle.js");
check("organization invitation endpoints are connected", lifecycle.includes("/api/org/invitations") && lifecycle.includes("handleInvitationAccept"));
check("invitation tokens are stored as hashes", lifecycle.includes("hashToken(rawToken)") && lifecycle.includes("token_hash"));
check("email enrollment and change both exist", lifecycle.includes("email_enrollment_requests") && lifecycle.includes("email_change_requests"));
check("email confirmation revokes all user sessions", /UPDATE auth_sessions SET revoked_at[\s\S]*WHERE user_id/.test(lifecycle));
check("manager password reset sends email", lifecycle.includes("issueMemberPasswordResetEmail") && lifecycle.includes("sendPasswordReset"));
check("manager password reset response does not expose resetToken", !/issueMemberPasswordResetEmail[\s\S]{0,2200}resetToken\s*:/.test(lifecycle));

const organization = text("src/routes/organization.js");
check("temporary-password creation is disabled in email-required mode", organization.includes("MEMBER_INVITATION_REQUIRED") && organization.includes("EMAIL_AUTH_REQUIRED"));
check("organization reset delegates to email delivery", organization.includes("issueMemberPasswordResetEmail"));

for (const path of [
  "public/account/index.html", "public/assets/account.js",
  "public/accept-invitation/index.html", "public/assets/accept-invitation.js",
  "public/confirm-email-change/index.html", "public/assets/confirm-email-change.js"
]) check(`account lifecycle UI exists: ${path}`, existsSync(resolve(ROOT, path)));
const master = text("public/assets/master.js");
check("master UI creates email invitations", master.includes("/api/org/invitations") && master.includes("memberEmail"));
check("master UI no longer displays raw reset token", !master.includes("resetToken") && !master.includes("仮パスワード"));
check("account lifecycle test command exists", text("package.json").includes("test-account-lifecycle-v2.mjs"));
check("package version is Stage 6.5 or later", /"version"\s*:\s*"(?:0\.6\.5(?:-a\.\d+)?|0\.[78]\.\d+)"/.test(text("package.json")));

const passed = results.filter((x) => x.ok).length;
const failed = results.length - passed;
console.log(`\nStage 6.5 boundary summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;
