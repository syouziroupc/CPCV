import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, copyFileSync, cpSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import process from "node:process";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SELF = resolve(ROOT, "scripts/test-bootstrap-owner-v2.mjs");
const WRANGLER = resolve(ROOT, "node_modules/wrangler/bin/wrangler.js");
const caseIndex = process.argv.indexOf("--case");

if (caseIndex >= 0) {
  const caseName = process.argv[caseIndex + 1] || "";
  const result = runCase(caseName);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

const results = [];
const bootstrapSource = readFileSync(resolve(ROOT, "scripts/bootstrap-owner.mjs"), "utf8");
const identityCheckPosition = bootstrapSource.indexOf("await verifyRemoteDatabaseIdentity(options);");
const passwordReadPosition = bootstrapSource.indexOf("let password = await readPassword");
assert(
  "remote bootstrap verifies the actual D1 UUID and name before reading the password",
  /"d1",\s*"info",\s*"DB_V2"/.test(bootstrapSource)
    && bootstrapSource.includes("info?.uuid")
    && bootstrapSource.includes("info?.name")
    && identityCheckPosition >= 0
    && passwordReadPosition > identityCheckPosition
);
assert(
  "bootstrap utility binds only to loopback and uses remote=true for remote D1 access",
  bootstrapSource.includes('"--ip",\n    "127.0.0.1"')
    && bootstrapSource.includes('lines.push("remote = true")')
    && bootstrapSource.includes('spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]')
);
const utilityWorkerSource = readFileSync(resolve(ROOT, "scripts/bootstrap-owner-worker.mjs"), "utf8");
assert(
  "bootstrap verifies migration, table set, foreign keys, and quick_check before writing",
  utilityWorkerSource.includes("d1_migrations")
    && utilityWorkerSource.includes("EXPECTED_APPLICATION_TABLES")
    && utilityWorkerSource.includes("PRAGMA foreign_key_check")
    && utilityWorkerSource.includes("PRAGMA quick_check")
);

const missingRemoteId = runBootstrap(["--remote"]);
assert("remote bootstrap rejects a missing database ID", isCleanFailure(missingRemoteId), missingRemoteId);
const localDatabaseId = runBootstrap(["--database-id", randomUUID()]);
assert("local bootstrap rejects a remote database ID argument", isCleanFailure(localDatabaseId), localDatabaseId);
const remotePasswordStdin = runBootstrap(["--remote", "--database-id", randomUUID(), "--password-stdin"]);
assert("remote bootstrap rejects --password-stdin", isCleanFailure(remotePasswordStdin), remotePasswordStdin);
const legacyRemote = runBootstrap([
  "--remote", "--database-id", "f11457fa-27af-468d-94cc-6cdf1ae814e4",
  "--organization-name", "Legacy Check", "--login-id", "legacy.owner", "--display-name", "Legacy Owner"
], "class_comment_db_v2\n");
assert("remote bootstrap rejects the legacy DB UUID", isCleanFailure(legacyRemote), legacyRemote);
const nonTtyRemote = runBootstrap([
  "--remote", "--database-id", randomUUID(),
  "--organization-name", "Remote TTY Check", "--login-id", "remote.owner", "--display-name", "Remote Owner"
], "class_comment_db_v2\n");
assert("remote bootstrap rejects non-TTY password input", isCleanFailure(nonTtyRemote), nonTtyRemote);

const template = prepareLatestTemplate();
try {
  for (const caseName of ["latest-schema", "coexisting-d1", "missing-index", "rollback", "success", "second-bootstrap"]) {
    const caseResult = runIsolatedCase(caseName, template);
    for (const entry of caseResult.assertions) assert(entry.name, entry.ok, entry.diagnostics || null);
  }
} finally {
  rmSync(template.root, { recursive: true, force: true });
}

const passed = results.filter((entry) => entry.status === "PASS").length;
const failed = results.filter((entry) => entry.status === "FAIL").length;
console.log(`\nDB_V2 bootstrap test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
process.exit(passed === 40 && failed === 0 && results.length === 40 ? 0 : 1);

function runIsolatedCase(caseName, template) {
  const captureId = `${process.pid}-${caseName}-${randomUUID()}`;
  const stdoutPath = resolve(ROOT, `.stage02-case-capture-${captureId}.out`);
  const stderrPath = resolve(ROOT, `.stage02-case-capture-${captureId}.err`);
  const stdoutFd = openSync(stdoutPath, "w", 0o600);
  const stderrFd = openSync(stderrPath, "w", 0o600);
  let result;
  try {
    result = spawnSync(process.execPath, ["--no-warnings", SELF, "--case", caseName], {
      cwd: ROOT,
      stdio: ["ignore", stdoutFd, stderrFd],
      env: { ...process.env, NO_COLOR: "1", CI: "1", CPCV_BOOTSTRAP_TEMPLATE_DB: template.dbDir, CPCV_BOOTSTRAP_TEMPLATE_MIGRATION_OK: template.migrationOk ? "1" : "0" },
      timeout: 180000
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");
  rmSync(stdoutPath, { force: true });
  rmSync(stderrPath, { force: true });
  const normalized = { status: result.status, signal: result.signal, stdout, stderr, error: result.error || null };
  if (result.status !== 0 || result.error) {
    return { assertions: [{ name: `${caseName} isolated case executes`, ok: false, diagnostics: serializableResult(normalized) }] };
  }
  try {
    return JSON.parse(stdout.trim());
  } catch (error) {
    return { assertions: [{ name: `${caseName} isolated case returns valid JSON`, ok: false, diagnostics: { error: error.message, stdout, stderr } }] };
  }
}

function runCase(caseName) {
  const testDir = resolve(ROOT, `.stage02-bootstrap-test-${caseName}-${process.pid}`);
  const dbDir = resolve(testDir, "db");
  const assertions = [];
  const push = (name, ok, diagnostics = null) => assertions.push({ name, ok, diagnostics });
  try {
    const templateDb = process.env.CPCV_BOOTSTRAP_TEMPLATE_DB || "";
    if (!templateDb || !statSync(templateDb).isDirectory()) throw new Error("Bootstrap template DB is unavailable.");
    mkdirSync(testDir, { recursive: true });
    cpSync(templateDb, dbDir, { recursive: true });
    const migrated = process.env.CPCV_BOOTSTRAP_TEMPLATE_MIGRATION_OK === "1";
    const migration = { status: migrated ? 0 : 1, signal: null, stdout: "template migration", stderr: "", error: "" };
    let legacySiblingPath = "";
    if (caseName === "coexisting-d1") {
      legacySiblingPath = resolve(dbDir, "v3/d1/miniflare-D1DatabaseObject/legacy-sibling.sqlite");
      const legacy = new DatabaseSync(legacySiblingPath);
      try { legacy.exec("CREATE TABLE teachers(id TEXT PRIMARY KEY, name TEXT NOT NULL);"); }
      finally { legacy.close(); }
    }
    const databasePath = localDatabasePath(dbDir);
    const password = `Stage02-${randomUUID()}!Aa9`;

    if (caseName === "latest-schema") {
      push("bootstrap test database migration succeeds", migrated, serializableResult(migration));
      const extensionTables = new Set(queryAll(databasePath, "SELECT name FROM sqlite_schema WHERE type='table';").map((row) => row.name));
      push("bootstrap latest-schema extensions are installed", extensionTables.has("comments") && extensionTables.has("auth_session_csrf_tokens"), { extensionTables: [...extensionTables].sort() });
      const run = localBootstrap(dbDir, "Latest Schema Organization", "latest.owner", "Latest Owner", password);
      push("bootstrap accepts the required core schema after later migrations", run.status === 0, serializableResult(run));
      push("latest-schema bootstrap creates exactly one organization", Number(queryOne(databasePath, "SELECT count(*) AS count FROM organizations;")?.count) === 1);
      push("latest-schema bootstrap removes its temporary config", bootstrapTempConfigs().length === 0, { temporaryConfigs: bootstrapTempConfigs() });
      const healthy = queryAll(databasePath, "PRAGMA foreign_key_check;").length === 0 && String(queryOne(databasePath, "PRAGMA quick_check;")?.quick_check || "").toLowerCase() === "ok";
      push("latest-schema bootstrap leaves the extended database healthy", healthy);
    } else if (caseName === "coexisting-d1") {
      push("coexisting legacy D1 fixture is installed", Boolean(legacySiblingPath) && statSync(legacySiblingPath).isFile());
      const run = localBootstrap(dbDir, "Coexisting D1 Organization", "coexisting.owner", "Coexisting Owner", password);
      push("bootstrap selects DB_V2 when the persist directory also contains the legacy D1", run.status === 0, serializableResult(run));
      push("coexisting-D1 bootstrap writes exactly one V2 organization", Number(queryOne(databasePath, "SELECT count(*) AS count FROM organizations;")?.count) === 1);
      push("coexisting-D1 bootstrap does not modify the legacy sibling", Number(queryOne(legacySiblingPath, "SELECT count(*) AS count FROM teachers;")?.count) === 0);
      push("coexisting-D1 bootstrap removes its temporary config", bootstrapTempConfigs().length === 0, { temporaryConfigs: bootstrapTempConfigs() });
    } else if (caseName === "missing-index") {
      const installed = execSql(databasePath, "DROP INDEX idx_users_status;");
      push("bootstrap missing-index fixture is installed", installed.ok, installed.error);
      const run = localBootstrap(dbDir, "Missing Index Organization", "missing.index.owner", "Missing Index Owner", password);
      push("bootstrap rejects a DB whose schema objects differ even when all seven tables remain", isCleanFailure(run), serializableResult(run));
      push("missing-index bootstrap leaves the database empty", Number(queryOne(databasePath, "SELECT count(*) AS count FROM organizations;")?.count) === 0);
      push("missing-index bootstrap removes its temporary config", bootstrapTempConfigs().length === 0, { temporaryConfigs: bootstrapTempConfigs() });
      const restored = execSql(databasePath, "CREATE INDEX idx_users_status ON users(status, created_at);");
      push("bootstrap missing-index fixture is removed", restored.ok, restored.error);
    } else if (caseName === "rollback") {
      const installed = execSql(databasePath, `CREATE TRIGGER test_abort_bootstrap_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'organization.bootstrap' BEGIN SELECT RAISE(ABORT, 'forced bootstrap rollback test'); END;`);
      push("bootstrap rollback trigger is installed", installed.ok, installed.error);
      const run = localBootstrap(dbDir, "Rollback Organization", "rollback.owner", "Rollback Owner", password);
      push("bootstrap reports failure when the audit insert is forced to fail", isCleanFailure(run), serializableResult(run));
      push("bootstrap output does not contain the plaintext password on failure", !combined(run).includes(password));
      push("failed bootstrap removes its temporary config", bootstrapTempConfigs().length === 0, { temporaryConfigs: bootstrapTempConfigs() });
      const counts = queryOne(databasePath, `SELECT (SELECT count(*) FROM organizations) AS organizations, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM organization_members) AS members, (SELECT count(*) FROM audit_logs) AS audits;`);
      push("failed bootstrap rolls back organization, user, membership, and audit together", Object.values(counts || {}).every((value) => Number(value) === 0), counts);
      const removed = execSql(databasePath, "DROP TRIGGER test_abort_bootstrap_audit;");
      push("bootstrap rollback trigger is removed", removed.ok, removed.error);
    } else if (caseName === "success") {
      const run = localBootstrap(dbDir, "Primary Organization", "primary.owner", "Primary Owner", password);
      push("bootstrap creates the first Owner successfully", run.status === 0, serializableResult(run));
      push("bootstrap output does not contain the plaintext password on success", !combined(run).includes(password));
      push("successful bootstrap removes its temporary config", bootstrapTempConfigs().length === 0, { temporaryConfigs: bootstrapTempConfigs() });
      const row = queryOne(databasePath, `SELECT o.name, u.login_id, m.role, m.status, a.actor_type, u.password_hash, u.password_salt FROM organizations o JOIN organization_members m ON m.organization_id=o.id JOIN users u ON u.id=m.user_id JOIN audit_logs a ON a.organization_id=o.id WHERE a.action='organization.bootstrap';`);
      push("bootstrap creates organization, active Owner membership, and system audit", row?.name === "Primary Organization" && row?.login_id === "primary.owner" && row?.role === "owner" && row?.status === "active" && row?.actor_type === "system", row);
      const storedText = JSON.stringify(row || {});
      push("plaintext bootstrap password is absent from stored user fields", !storedText.includes(password));
      const output = combined(run);
      push("bootstrap output does not contain the stored password hash or salt", row && !output.includes(row.password_hash) && !output.includes(row.password_salt));
    } else if (caseName === "second-bootstrap") {
      const now = "2026-07-13T00:00:00.000Z";
      const seeded = execSql(databasePath, `
        INSERT INTO organizations VALUES ('org_existing','Existing Organization','active','${now}','${now}',NULL);
        INSERT INTO users VALUES ('usr_existing','existing.owner','Existing Owner','pbkdf2-sha256-600000-v2','hhhhhhhhhhhhhhhh','ssssssss','${now}','active','${now}','${now}',NULL,0,NULL,0,NULL,NULL,NULL);
        INSERT INTO organization_members VALUES ('org_existing','usr_existing','owner','active','${now}','${now}',NULL);
      `);
      const run = seeded.ok ? localBootstrap(dbDir, "Second Organization", "second.owner", "Second Owner", password) : { status: null, signal: null, stdout: "", stderr: "", error: seeded.error };
      push("bootstrap rejects a second execution by default", seeded.ok && isCleanFailure(run), serializableResult(run));
      push("second bootstrap output does not contain the plaintext password", !combined(run).includes(password));
      push("rejected second bootstrap removes its temporary config", bootstrapTempConfigs().length === 0, { temporaryConfigs: bootstrapTempConfigs() });
      push("second bootstrap leaves exactly one organization", Number(queryOne(databasePath, "SELECT count(*) AS count FROM organizations;")?.count) === 1);
    } else {
      throw new Error(`Unknown case: ${caseName}`);
    }
  } catch (error) {
    assertions.push({ name: `${caseName} isolated case completes`, ok: false, diagnostics: String(error?.stack || error) });
  } finally {
    rmSync(testDir, { recursive: true, force: true });
    for (const entry of bootstrapTempConfigs()) rmSync(resolve(ROOT, entry), { force: true });
  }
  return { assertions };
}

function prepareLatestTemplate() {
  const root = resolve(ROOT, `.stage02-bootstrap-template-${process.pid}`);
  const dbDir = resolve(root, "db");
  const databaseDir = resolve(dbDir, "v3/d1/miniflare-D1DatabaseObject");
  const databasePath = resolve(databaseDir, "bootstrap-template.sqlite");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(databaseDir, { recursive: true });

  const database = new DatabaseSync(databasePath);
  let migrationOk = false;
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(`CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
    for (const migrationName of readdirSync(resolve(ROOT, "migrations-v2")).filter((name) => name.endsWith(".sql")).sort()) {
      database.exec(readFileSync(resolve(ROOT, `migrations-v2/${migrationName}`), "utf8"));
      database.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(migrationName);
    }
    migrationOk = database.prepare("PRAGMA foreign_key_check").all().length === 0
      && String(database.prepare("PRAGMA quick_check").get()?.quick_check || "").toLowerCase() === "ok";
  } finally {
    database.close();
  }
  return { root, dbDir, migrationOk, migration: { status: migrationOk ? 0 : 1, signal: null, stdout: "migration SQL template", stderr: "", error: "" } };
}

