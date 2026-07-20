import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { rm, stat, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createSalt, createToken, hashPassword, requireValidPassword } from "../src/auth/passwords.js";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OLD_DATABASE_ID = "f11457fa-27af-468d-94cc-6cdf1ae814e4";
const DEFAULT_DATABASE_NAME = "class_comment_db_v2";
const DEFAULT_PERSIST_PATH = ".stage02-d1";

main().catch((error) => {
  console.error(`Bootstrap failed: ${safeMessage(error)}`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let rl;
  const ask = async (prompt) => {
    rl ||= readline.createInterface({ input: stdin, output: stdout });
    return rl.question(prompt);
  };

  let organizationName = options.organizationName;
  let loginId = options.loginId;
  let displayName = options.displayName;

  try {
    organizationName ||= (await ask("Organization name: ")).trim();
    loginId ||= (await ask("Owner login ID: ")).trim().toLowerCase();
    displayName ||= (await ask("Owner display name: ")).trim();

    validateTextInputs({ organizationName, loginId, displayName });

    if (options.remote) {
      validateDatabaseId(options.databaseId);
      if (options.databaseId.toLowerCase() === OLD_DATABASE_ID) {
        throw new Error("Refusing to use the legacy DB database ID.");
      }
      const confirmation = (await ask(
        `Type ${options.databaseName} to confirm remote bootstrap: `
      )).trim();
      if (confirmation !== options.databaseName) {
        throw new Error("Remote bootstrap confirmation did not match.");
      }
    }
  } finally {
    rl?.close();
  }

  organizationName = organizationName.trim();
  displayName = displayName.trim();

  if (options.remote) {
    if (!stdin.isTTY) {
      throw new Error("Remote bootstrap requires an interactive TTY for hidden password input.");
    }
    await verifyRemoteDatabaseIdentity(options);
  }

  let password = await readPassword({
    fromStdin: options.passwordStdin,
    requireTty: options.remote,
    prompt: "Owner password: "
  });
  try {
    requireValidPassword(password, loginId);
  } catch {
    password = "";
    throw new Error("Password does not satisfy the required policy.");
  }
  if (!options.passwordStdin) {
    let confirmation = await readPassword({
      fromStdin: false,
      requireTty: options.remote,
      prompt: "Confirm owner password: "
    });
    const matches = password === confirmation;
    confirmation = "";
    if (!matches) {
      password = "";
      throw new Error("Password confirmation did not match.");
    }
  }

  const passwordSalt = createSalt();
  const passwordHash = await hashPassword(password, passwordSalt);
  password = "";

  if (!options.remote) {
    const result = bootstrapLocalDatabase({
      persistTo: options.persistTo,
      organizationName,
      loginId,
      displayName,
      passwordHash,
      passwordSalt
    });
    console.log("Bootstrap completed.");
    console.log(`Organization ID: ${result.organizationId}`);
    console.log(`Owner user ID: ${result.userId}`);
    return;
  }

  const bootstrapNonce = createToken();
  const port = await reservePort();
  const tempConfig = resolve(PROJECT_ROOT, `.stage02-bootstrap-${process.pid}.toml`);
  const configText = createTemporaryConfig(options, bootstrapNonce);
  await writePrivateFile(tempConfig, configText);

  let child;
  try {
    child = startUtilityWorker({ tempConfig, port, options });
    await waitForHealth(port, child, bootstrapNonce);

    const response = await fetch(`http://127.0.0.1:${port}/bootstrap`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cpcv-bootstrap-nonce": bootstrapNonce
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        organizationName,
        loginId,
        displayName,
        passwordHash,
        passwordSalt
      })
    });

    const result = await response.json().catch(() => ({ ok: false, error: "INVALID_UTILITY_RESPONSE" }));
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `UTILITY_HTTP_${response.status}`);
    }

    console.log("Bootstrap completed.");
    console.log(`Organization ID: ${result.organizationId}`);
    console.log(`Owner user ID: ${result.userId}`);
  } finally {
    if (child) {
      await stopUtilityWorker(child);
    }
    await rm(tempConfig, { force: true });
  }
}


