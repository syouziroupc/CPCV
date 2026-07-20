import { api, configureTurnstile, errorMessage } from "./auth-public.js";
const form = document.getElementById("signupForm");
const button = document.getElementById("submitButton");
const status = document.getElementById("status");
let turnstileToken = "";
let challenge;
try {
  challenge = await configureTurnstile(document.getElementById("turnstile"), (value) => { turnstileToken = value; });
} catch (error) {
  button.disabled = true;
  status.textContent = errorMessage(error?.message || "TURNSTILE_NOT_CONFIGURED");
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = "送信しています。";
  const { response, data } = await api("/api/auth/registration/request", {
    email: document.getElementById("email").value,
    displayName: document.getElementById("displayName").value,
    organizationName: document.getElementById("organizationName").value,
    password: document.getElementById("password").value,
    turnstileToken
  });
  if (response.status === 202) {
    form.reset();
    status.textContent = "確認メールを送信しました。メール内のリンクを開いてください。";
  } else {
    status.textContent = errorMessage(data.error);
    challenge?.reset();
    button.disabled = false;
  }
});