function localBootstrap(dbDir, organizationName, loginId, displayName, password) {
  return runBootstrap([
    "--organization-name", organizationName,
    "--login-id", loginId,
    "--display-name", displayName,
    "--persist-to", dbDir,
    "--password-stdin"
  ], `${password}\n`);
}

function runBootstrap(args, input = "") {
  const captureId = `${process.pid}-${randomUUID()}`;
  const stdoutPath = resolve(ROOT, `.stage02-bootstrap-capture-${captureId}.out`);
  const stderrPath = resolve(ROOT, `.stage02-bootstrap-capture-${captureId}.err`);
  const stdoutFd = openSync(stdoutPath, "w", 0o600);
  const stderrFd = openSync(stderrPath, "w", 0o600);
  let result;
  try {
    result = spawnSync(process.execPath, [resolve(ROOT, "scripts/bootstrap-owner.mjs"), ...args], {
      cwd: ROOT,
      input,
      stdio: ["pipe", stdoutFd, stderrFd],
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
      timeout: 120000
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");
  rmSync(stdoutPath, { force: true });
  rmSync(stderrPath, { force: true });
  return { status: result.status, signal: result.signal, stdout, stderr, error: result.error || null };
}

function runWrangler(config, args) {
  return spawnSync(process.execPath, [WRANGLER, ...args, "--config", config], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120000
  });
}

function localDatabasePath(dbDir) {
  const candidates = findFiles(dbDir, (path) => path.endsWith(".sqlite") && !path.endsWith("metadata.sqlite"));
  const matches = candidates.filter((path) => {
    let database;
    try {
      database = new DatabaseSync(path, { readOnly: true });
      const tables = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map((row) => row.name));
      return tables.has("d1_migrations") && tables.has("organizations") && tables.has("organization_members") && tables.has("users");
    } catch { return false; }
    finally { database?.close(); }
  });
  if (matches.length !== 1) throw new Error(`Expected one DB_V2 SQLite file, found ${matches.length}.`);
  return matches[0];
}

function findFiles(directory, predicate) {
  const matches = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) matches.push(...findFiles(path, predicate));
    else if (predicate(path)) matches.push(path);
  }
  return matches;
}

function execSql(databasePath, sql) {
  let database;
  try {
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec(sql);
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  } finally {
    database?.close();
  }
}

function queryAll(databasePath, sql) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try { return database.prepare(sql).all().map((row) => ({ ...row })); }
  finally { database.close(); }
}

function queryOne(databasePath, sql) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try { return { ...database.prepare(sql).get() }; }
  finally { database.close(); }
}

function bootstrapTempConfigs() {
  return readdirSync(ROOT).filter((entry) => entry.startsWith(".stage02-bootstrap-") && entry.endsWith(".toml"));
}

function isCleanFailure(result) {
  return result.status !== 0 && result.signal === null && !result.error;
}

function assert(name, condition, diagnostics = null) {
  const status = condition ? "PASS" : "FAIL";
  results.push({ name, status });
  console.log(`[${status}] ${name}`);
  if (!condition && diagnostics) console.error(formatDiagnostics(diagnostics));
}

function combined(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}\n${result.error?.message || result.error || ""}`;
}

function serializableResult(result) {
  return { status: result.status, signal: result.signal, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error?.message || result.error || "" };
}

function formatDiagnostics(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.slice(0, 6000);
}
