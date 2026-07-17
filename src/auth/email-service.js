import { AuthError } from "./errors.js";
import { makeId } from "./request.js";
import { hashEmail, maskEmail } from "./email.js";

export async function sendRegistrationVerification(env, entry) {
  const link = authLink(env, "verify-email", entry.rawToken);
  return sendTransactionalEmail(env, {
    kind: "verify_registration",
    to: entry.email,
    subject: "メールアドレスを確認してください",
    text: `CPCVの登録を完了するには次のURLを開いてください。\n\n${link}\n\nこのURLは24時間で失効します。心当たりがない場合は無視してください。`,
    html: `<p>CPCVの登録を完了するには次のリンクを開いてください。</p><p><a href="${escapeHtml(link)}">メールアドレスを確認する</a></p><p>このリンクは24時間で失効します。心当たりがない場合は無視してください。</p>`,
    requestId: entry.requestId
  });
}

export async function sendPasswordReset(env, entry) {
  const link = authLink(env, "reset-password", entry.rawToken);
  return sendTransactionalEmail(env, {
    kind: "password_reset",
    organizationId: entry.organizationId || null,
    to: entry.email,
    subject: "パスワード再設定",
    text: `CPCVのパスワードを再設定するには次のURLを開いてください。\n\n${link}\n\nこのURLは30分で失効します。心当たりがない場合は無視してください。`,
    html: `<p>CPCVのパスワードを再設定するには次のリンクを開いてください。</p><p><a href="${escapeHtml(link)}">パスワードを再設定する</a></p><p>このリンクは30分で失効します。心当たりがない場合は無視してください。</p>`,
    requestId: entry.requestId
  });
}

export async function sendOrganizationInvitation(env, entry) {
  const link = authLink(env, "accept-invitation", entry.rawToken);
  const organizationName = String(entry.organizationName || "組織");
  const role = roleLabel(entry.role);
  return sendTransactionalEmail(env, {
    kind: "organization_invitation",
    organizationId: entry.organizationId,
    to: entry.email,
    subject: `${organizationName}からCPCVへ招待されました`,
    text: `${organizationName}からCPCVへ招待されました。\n権限: ${role}\n\n次のURLから招待を承認してください。\n${link}\n\nこのURLは7日で失効します。`,
    html: `<p><strong>${escapeHtml(organizationName)}</strong>からCPCVへ招待されました。</p><p>権限: ${escapeHtml(role)}</p><p><a href="${escapeHtml(link)}">招待を承認する</a></p><p>このリンクは7日で失効します。</p>`,
    requestId: entry.requestId
  });
}

export async function sendEmailChangeConfirmation(env, entry) {
  const link = authLink(env, "confirm-email-change", entry.rawToken);
  const action = entry.enrollment ? "メールアドレス登録" : "メールアドレス変更";
  return sendTransactionalEmail(env, {
    kind: "email_change_confirmation",
    organizationId: entry.organizationId || null,
    to: entry.email,
    subject: `${action}の確認`,
    text: `CPCVの${action}を完了するには次のURLを開いてください。\n\n${link}\n\nこのURLは30分で失効します。`,
    html: `<p>CPCVの${escapeHtml(action)}を完了するには次のリンクを開いてください。</p><p><a href="${escapeHtml(link)}">${escapeHtml(action)}を確認する</a></p><p>このリンクは30分で失効します。</p>`,
    requestId: entry.requestId
  });
}

export async function sendEmailChangedNotice(env, entry) {
  return sendTransactionalEmail(env, {
    kind: "email_changed_notice",
    organizationId: null,
    to: entry.email,
    subject: "CPCVのメールアドレスが変更されました",
    text: `CPCVのメールアドレスが${entry.newEmail}へ変更されました。\n心当たりがない場合はシステム管理者へ連絡してください。`,
    html: `<p>CPCVのメールアドレスが<strong>${escapeHtml(entry.newEmail)}</strong>へ変更されました。</p><p>心当たりがない場合はシステム管理者へ連絡してください。</p>`,
    requestId: entry.requestId
  });
}

export async function sendTransactionalEmail(env, message) {
  const from = String(env?.AUTH_EMAIL_FROM || "").trim();
  if (!from) throw new AuthError(500, "AUTH_EMAIL_FROM_NOT_CONFIGURED");
  const recipientHash = await hashEmail(message.to, env?.AUTH_RATE_LIMIT_PEPPER);
  const attemptId = makeId("eml");
  const now = new Date().toISOString();
  await env.DB_V2.prepare(
    `INSERT INTO email_delivery_attempts (
       id, kind, recipient_hash, recipient_mask, status,
       provider_message_id, provider_error_code, request_id, created_at, completed_at,
       organization_id
     ) VALUES (?1, ?2, ?3, ?4, 'pending', NULL, NULL, ?5, ?6, NULL, ?7)`
  ).bind(
    attemptId,
    message.kind,
    recipientHash,
    maskEmail(message.to),
    message.requestId,
    now,
    message.organizationId || null
  ).run();

  try {
    if (!env?.EMAIL || typeof env.EMAIL.send !== "function") {
      throw Object.assign(new Error("EMAIL_BINDING_NOT_CONFIGURED"), { code: "EMAIL_BINDING_NOT_CONFIGURED" });
    }
    const result = await env.EMAIL.send({
      to: message.to,
      from,
      subject: sanitizeHeader(message.subject),
      text: message.text,
      html: message.html,
      ...(env.AUTH_EMAIL_REPLY_TO ? { replyTo: String(env.AUTH_EMAIL_REPLY_TO).trim() } : {})
    });
    await safeComplete(env.DB_V2, attemptId, "sent", String(result?.messageId || ""), null);
    return { ok: true, messageId: String(result?.messageId || "") };
  } catch (error) {
    const code = sanitizeErrorCode(error?.code || "EMAIL_SEND_FAILED");
    await safeComplete(env.DB_V2, attemptId, "failed", null, code);
    return { ok: false, error: code };
  }
}

function authLink(env, path, rawToken) {
  const origin = String(env?.AUTH_ORIGIN || "");
  let parsed;
  try { parsed = new URL(origin); } catch { throw new AuthError(500, "AUTH_ORIGIN_INVALID"); }
  if (parsed.origin !== origin) throw new AuthError(500, "AUTH_ORIGIN_INVALID");
  return `${origin}/${path}/${encodeURIComponent(rawToken)}`;
}

async function safeComplete(db, id, status, messageId, errorCode) {
  try {
    await db.prepare(
      `UPDATE email_delivery_attempts
       SET status = ?1, provider_message_id = ?2, provider_error_code = ?3, completed_at = ?4
       WHERE id = ?5 AND status = 'pending'`
    ).bind(status, messageId, errorCode, new Date().toISOString(), id).run();
  } catch {
    // A provider result must not expose storage failures or leak message content.
  }
}

function sanitizeHeader(value) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").trim();
  if (!text || text.length > 200) throw new AuthError(500, "EMAIL_TEMPLATE_INVALID");
  return text;
}

function sanitizeErrorCode(value) {
  return String(value || "EMAIL_SEND_FAILED").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || "EMAIL_SEND_FAILED";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function roleLabel(role) {
  return ({ owner: "Owner", admin: "Admin", teacher: "Teacher" })[role] || "Member";
}
