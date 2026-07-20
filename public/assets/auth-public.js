export async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({ ok: false, error: "INVALID_RESPONSE" }));
  return { response, data };
}

export async function configureTurnstile(container, onToken) {
  const response = await fetch("/api/auth/config", { credentials: "same-origin", cache: "no-store" });
  const config = await response.json();
  const siteKey = String(config.turnstileSiteKey || "");
  if (!siteKey) {
    if (config.turnstileTestBypass) {
      onToken("local-bypass");
      container.textContent = "ローカル検証モード";
      container.classList.add("muted");
      return { reset() { onToken("local-bypass"); } };
    }
    container.textContent = "セキュリティ確認を利用できません。";
    container.classList.add("muted");
    throw new Error("TURNSTILE_NOT_CONFIGURED");
  }
  try {
    await waitForTurnstile();
  } catch {
    throw new Error("TURNSTILE_SCRIPT_UNAVAILABLE");
  }
  let widgetId;
  try {
    widgetId = globalThis.turnstile.render(container, {
      sitekey: siteKey,
      callback: onToken,
      "error-callback": () => onToken(""),
      "expired-callback": () => onToken(""),
      "timeout-callback": () => onToken("")
    });
  } catch {
    throw new Error("TURNSTILE_RENDER_FAILED");
  }
  return {
    reset() {
      onToken("");
      try { globalThis.turnstile.reset(widgetId); } catch {}
    }
  };
}

export function errorMessage(code) {
  if (code === "TURNSTILE_SCRIPT_UNAVAILABLE" || code === "TURNSTILE_RENDER_FAILED") {
    return "セキュリティ確認を読み込めません。広告ブロッカーを無効にするか、ネットワーク設定を確認してから再試行してください。";
  }
  if (code === "NETWORK_ERROR") {
    return "通信に失敗しました。ネットワーク接続を確認してから再試行してください。";
  }
  return ({
    EMAIL_INVALID: "メールアドレスを確認してください。",
    DISPLAY_NAME_INVALID: "表示名を確認してください。",
    ORGANIZATION_NAME_INVALID: "組織名を確認してください。",
    PASSWORD_POLICY_FAILED: "パスワードは8文字以上128文字以下にしてください。",
    TURNSTILE_REQUIRED: "確認操作を完了してください。",
    TURNSTILE_INVALID: "確認操作が失効しました。もう一度実行してください。",
    TURNSTILE_UNAVAILABLE: "確認サービスへ接続できません。時間を置いて再試行してください。",
    TURNSTILE_NOT_CONFIGURED: "セキュリティ確認が設定されていません。",
    RATE_LIMITED: "要求回数が上限に達しました。時間を置いて再試行してください。",
    REGISTRATION_TOKEN_INVALID: "確認リンクは無効です。",
    REGISTRATION_TOKEN_EXPIRED: "確認リンクの有効期限が切れています。",
    REGISTRATION_ALREADY_COMPLETED: "この登録は完了済みです。",
    RESET_TOKEN_INVALID: "再設定リンクは無効です。",
    RESET_TOKEN_EXPIRED: "再設定リンクの有効期限が切れています。",
    INVITATION_INVALID: "招待リンクは無効です。",
    INVITATION_EXPIRED: "招待リンクの有効期限が切れています。",
    INVITATION_LOGIN_REQUIRED: "既存アカウントでログインしてください。",
    INVITATION_EMAIL_MISMATCH: "招待先とログイン中のメールアドレスが一致しません。",
    INVITATION_FORM_INVALID: "入力内容を確認してください。",
    MEMBERSHIP_ALREADY_EXISTS: "この組織にはすでに参加しています。",
    MEMBER_LIMIT_REACHED: "組織のメンバー上限に達しています。",
    EMAIL_CHANGE_TOKEN_INVALID: "メール確認リンクは無効です。",
    EMAIL_CHANGE_TOKEN_EXPIRED: "メール確認リンクの有効期限が切れています。",
    EMAIL_UNAVAILABLE: "このメールアドレスは使用できません。",
    EMAIL_UNCHANGED: "現在と同じメールアドレスです。",
    REGISTRATION_PASSWORD_HASH_UNAVAILABLE: "パスワードの安全な処理に失敗しました。しばらく待ってから再試行してください。",
    REGISTRATION_PERSISTENCE_UNAVAILABLE: "登録情報を保存できませんでした。しばらく待ってから再試行してください。",
    CURRENT_PASSWORD_INVALID: "現在のパスワードが正しくありません。",
    AUTH_INVALID: "メールアドレスまたはパスワードを確認してください。",
    ORGANIZATION_SELECTION_REQUIRED: "ログイン先組織を選択してください。"
  })[code] || "処理できませんでした。";
}

export function tokenFromPath(prefix) {
  const path = location.pathname;
  if (!path.startsWith(prefix)) return "";
  try { return decodeURIComponent(path.slice(prefix.length).split("/", 1)[0]); }
  catch { return ""; }
}

async function waitForTurnstile() {
  if (typeof globalThis.turnstile?.render === "function") return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      globalThis.removeEventListener("cpcv:turnstile-ready", onReady);
      reject(new Error("TURNSTILE_SCRIPT_UNAVAILABLE"));
    }, 30_000);
    const onReady = () => {
      clearTimeout(timeout);
      resolve();
    };
    globalThis.addEventListener("cpcv:turnstile-ready", onReady, { once: true });
  });
  if (typeof globalThis.turnstile?.render !== "function") {
    throw new Error("TURNSTILE_SCRIPT_UNAVAILABLE");
  }
}