const EXPECTED_SCHEMA_SHA256 = "ba28ea56766a0c67d78765327171114c17c8019530fb0b5b405e881f2f8de629";
const REQUIRED_CORE_TABLES = [
  "audit_logs",
  "auth_sessions",
  "live_sessions",
  "organization_members",
  "organizations",
  "password_reset_tokens",
  "users"
];
const REQUIRED_CORE_SCHEMA_OBJECTS = [
  ...REQUIRED_CORE_TABLES,
  "idx_audit_logs_actor_created",
  "idx_audit_logs_org_created",
  "idx_audit_logs_target_created",
  "idx_auth_sessions_absolute_expiry",
  "idx_auth_sessions_idle_expiry",
  "idx_auth_sessions_org_expiry",
  "idx_auth_sessions_user_org_expiry",
  "idx_live_sessions_creator_status_created",
  "idx_live_sessions_expires",
  "idx_live_sessions_org_status_created",
  "idx_organization_members_org_role_status",
  "idx_organization_members_user_status",
  "idx_organizations_status",
  "idx_password_reset_tokens_expires",
  "idx_password_reset_tokens_user_expires",
  "idx_users_lock_state",
  "idx_users_status"
];
const CORE_SCHEMA_SQL_LIST = REQUIRED_CORE_SCHEMA_OBJECTS.map((value) => `'${value}'`).join(",");

function bootstrapLocalDatabase({ persistTo, organizationName, loginId, displayName, passwordHash, passwordSalt }) {
  const databasePath = findLocalDatabasePath(resolve(PROJECT_ROOT, persistTo));
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    verifyLocalSchema(database);

    const now = new Date().toISOString();
    const organizationId = createLocalId("org_");
    const userId = createLocalId("usr_");
    const auditId = createLocalId("audit_");

    database.exec("BEGIN IMMEDIATE;");
    try {
      const organizationInsert = database.prepare(
        `INSERT INTO organizations (id, name, status, created_at, updated_at, deleted_at)
         SELECT ?, ?, 'active', ?, ?, NULL
         WHERE NOT EXISTS (SELECT 1 FROM organizations)`
      ).run(organizationId, organizationName, now, now);
      if (Number(organizationInsert.changes) !== 1) throw new Error("BOOTSTRAP_ALREADY_COMPLETED");

      const existingUser = database.prepare(
        "SELECT id FROM users WHERE login_id = ? COLLATE NOCASE LIMIT 1"
      ).get(loginId);
      if (existingUser) throw new Error("LOGIN_ID_ALREADY_EXISTS");

      database.prepare(
        `INSERT INTO users (
           id, login_id, display_name, password_scheme, password_hash,
           password_salt, password_changed_at, status, created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, 'pbkdf2-sha256-100000-v3', ?, ?, ?, 'active', ?, ?, NULL)`
      ).run(userId, loginId, displayName, passwordHash, passwordSalt, now, now, now);
      database.prepare(
        `INSERT INTO organization_members (
           organization_id, user_id, role, status, created_at, updated_at, removed_at
         ) VALUES (?, ?, 'owner', 'active', ?, ?, NULL)`
      ).run(organizationId, userId, now, now);
      database.prepare(
        `INSERT INTO audit_logs (
           id, organization_id, actor_type, actor_user_id, actor_role,
           action, target_type, target_id, details_json, created_at
         ) VALUES (?, ?, 'system', NULL, NULL, 'organization.bootstrap',
                   'organization', ?, ?, ?)`
      ).run(auditId, organizationId, organizationId, JSON.stringify({ utility: "bootstrap-owner", version: 2 }), now);
      database.exec("COMMIT;");
    } catch (error) {
      try { database.exec("ROLLBACK;"); } catch {}
      throw error;
    }
    return { organizationId, userId };
  } catch (error) {
    const code = String(error?.message || error);
    if (["BOOTSTRAP_ALREADY_COMPLETED", "LOGIN_ID_ALREADY_EXISTS"].includes(code)) throw new Error(code);
    if (code.startsWith("DB_V2_")) throw new Error(code);
    throw new Error("BOOTSTRAP_TRANSACTION_FAILED");
  } finally {
    database.close();
  }
}

