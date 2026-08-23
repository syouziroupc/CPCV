import { fetchWithTimeout } from "./http-client.js";

const $ = (id) => document.getElementById(id);
let csrfToken = "";
let currentAccountEmail = "";
let currentAccountEmailVerified = false;

function show(id, visible) { $(id).classList.toggle("hidden", !visible); }
function setStatus(text, error = false) {
  $("status").textContent = text;
  $("status").style.color = error ? "#dc2626" : "#2563eb";
}
async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) headers.set("x-csrf-token", csrfToken);
  const response = await fetchWithTimeout(path, { cache: "no-store", credentials: "same-origin", ...options, method, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || "API_ERROR");
    error.code = data.error || "API_ERROR";
    error.status = response.status;
    throw error;
  }
  return data;
}
function sharedSession() {
  if (!window.__cpcvSessionPromise) {
    window.__cpcvSessionPromise = api("/api/auth/session").catch((error) => {
      window.__cpcvSessionPromise = null;
      throw error;
    });
  }
  return window.__cpcvSessionPromise;
}
function errorText(code) {
  return ({
    EMAIL_INVALID: "メールアドレスを確認してください。",
    EMAIL_UNAVAILABLE: "このメールアドレスは、既存アカウントまたは別の登録・変更手続きで使用中です。別のアドレスを指定してください。",
    EMAIL_UNCHANGED: "現在と同じメールアドレスです。",
    CURRENT_PASSWORD_INVALID: "現在のパスワードが正しくありません。",
    RATE_LIMITED: "要求回数が上限に達しました。時間を置いて再試行してください。",
    REQUEST_TIMEOUT: "通信がタイムアウトしました。もう一度試してください。",
    NETWORK_ERROR: "ネットワークに接続できません。接続を確認してください。"
  })[code] || "処理できませんでした。時間をおいてもう一度お試しください。";
}
async function load() {
  try {
    const session = await sharedSession();
    csrfToken = session.csrfToken || "";
    const account = await api("/api/auth/account");
    $("displayName").textContent = account.user.displayName || "利用者";
    const verified = account.user.emailVerified;
    currentAccountEmail = String(account.user.email || "").trim().toLowerCase();
    currentAccountEmailVerified = Boolean(verified);
    $("emailState").textContent = account.user.email
      ? `${account.user.email}${verified ? "（確認済み）" : "（未確認）"}`
      : "メールアドレス未登録";
    $("organizationState").textContent = account.organizations
      .map((org) => `${org.name} / ${roleLabel(org.role)} / ${statusLabel(org.status)}`).join("\n");
    if (!account.user.email) {
      $("emailHeading").textContent = "メールアドレスを登録";
      $("emailExplanation").textContent = "確認済みメールアドレスを登録します。確認後は全端末からログアウトします。";
    }
    $("pendingEmail").textContent = account.pendingEmail
      ? `${account.pendingEmail.kind === "enrollment" ? "初回メール登録" : "メール変更"}の確認待ち: ${account.pendingEmail.email} / 有効期限 ${new Date(account.pendingEmail.expiresAt).toLocaleString("ja-JP")}`
      : "";
    show("loadingSection", false); show("accountSection", true);
  } catch (error) {
    if (error?.status === 401) {
      show("loadingSection", false); show("loginRequired", true);
      return;
    }
    const status = $("loadingSection")?.querySelector(".status");
    if (status) status.textContent = errorText(error?.code || "NETWORK_ERROR");
    show("loadingSection", true); show("loginRequired", false);
  }
}
$("emailForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("emailButton");
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
    });
    $("currentPassword").value = "";
    setStatus("確認メールを送信しました。メール内のリンクを開いてください。");
    await load();
  } catch (error) { setStatus(errorText(error.code), true); }
  finally { button.disabled = false; }
});

$("passwordForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("passwordButton");
  const status = $("passwordStatus");
  const currentPassword = $("passwordCurrent").value;
  const newPassword = $("passwordNew").value;
  if (newPassword !== $("passwordConfirm").value) {
    status.textContent = "新しいパスワードの確認入力が一致しません。";
    status.style.color = "#dc2626";
    return;
  }
  button.disabled = true;
  status.textContent = "変更しています。";
  status.style.color = "";
  try {
    const data = await api("/api/auth/password/change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    csrfToken = data.csrfToken || csrfToken;
    window.__cpcvSessionPromise = Promise.resolve(data);
    $("passwordCurrent").value = "";
    $("passwordNew").value = "";
    $("passwordConfirm").value = "";
    status.textContent = "パスワードを変更しました。他の端末のログイン状態は終了しました。";
  } catch (error) {
    status.textContent = error.code === "CURRENT_PASSWORD_INVALID"
      ? "現在のパスワードが正しくありません。"
      : errorText(error.code);
    status.style.color = "#dc2626";
  } finally { button.disabled = false; }
});
$("logoutButton").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); } catch {}
  location.href = "/admin";
});
$("deleteAccountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("deleteAccountButton");
  const deleteStatus = $("deleteStatus");
  if (!confirm("アカウントを削除します。この操作は取り消せません。")) return;
  button.disabled = true;
  deleteStatus.textContent = "削除しています...";
  try {
    await api("/api/auth/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: $("deletePassword").value,
        confirmation: $("deleteConfirmation").value
      })
    });
    location.href = "/?accountDeleted=1";
  } catch (error) {
    deleteStatus.textContent = ({
      CURRENT_PASSWORD_INVALID: "パスワードが正しくありません。",
      ACCOUNT_DELETE_CONFIRMATION_INVALID: "DELETE と正確に入力してください。",
      ACCOUNT_DELETE_OWNERSHIP_TRANSFER_REQUIRED: "共有組織の所有権を別の所有者へ移管してください。",
      ACCOUNT_DELETE_ORGANIZATION_MEMBERS_REMAIN: "個人用ワークスペースに他のメンバーが残っています。"
    })[error.code] || errorText(error.code);
    button.disabled = false;
  }
});

function roleLabel(role) { return ({ owner: "所有者", admin: "管理者", teacher: "先生" })[role] || "権限不明"; }
function statusLabel(status) { return ({ active: "有効", suspended: "停止", removed: "解除" })[status] || "状態不明"; }
await load();
