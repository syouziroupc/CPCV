from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "public/assets/confirm-email-change.js",
    '''} else {
  const { response, data } = await api("/api/auth/email-change/confirm", { token });
  if (response.ok) {
    status.textContent = "メールアドレスを確認しました。";
    detail.textContent = `${data.email} でログインしてください。安全のため全端末からログアウトしました。`;
    loginLink.classList.remove("hidden");
  } else {
    status.textContent = errorMessage(data.error);
  }
}
''',
    '''} else {
  try {
    const { response, data } = await api("/api/auth/email-change/confirm", { token });
    if (response.ok) {
      status.textContent = "メールアドレスを確認しました。";
      detail.textContent = `${data.email} でログインしてください。安全のため全端末からログアウトしました。`;
      loginLink.classList.remove("hidden");
    } else {
      status.textContent = errorMessage(data.error);
    }
  } catch (error) {
    status.textContent = errorMessage(error?.code || error?.message || "NETWORK_ERROR");
  }
}
'''
)

replace_once(
    "public/assets/verify-email.js",
    '''} else {
  const result = await api("/api/auth/registration/verify", { token });
  if (result.response.status === 201) {
    status.textContent = "登録が完了しました。";
    link.classList.remove("hidden");
  } else {
    status.textContent = errorMessage(result.data.error);
  }
}
''',
    '''} else {
  try {
    const result = await api("/api/auth/registration/verify", { token });
    if (result.response.status === 201) {
      status.textContent = "登録が完了しました。";
      link.classList.remove("hidden");
    } else {
      status.textContent = errorMessage(result.data.error);
    }
  } catch (error) {
    status.textContent = errorMessage(error?.code || error?.message || "NETWORK_ERROR");
  }
}
'''
)

replace_once(
    "public/assets/reset-password.js",
    '''  button.disabled = true;
  const result = await api("/api/auth/password/reset", { token, newPassword: password });
  if (result.response.ok) {
    form.classList.add("hidden");
    status.textContent = "パスワードを変更しました。";
    loginLink.classList.remove("hidden");
  } else {
    status.textContent = errorMessage(result.data.error);
    button.disabled = false;
  }
''',
    '''  button.disabled = true;
  status.textContent = "変更しています。";
  try {
    const result = await api("/api/auth/password/reset", { token, newPassword: password });
    if (result.response.ok) {
      form.classList.add("hidden");
      status.textContent = "パスワードを変更しました。";
      loginLink.classList.remove("hidden");
    } else {
      status.textContent = errorMessage(result.data.error);
      button.disabled = false;
    }
  } catch (error) {
    status.textContent = errorMessage(error?.code || error?.message || "NETWORK_ERROR");
    button.disabled = false;
  }
'''
)

# Background email failures must remain asynchronous, but never disappear from observability.
replace_once(
    "src/routes/email-auth.js",
    '''function schedule(ctx, promise) {
  const guarded = Promise.resolve(promise).catch(() => undefined);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(guarded);
  else return guarded;
}
''',
    '''function schedule(ctx, promise) {
  const guarded = Promise.resolve(promise).catch((error) => {
    console.error("Background email task failed", safeErrorCode(error));
  });
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(guarded);
  else return guarded;
}
'''
)
replace_once(
    "src/routes/account-lifecycle.js",
    '''function schedule(ctx, promise) {
  const guarded = Promise.resolve(promise).catch(() => undefined);
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(guarded);
  else return guarded;
}
''',
    '''function schedule(ctx, promise) {
  const guarded = Promise.resolve(promise).catch((error) => {
    console.error("Background account email task failed", String(error?.code || error?.name || "ERROR").slice(0, 80));
  });
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(guarded);
  else return guarded;
}
'''
)

# Strengthen the alarm regression itself: compare against the original late alarm, not the mutated value.
replace_once(
    "scripts/test-realtime-v2.mjs",
    '''  currentAlarm = Date.now() + 600_000;
  await alarmRoom.scheduleAuthRevalidation();
  check("a missing or excessively late auth alarm is moved earlier", alarmWrites.length === 1 && alarmWrites[0] < currentAlarm + 1, alarmWrites);
''',
    '''  currentAlarm = Date.now() + 600_000;
  const lateAlarm = currentAlarm;
  await alarmRoom.scheduleAuthRevalidation();
  check("a missing or excessively late auth alarm is moved earlier", alarmWrites.length === 1 && alarmWrites[0] < lateAlarm, alarmWrites);
'''
)

replace_once(
    "scripts/test-system-hardening.mjs",
    '''  const smoke = readFileSync(new URL("./smoke-production.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(privateRoute, /void scheduleAiForComment/);
''',
    '''  const smoke = readFileSync(new URL("./smoke-production.mjs", import.meta.url), "utf8");
  const confirmEmail = readFileSync(new URL("../public/assets/confirm-email-change.js", import.meta.url), "utf8");
  const verifyEmail = readFileSync(new URL("../public/assets/verify-email.js", import.meta.url), "utf8");
  const resetPassword = readFileSync(new URL("../public/assets/reset-password.js", import.meta.url), "utf8");
  const emailAuth = readFileSync(new URL("../src/routes/email-auth.js", import.meta.url), "utf8");
  const lifecycle = readFileSync(new URL("../src/routes/account-lifecycle.js", import.meta.url), "utf8");

  assert.doesNotMatch(privateRoute, /void scheduleAiForComment/);
'''
)
replace_once(
    "scripts/test-system-hardening.mjs",
    '''  assert.match(account, /error\?\.status === 401/);
  assert.equal((smoke.match(/AbortSignal\.timeout\(10_000\)/g) || []).length, 2);
}
''',
    '''  assert.match(account, /error\?\.status === 401/);
  assert.equal((smoke.match(/AbortSignal\.timeout\(10_000\)/g) || []).length, 2);
  for (const source of [confirmEmail, verifyEmail, resetPassword]) {
    assert.match(source, /catch \(error\)/, "token/action pages must handle network exceptions");
    assert.match(source, /NETWORK_ERROR/);
  }
  assert.match(resetPassword, /button\.disabled = false/);
  assert.doesNotMatch(emailAuth, /catch\(\(\) => undefined\)/);
  assert.doesNotMatch(lifecycle, /catch\(\(\) => undefined\)/);
  assert.match(emailAuth, /Background email task failed/);
  assert.match(lifecycle, /Background account email task failed/);
}
'''
)

print("final hardening patches applied")
