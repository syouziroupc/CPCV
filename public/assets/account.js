const $ = (id) => document.getElementById(id);
let csrfToken = "";

function show(id, visible) { $(id).classList.toggle("hidden", !visible); }
function setStatus(text, error = false) {
  $("status").textContent = text;
  $("status").style.color = error ? "#dc2626" : "#2563eb";
}
async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) headers.set("x-csrf-token", csrfToken);
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...options, method, headers });
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
function errorText(code) {
  return ({
    EMAIL_INVALID: "メールアドレスを確認してください。",
    EMAIL_UNAVAILABLE: "このメールアドレスは使用できません。",
    EMAIL_UNCHANGED: "現在と同じメールアドレスです。",
    CURRENT_PASSWORD_INVALID: "現在のパスワードが正しくありません。",
    RATE_LIMITED: "要求回数が上限に達しました。時間を置いて再試行してください。"
  })[code] || `処理できませんでした。${code ? ` (${code})` : ""}`;
}
async function load() {
  try {
    const session = await api("/api/auth/session");
    csrfToken = session.csrfToken || "";
    const account = await api("/api/auth/account");
    $("displayName").textContent = account.user.displayName || "利用者";
    const verified = account.user.emailVerified;
    $("emailState").textContent = account.user.email
      ? `${account.user.email}${verified ? "（確認済み）" : "（未確認）"}`
      : "メールアドレス未登録";
    $("organizationState").textContent = account.organizations
      .map((org) => `${org.name} / ${roleLabel(org.role)} / ${statusLabel(org.status)}`).join("\n");
    if (!account.user.email) {
      $("emailHeading").textContent = "メールアドレスを登録";
      $("emailExplanation").textContent = "確認済みメールアドレスを登録します。確認後は全端末からログアウトします。";
    }
    if (account.pendingEmail) {
      $("pendingEmail").textContent = `確認待ち: ${account.pendingEmail.email} / 有効期限 ${new Date(account.pendingEmail.expiresAt).toLocaleString("ja-JP")}`;
    }
    show("loadingSection", false); show("accountSection", true);
  } catch (error) {
    show("loadingSection", false); show("loginRequired", true);
  }
}
$("emailForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("emailButton");
  button.disabled = true; setStatus("送信しています。");
  try {
    await api("/api/auth/email-change/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newEmail: $("newEmail").value, currentPassword: $("currentPassword").value })
    });
    $("currentPassword").value = "";
    setStatus("確認メールを送信しました。メール内のリンクを開いてください。");
    await load();
  } catch (error) { setStatus(errorText(error.code), true); }
  finally { button.disabled = false; }
});
$("logoutButton").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); } catch {}
  location.href = "/admin";
});
function roleLabel(role) { return ({ owner: "Owner", admin: "Admin", teacher: "Teacher" })[role] || role; }
function statusLabel(status) { return ({ active: "有効", suspended: "停止", removed: "解除" })[status] || status; }
await load();
