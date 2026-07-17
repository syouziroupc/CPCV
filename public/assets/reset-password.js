import { api, errorMessage, tokenFromPath } from "./auth-public.js";
const form = document.getElementById("resetForm");
const button = document.getElementById("submitButton");
const status = document.getElementById("status");
const loginLink = document.getElementById("loginLink");
const token = tokenFromPath("/reset-password/");
if (!token) {
  status.textContent = "再設定リンクは無効です。";
  button.disabled = true;
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("password").value;
  const confirmation = document.getElementById("confirmation").value;
  if (password !== confirmation) {
    status.textContent = "パスワードが一致しません。";
    return;
  }
  button.disabled = true;
  const result = await api("/api/auth/password/reset", { token, newPassword: password });
  if (result.response.ok) {
    form.classList.add("hidden");
    status.textContent = "パスワードを変更しました。";
    loginLink.classList.remove("hidden");
  } else {
    status.textContent = errorMessage(result.data.error);
    button.disabled = false;
  }
});
