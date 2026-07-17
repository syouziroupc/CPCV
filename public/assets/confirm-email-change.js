import { api, errorMessage, tokenFromPath } from "./auth-public.js";
const status = document.getElementById("status");
const detail = document.getElementById("detail");
const loginLink = document.getElementById("loginLink");
const token = tokenFromPath("/confirm-email-change/");
if (!token) {
  status.textContent = errorMessage("EMAIL_CHANGE_TOKEN_INVALID");
} else {
  const { response, data } = await api("/api/auth/email-change/confirm", { token });
  if (response.ok) {
    status.textContent = "メールアドレスを確認しました。";
    detail.textContent = `${data.email} でログインしてください。安全のため全端末からログアウトしました。`;
    loginLink.classList.remove("hidden");
  } else {
    status.textContent = errorMessage(data.error);
  }
}
