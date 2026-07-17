import { createSalt, hashPassword } from "../lib/password.js";
import {
  HttpError,
  createMasterSession,
  requireMasterSession,
  requireMasterToken,
  revokeMasterSession
} from "../lib/master-auth.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

export async function handleMasterApi(request, env) {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/api/master/login" && request.method === "POST") return await login(request, env);
    if (url.pathname === "/api/master/logout" && request.method === "POST") return await logout(request, env);

    await requireMasterSession(request, env);
    if (url.pathname === "/api/master/status" && request.method === "GET") return await status(env);
    if (url.pathname === "/api/master/teachers" && request.method === "GET") return await listTeachers(env);
    if (url.pathname === "/api/master/teachers" && request.method === "POST") return await createTeacher(request, env);
    if (url.pathname === "/api/master/sessions" && request.method === "GET") return await listSessions(env);

    const teacherId = parts[3];
    if (parts[0] === "api" && parts[1] === "master" && parts[2] === "teachers" && teacherId) {
      if (parts[4] === "reset-password" && request.method === "POST") return await resetPassword(env, teacherId);
      if (parts[4] === "disable" && request.method === "POST") return await setTeacherActive(env, teacherId, false);
      if (parts[4] === "enable" && request.method === "POST") return await setTeacherActive(env, teacherId, true);
      if (request.method === "DELETE" && parts.length === 4) return await deleteTeacher(env, teacherId);
    }

    const sessionId = parts[3];
    if (parts[0] === "api" && parts[1] === "master" && parts[2] === "sessions" && sessionId) {
      if (parts[4] === "end" && request.method === "POST") return await setSessionStatus(env, sessionId, "ended");
      if (request.method === "DELETE" && parts.length === 4) return await setSessionStatus(env, sessionId, "deleted");
    }

    return json({ ok: false, error: "NOT_FOUND" }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

async function login(request, env) {
  const input = await readJson(request);
  requireMasterToken(input.masterToken || "", env);
  const session = await createMasterSession(env);
  return json({ ok: true, masterSession: session.token, expiresAt: session.expiresAt });
}

async function logout(request, env) {
  await revokeMasterSession(request, env);
  return json({ ok: true });
}

async function status(env) {
  return json({ ok: true, sessionMinutes: 15 });
}

async function listTeachers(env) {
  const rows = await env.DB.prepare(
    `SELECT id, login_id, display_name, active, created_at, updated_at, disabled_at
     FROM teacher_accounts
     ORDER BY created_at DESC`
  ).all();
  return json({ ok: true, teachers: rows.results || [] });
}

async function listSessions(env) {
  const rows = await env.DB.prepare(
    `SELECT s.id, s.title, s.public_code, s.teacher_id, s.status, s.created_at, s.ended_at,
            ta.login_id, ta.display_name
     FROM sessions s
     LEFT JOIN teacher_accounts ta ON ta.id = s.teacher_id
     WHERE s.status = 'active'
       AND datetime(s.created_at) > datetime('now', '-6 hours')
     ORDER BY s.created_at DESC`
  ).all();
  return json({ ok: true, sessions: rows.results || [] });
}

async function createTeacher(request, env) {
  const input = await readJson(request);
  const loginId = normalizeLoginId(input.loginId);
  const displayName = clampText(input.displayName || loginId, 80);
  const password = String(input.password || "");
  if (!loginId) throw new HttpError(400, "LOGIN_ID_REQUIRED");
  if (!displayName) throw new HttpError(400, "DISPLAY_NAME_REQUIRED");
  if (password.length < 8) throw new HttpError(400, "PASSWORD_TOO_SHORT");

  const now = new Date().toISOString();
  const salt = createSalt();
  const passwordHash = await hashPassword(password, salt);
  const id = `ta_${crypto.randomUUID().replaceAll("-", "")}`;
  await env.DB.prepare(
    `INSERT INTO teacher_accounts (id, login_id, display_name, password_hash, password_salt, active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).bind(id, loginId, displayName, passwordHash, salt, now).run();
  return json({ ok: true, teacher: { id, loginId, displayName, active: true }, initialPassword: password });
}

async function resetPassword(env, teacherId) {
  const password = generatePassword();
  const salt = createSalt();
  const passwordHash = await hashPassword(password, salt);
  await env.DB.prepare(
    `UPDATE teacher_accounts
     SET password_hash = ?, password_salt = ?, updated_at = ?
     WHERE id = ?`
  ).bind(passwordHash, salt, new Date().toISOString(), teacherId).run();
  await revokeTeacherSessions(env, teacherId);
  return json({ ok: true, password });
}

async function setTeacherActive(env, teacherId, active) {
  await env.DB.prepare(
    `UPDATE teacher_accounts
     SET active = ?, updated_at = ?, disabled_at = ?
     WHERE id = ?`
  ).bind(active ? 1 : 0, new Date().toISOString(), active ? null : new Date().toISOString(), teacherId).run();
  if (!active) await revokeTeacherSessions(env, teacherId);
  return json({ ok: true });
}

async function deleteTeacher(env, teacherId) {
  await revokeTeacherSessions(env, teacherId);
  await env.DB.prepare(`DELETE FROM teacher_sessions WHERE teacher_account_id = ?`).bind(teacherId).run();
  await env.DB.prepare(`DELETE FROM teacher_accounts WHERE id = ?`).bind(teacherId).run();
  return json({ ok: true });
}

async function setSessionStatus(env, sessionId, status) {
  await env.DB.prepare(
    `UPDATE sessions SET posting_enabled = 0, comments_visible = 0, status = ?, ended_at = ? WHERE id = ?`
  ).bind(status, new Date().toISOString(), sessionId).run();
  return json({ ok: true });
}

async function revokeTeacherSessions(env, teacherId) {
  await env.DB.prepare(
    `UPDATE teacher_sessions SET revoked_at = ? WHERE teacher_account_id = ? AND revoked_at IS NULL`
  ).bind(new Date().toISOString(), teacherId).run();
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64);
}

function clampText(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "INTERNAL_ERROR";
  console.error(error);
  return json({ ok: false, error: message }, status);
}
