import { api, errorMessage, tokenFromPath } from "./auth-public.js";
const status = document.getElementById("status");
const link = document.getElementById("continueLink");
const token = tokenFromPath("/verify-email/");
if (!token) {
  status.textContent = "確認リンクは無効です。";
} else {
  const result = await api("/api/auth/registration/verify", { token });
  if (result.response.status === 201) {
    status.textContent = "登録が完了しました。";
    link.classList.remove("hidden");
  } else {
    status.textContent = errorMessage(result.data.error);
  }
}
