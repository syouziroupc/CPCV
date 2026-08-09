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
  })[code] || `処理できませんでした。${code ? ` (${code})` : ""}`;
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
  if (!confirm("\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u524a\u9664\u3057\u307e\u3059\u3002\u3053\u306e\u64cd\u4f5c\u306f\u53d6\u308a\u6d88\u305b\u307e\u305b\u3093\u3002")) return;
  button.disabled = true;
  deleteStatus.textContent = "\u524a\u9664\u3057\u3066\u3044\u307e\u3059...";
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
      CURRENT_PASSWORD_INVALID: "\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
      ACCOUNT_DELETE_CONFIRMATION_INVALID: "DELETE \u3068\u6b63\u78ba\u306b\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      ACCOUNT_DELETE_OWNERSHIP_TRANSFER_REQUIRED: "\u5171\u6709\u7d44\u7e54\u306e\u6240\u6709\u6a29\u3092\u5225\u306eOwner\u3078\u79fb\u7ba1\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      ACCOUNT_DELETE_ORGANIZATION_MEMBERS_REMAIN: "\u500b\u4eba\u7528\u30ef\u30fc\u30af\u30b9\u30da\u30fc\u30b9\u306b\u4ed6\u306e\u30e1\u30f3\u30d0\u30fc\u304c\u6b8b\u3063\u3066\u3044\u307e\u3059\u3002"
    })[error.code] || errorText(error.code);
    button.disabled = false;
  }
});

function roleLabel(role) { return ({ owner: "Owner", admin: "Admin", teacher: "Teacher" })[role] || role; }
function statusLabel(status) { return ({ active: "有効", suspended: "停止", removed: "解除" })[status] || status; }
await load();