function verifyLocalSchema(database) {
  const migrations = database.prepare(
    `SELECT name FROM d1_migrations
     WHERE name IN ('0001_initial_schema.sql', '0002_auth_security.sql')
     ORDER BY name`
  ).all().map((row) => row.name);
  if (JSON.stringify(migrations) !== JSON.stringify(["0001_initial_schema.sql", "0002_auth_security.sql"])) {
    throw new Error("DB_V2_MIGRATION_NOT_APPLIED");
  }

  const actualTables = new Set(database.prepare(
    `SELECT name FROM sqlite_schema
     WHERE type='table' AND name NOT LIKE 'sqlite_%'
       AND name <> 'd1_migrations' AND substr(name,1,4) <> '_cf_'`
  ).all().map((row) => row.name));
  if (REQUIRED_CORE_TABLES.some((table) => !actualTables.has(table))) {
    throw new Error("DB_V2_SCHEMA_MISMATCH");
  }

  const rows = database.prepare(
    `SELECT type, name, tbl_name, sql FROM sqlite_schema
     WHERE name NOT LIKE 'sqlite_%'
       AND name <> 'd1_migrations'
       AND substr(name,1,4) <> '_cf_'
       AND name IN (${CORE_SCHEMA_SQL_LIST})
       AND sql IS NOT NULL
     ORDER BY type, name`
  ).all();
  const canonical = rows.map((row) =>
    `${row.type}	${row.name}	${row.tbl_name}	${String(row.sql).replace(/\s+/g, " ").trim()}`
  ).join("\n");
  const hash = createHash("sha256").update(canonical).digest("hex");
  if (hash !== EXPECTED_SCHEMA_SHA256) throw new Error("DB_V2_SCHEMA_MISMATCH");

  if (database.prepare("PRAGMA foreign_key_check").all().length !== 0) {
    throw new Error("DB_V2_FOREIGN_KEY_VIOLATION");
  }
  if (String(database.prepare("PRAGMA quick_check").get()?.quick_check || "").toLowerCase() !== "ok") {
    throw new Error("DB_V2_QUICK_CHECK_FAILED");
  }
}

function findLocalDatabasePath(directory) {
  const candidates = findFiles(directory, (path) =>
    path.endsWith(".sqlite")
      && !path.endsWith("metadata.sqlite")
      && path.replaceAll("\\", "/").includes("/d1/")
  );
  const matches = candidates.filter(isLocalDbV2Database);
  if (matches.length !== 1) {
    throw new Error(matches.length > 1 ? "DB_V2_LOCAL_DATABASE_AMBIGUOUS" : "DB_V2_LOCAL_DATABASE_NOT_FOUND");
  }
  return matches[0];
}

function isLocalDbV2Database(path) {
  let database;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    const tableNames = new Set(database.prepare(
      "SELECT name FROM sqlite_schema WHERE type='table'"
    ).all().map((row) => row.name));
    if (!tableNames.has("d1_migrations") || REQUIRED_CORE_TABLES.some((table) => !tableNames.has(table))) {
      return false;
    }
    const migrations = new Set(database.prepare(
      "SELECT name FROM d1_migrations WHERE name IN ('0001_initial_schema.sql','0002_auth_security.sql')"
    ).all().map((row) => row.name));
    return migrations.has("0001_initial_schema.sql") && migrations.has("0002_auth_security.sql");
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

function findFiles(directory, predicate) {
  const matches = [];
  let entries;
  try { entries = readdirSync(directory); }
  catch { return matches; }
  for (const entry of entries) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) matches.push(...findFiles(path, predicate));
    else if (predicate(path)) matches.push(path);
  }
  return matches;
}

function createLocalId(prefix) {
  return `${prefix}${randomUUID().replaceAll("-", "")}`;
}

