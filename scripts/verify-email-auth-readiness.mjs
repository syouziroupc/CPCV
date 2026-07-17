import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const database = "class_comment_db_v2";
const config = readFileSync(resolve(process.cwd(), "wrangler.toml"), "utf8");
const emailAuthRequired = config.match(/^EMAIL_AUTH_REQUIRED\s*=\s*"([01])"\s*$/m)?.[1];
if (emailAuthRequired !== "1") {
  console.log("EMAIL_AUTH_REQUIRED=0。メール必須化は要求されていないためOwner移行検査を省略します。");
  process.exit(0);
}

const sql = `SELECT o.id AS organization_id, o.name AS organization_name,
                    COUNT(*) AS active_owner_count,
                    SUM(CASE WHEN u.email IS NOT NULL AND u.email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified_owner_count
             FROM organizations o
             JOIN organization_members m ON m.organization_id=o.id AND m.role='owner' AND m.status='active'
             JOIN users u ON u.id=m.user_id AND u.status='active'
             WHERE o.status='active'
             GROUP BY o.id,o.name
             HAVING verified_owner_count < active_owner_count
             ORDER BY o.id;`;
const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", [
  "wrangler", "d1", "execute", database, "--remote", "--json", "--command", sql
], { cwd: process.cwd(), env: process.env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "Remote D1 query failed.\n");
  process.exit(result.status || 1);
}
let payload;
try { payload = JSON.parse(result.stdout.replace(/^\uFEFF/, "")); }
catch (error) { console.error(`Unable to parse Wrangler D1 JSON: ${error.message}`); process.exit(1); }
const executions = Array.isArray(payload) ? payload : [payload];
const rows = executions.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
if (rows.length) {
  console.error("EMAIL_AUTH_REQUIRED=1へ切り替えできません。確認済みメールを持たないactive Ownerが存在します。");
  for (const row of rows) console.error(`${row.organization_id}\t${row.organization_name}\t${row.verified_owner_count}/${row.active_owner_count}`);
  process.exit(1);
}
console.log("email authentication cutover readiness verified");
