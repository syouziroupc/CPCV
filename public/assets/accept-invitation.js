import { errorMessage, tokenFromPath } from "./auth-public.js";
const $ = (id) => document.getElementById(id);
const token = tokenFromPath("/accept-invitation/");
let csrfToken = "";
let invitation;
function show(id, visible) { $(id).classList.toggle("hidden", !visible); }
function setStatus(text, error = false) { $("status").textContent = text; $("status").style.color = error ? "#dc2626" : "#2563eb"; }
async function request(path, options = {}) {
  const method = String(options.method || "POST").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("x-csrf-token", csrfToken);
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, method, headers });
  const text = await response.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  return { response, data };
}
async function post(path, body) { return request(path, { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
function roleLabel(role) { return ({ owner: "Owner", admin: "Admin", teacher: "Teacher" })[role] || role; }
async function inspect() {
  if (!token) return setStatus(errorMessage("INVITATION_INVALID"), true);
  const { response, data } = await post("/api/auth/invitations/inspect", { token });
  if (!response.ok) return setStatus(errorMessage(data.error), true);
  invitation = data.invitation;
  $("invitationInfo").textContent = `${invitation.organizationName} / ${roleLabel(invitation.role)} / 招待先 ${invitation.emailMask}`;
  show("invitationInfo", true);
  const session = await request("/api/auth/session", { method: "GET" });
  if (session.response.ok) {
    csrfToken = session.data.csrfToken || "";
    $("loggedInIdentity").textContent = `${session.data.user?.email || session.data.user?.displayName || "ログイン中の利用者"} でログインしています。`;
    show("loggedInSection", true);
    setStatus("招待内容を確認して承認してください。");
    return;
  }
  show(invitation.accountExists ? "existingSection" : "newSection", true);
  setStatus(invitation.accountExists ? "ログイン後に招待を承認します。" : "アカウントを作成して招待を承認します。");
}
$("acceptExistingButton").addEventListener("click", () => acceptExisting());
async function acceptExisting() {
  const button = $("acceptExistingButton"); button.disabled = true; setStatus("承認しています。");
  const { response, data } = await post("/api/auth/invitations/accept", { token });
  if (response.status === 201) return complete(data);
  setStatus(errorMessage(data.error), true); button.disabled = false;
}
$("loginButton").addEventListener("click", async () => {
  const button = $("loginButton"); button.disabled = true; setStatus("ログインしています。");
  const body = { email: $("loginEmail").value, password: $("loginPassword").value };
  if (!$("organizationGroup").classList.contains("hidden") && $("organization").value) body.organizationId = $("organization").value;
  const login = await post("/api/auth/login", body);
  if (login.response.status === 409 && login.data.error === "ORGANIZATION_SELECTION_REQUIRED") {
    $("organization").textContent = "";
    for (const org of login.data.organizations || []) {
      const option = document.createElement("option"); option.value = org.id; option.textContent = `${org.name} (${roleLabel(org.role)})`; $("organization").appendChild(option);
    }
    show("organizationGroup", true); setStatus("ログイン先組織を選択してください。"); button.disabled = false; return;
  }
  if (!login.response.ok) { setStatus(errorMessage(login.data.error), true); button.disabled = false; return; }
  csrfToken = login.data.csrfToken || "";
  const accepted = await post("/api/auth/invitations/accept", { token });
  if (accepted.response.status === 201) return complete(accepted.data);
  setStatus(errorMessage(accepted.data.error), true); button.disabled = false;
});
$("createButton").addEventListener("click", async () => {
  const button = $("createButton"); button.disabled = true; setStatus("作成しています。");
  const result = await post("/api/auth/invitations/accept", { token, displayName: $("displayName").value, password: $("newPassword").value });
  if (result.response.status === 201) return complete(result.data);
  setStatus(errorMessage(result.data.error), true); button.disabled = false;
});
function complete(data) {
  csrfToken = data.csrfToken || csrfToken;
  show("existingSection", false); show("loggedInSection", false); show("newSection", false); show("completeSection", true);
  setStatus(`${data.organization?.name || "組織"} への参加が完了しました。`);
}
await inspect();
