import { api, configureTurnstile, errorMessage } from "./auth-public.js";

const form = document.getElementById("forgotForm");
const button = document.getElementById("submitButton");
const status = document.getElementById("status");
let turnstileToken = "";
let challenge;

try {
  challenge = await configureTurnstile(document.getElementById("turnstile"), (value) => {
    turnstileToken = value;
    button.disabled = !value;
    if (value) status.textContent = "";
  });
} catch (error) {
  button.disabled = true;
  status.textContent = errorMessage(error?.message || "TURNSTILE_NOT_CONFIGURED");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!turnstileToken) {
    button.disabled = true;
    status.textContent = errorMessage("TURNSTILE_REQUIRED");
    return;
  }

  button.disabled = true;
  let response;
  let data;
  try {
    ({ response, data } = await api("/api/auth/password/reset/request", {
      email: document.getElementById("email").value,
      turnstileToken
    }));
  } catch {
    status.textContent = errorMessage("NETWORK_ERROR");
    challenge?.reset();
    return;
  }

  if (response.status === 202) {
    status.textContent = "登録済みの場合は再設定メールを送信しました。";
  } else {
    status.textContent = errorMessage(data.error);
    challenge?.reset();
  }
});
