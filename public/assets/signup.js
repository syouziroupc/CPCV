import { api, configureTurnstile, errorMessage } from "./auth-public.js";

const form = document.getElementById("signupForm");
const button = document.getElementById("submitButton");
const status = document.getElementById("status");
const email = document.getElementById("email");
const password = document.getElementById("password");
const passwordHint = document.getElementById("passwordHint");
let turnstileToken = "";
let challenge;

function validatePassword() {
  const value = password.value;
  const length = Array.from(value).length;
  let message = "";

  if (length < 8) message = "パスワードは8文字以上にしてください。";
  else if (length > 128) message = "パスワードは128文字以下にしてください。";
  else if (value === email.value) message = "メールアドレスと異なるパスワードを設定してください。";

  password.setCustomValidity(message);
  if (!value) passwordHint.textContent = "8文字以上。128文字以下。";
  else if (message) passwordHint.textContent = message;
  else passwordHint.textContent = "パスワード要件を満たしています。";
  return !message;
}

password.addEventListener("input", validatePassword);
email.addEventListener("input", validatePassword);

try {
  challenge = await configureTurnstile(document.getElementById("turnstile"), (value) => { turnstileToken = value; });
} catch (error) {
  button.disabled = true;
  status.textContent = errorMessage(error?.message || "TURNSTILE_NOT_CONFIGURED");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validatePassword() || !form.reportValidity()) return;

  button.disabled = true;
  status.textContent = "送信しています。";
  const { response, data } = await api("/api/auth/registration/request", {
    email: email.value,
    displayName: document.getElementById("displayName").value,
    organizationName: document.getElementById("organizationName").value,
    password: password.value,
    turnstileToken
  });
  if (response.status === 202) {
    form.reset();
    validatePassword();
    status.textContent = "確認メールを送信しました。メール内のリンクを開いてください。";
  } else {
    status.textContent = errorMessage(data.error);
    challenge?.reset();
    button.disabled = false;
  }
});