function parseArgs(args) {
  const options = {
    remote: false,
    databaseId: "",
    databaseName: DEFAULT_DATABASE_NAME,
    persistTo: DEFAULT_PERSIST_PATH,
    organizationName: "",
    loginId: "",
    displayName: "",
    passwordStdin: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--remote") options.remote = true;
    else if (arg === "--password-stdin") options.passwordStdin = true;
    else if (arg === "--database-id") options.databaseId = requireValue(args, ++index, arg);
    else if (arg === "--persist-to") options.persistTo = requireValue(args, ++index, arg);
    else if (arg === "--organization-name") options.organizationName = requireValue(args, ++index, arg);
    else if (arg === "--login-id") options.loginId = requireValue(args, ++index, arg).trim().toLowerCase();
    else if (arg === "--display-name") options.displayName = requireValue(args, ++index, arg);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.remote && options.passwordStdin) {
    throw new Error("Remote bootstrap requires interactive hidden password input. Do not combine --remote with --password-stdin.");
  }
  if (options.remote && !options.databaseId) {
    throw new Error("--remote requires --database-id with the real DB_V2 UUID.");
  }
  if (!options.remote && options.databaseId) {
    throw new Error("--database-id is only accepted together with --remote.");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  npm run db:v2:bootstrap -- [options]

Local DB example:
  npm run db:v2:bootstrap -- --persist-to .stage02-d1

Remote DB example:
  npm run db:v2:bootstrap -- --remote --database-id <real-DB_V2-UUID>

Options:
  --remote                 Use the separate remote DB_V2 resource.
  --database-id <uuid>     Real DB_V2 UUID. Required with --remote.
  --persist-to <path>      Local D1 state directory. Defaults to ${DEFAULT_PERSIST_PATH}.
  --organization-name <v>  Organization name. Prompted when omitted.
  --login-id <v>           Lowercase owner login ID. Prompted when omitted.
  --display-name <v>       Owner display name. Prompted when omitted.
  --password-stdin         Local automated tests only. Reads one password line from standard input.
`);
}

function requireValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

function validateTextInputs({ organizationName, loginId, displayName }) {
  const organizationLength = organizationName.trim().length;
  if (organizationLength < 1 || organizationLength > 120) {
    throw new Error("Organization name must be between 1 and 120 characters.");
  }
  if (!/^[a-z0-9._-]{1,64}$/.test(loginId)) {
    throw new Error("Login ID must use 1-64 lowercase a-z, 0-9, dot, underscore, or hyphen characters.");
  }
  const displayLength = displayName.trim().length;
  if (displayLength < 1 || displayLength > 80) {
    throw new Error("Display name must be between 1 and 80 characters.");
  }
}

function validateDatabaseId(databaseId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(databaseId)) {
    throw new Error("--database-id must be a valid UUID.");
  }
}

async function readPassword({ fromStdin, requireTty, prompt = "Owner password: " }) {
  if (requireTty && !stdin.isTTY) {
    throw new Error("Remote bootstrap requires an interactive TTY for hidden password input.");
  }
  if (fromStdin) {
    const text = await readAllStdin();
    const password = text.split(/\r?\n/, 1)[0] || "";
    if (!password) throw new Error("No password was received on standard input.");
    return password;
  }
  if (!stdin.isTTY) {
    throw new Error("Non-interactive local bootstrap requires --password-stdin.");
  }

  if (typeof stdin.setRawMode !== "function") {
    throw new Error("The current terminal does not support hidden password input.");
  }
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolvePassword, rejectPassword) => {
    let value = "";
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) rejectPassword(error);
      else resolvePassword(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          stdout.write("\n");
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    const onEnd = () => finish(new Error("Password input ended before a newline was received."));
    const onError = () => finish(new Error("Password input failed."));
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.off("error", onError);
      if (typeof stdin.setRawMode === "function") stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
    stdin.once("end", onEnd);
    stdin.once("error", onError);
  });
}

async function readAllStdin() {
  let text = "";
  stdin.setEncoding("utf8");
  for await (const chunk of stdin) text += chunk;
  return text;
}

async function verifyRemoteDatabaseIdentity(options) {
  const tempConfig = resolve(PROJECT_ROOT, `.stage02-bootstrap-preflight-${process.pid}.toml`);
  const configText = [
    'name = "cpcv-bootstrap-owner-preflight"',
    'main = "scripts/bootstrap-owner-worker.mjs"',
    'compatibility_date = "2026-06-17"',
    "",
    "[[d1_databases]]",
    'binding = "DB_V2"',
    `database_name = ${tomlString(options.databaseName)}`,
    `database_id = ${tomlString(options.databaseId)}`,
    ""
  ].join("\n");

  await writePrivateFile(tempConfig, configText);
  try {
    const result = spawnSync(process.execPath, [
      resolve(PROJECT_ROOT, "node_modules", "wrangler", "bin", "wrangler.js"),
      "d1",
      "info",
      "DB_V2",
      "--config",
      relative(PROJECT_ROOT, tempConfig),
      "--json"
    ], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30000
    });

    if (result.status !== 0) {
      throw new Error("Unable to verify the remote DB_V2 resource. Check Cloudflare authentication and the database UUID.");
    }

    let info;
    try {
      info = JSON.parse(result.stdout || "");
    } catch {
      throw new Error("Remote DB_V2 identity check returned invalid JSON.");
    }

    const actualId = String(info?.uuid || "").toLowerCase();
    const actualName = String(info?.name || "");
    if (actualId !== options.databaseId.toLowerCase() || actualName !== options.databaseName) {
      throw new Error("Remote DB_V2 identity did not match both the confirmed database name and UUID.");
    }
  } finally {
    await rm(tempConfig, { force: true });
  }
}

async function writePrivateFile(path, content) {
  await writeFile(path, content, { mode: 0o600 });
  if (process.platform !== "win32") {
    const fileMode = (await stat(path)).mode & 0o777;
    if (fileMode !== 0o600) {
      await rm(path, { force: true });
      throw new Error("Temporary bootstrap configuration permissions are not 0600.");
    }
  }
}

function createTemporaryConfig(options, bootstrapNonce) {
  const lines = [
    'name = "cpcv-bootstrap-owner-local-utility"',
    'main = "scripts/bootstrap-owner-worker.mjs"',
    'compatibility_date = "2026-06-17"',
    "",
    "[[d1_databases]]",
    'binding = "DB_V2"',
    `database_name = ${tomlString(options.databaseName)}`
  ];

  if (options.remote) {
    lines.push(`database_id = ${tomlString(options.databaseId)}`);
    lines.push("remote = true");
  } else {
    lines.push('migrations_dir = "migrations-v2"');
  }

  lines.push("");
  lines.push("[vars]");
  lines.push(`BOOTSTRAP_NONCE = ${tomlString(bootstrapNonce)}`);

  return `${lines.join("\n")}\n`;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function startUtilityWorker({ tempConfig, port, options }) {
  const executable = process.execPath;
  const args = [
    resolve(PROJECT_ROOT, "node_modules", "wrangler", "bin", "wrangler.js"),
    "dev",
    "--config",
    relative(PROJECT_ROOT, tempConfig),
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--log-level",
    "error",
    "--show-interactive-dev-session=false"
  ];
  if (!options.remote) {
    args.push("--persist-to", resolve(PROJECT_ROOT, options.persistTo));
  }

  const child = spawn(executable, args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: { ...process.env, NO_COLOR: "1" }
  });

  let diagnostics = "";
  const collect = (chunk) => {
    diagnostics += String(chunk);
    if (diagnostics.length > 8000) diagnostics = diagnostics.slice(-8000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.bootstrapDiagnostics = () => diagnostics;
  return child;
}

async function waitForHealth(port, child, bootstrapNonce) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Utility worker exited before startup. ${sanitizeDiagnostics(child.bootstrapDiagnostics(), bootstrapNonce)}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { "x-cpcv-bootstrap-nonce": bootstrapNonce },
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) return;
    } catch {
      // Startup polling. No output is logged.
    }
    await delay(150);
  }
  throw new Error(`Utility worker startup timed out. ${sanitizeDiagnostics(child.bootstrapDiagnostics(), bootstrapNonce)}`);
}

async function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
  });
}

async function stopUtilityWorker(child) {
  if (child.exitCode !== null) return;

  signalProcessTree(child, "SIGTERM");
  try {
    await waitForExit(child, 5000);
    return;
  } catch {
    signalProcessTree(child, "SIGKILL");
  }

  await waitForExit(child, 3000).catch(() => {});
}

function signalProcessTree(child, signal) {
  if (!child) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }

  const tracked = child.bootstrapTrackedPids ||= new Set();
  for (const pid of listDescendantPids(child.pid)) tracked.add(pid);
  tracked.add(child.pid);

  // Kill deepest descendants first. Wrangler can place workerd in a separate
  // process group. Killing only -child.pid therefore leaves orphan runtimes.
  for (const pid of [...tracked].reverse()) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function listDescendantPids(rootPid) {
  const result = spawnSync("ps", ["-eo", "pid=,ppid="], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000
  });
  if (result.status !== 0) return [];

  const childrenByParent = new Map();
  for (const line of String(result.stdout || "").split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    if (!childrenByParent.has(parentPid)) childrenByParent.set(parentPid, []);
    childrenByParent.get(parentPid).push(pid);
  }

  const descendants = [];
  const visit = (parentPid) => {
    for (const pid of childrenByParent.get(parentPid) || []) {
      visit(pid);
      descendants.push(pid);
    }
  };
  visit(rootPid);
  return descendants;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => rejectExit(new Error("Process exit timed out.")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function sanitizeDiagnostics(value, secret) {
  const text = String(value || "");
  return secret ? text.replaceAll(String(secret), "[REDACTED]") : text;
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 1000);
}
