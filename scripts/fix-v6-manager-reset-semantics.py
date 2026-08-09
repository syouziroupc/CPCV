from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src" / "routes" / "account-lifecycle.js"
text = path.read_text(encoding="utf-8")
old = '''  const now = new Date();
  const nowIso = now.toISOString();
  const recentReset = await env.DB_V2.prepare(
    `SELECT id FROM password_reset_tokens
     WHERE user_id = ?1 AND email_snapshot = ?2 COLLATE NOCASE
       AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?3
       AND delivery_requested_at > ?4
     LIMIT 1`
  ).bind(target.user_id, target.email, nowIso,
    new Date(now.getTime() - 60_000).toISOString()).first();
  if (recentReset) return authJson(ACCEPTED, 202);
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  const rawToken = createToken();'''
new = '''  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();
  const rawToken = createToken();'''
if text.count(old) != 1:
    raise SystemExit(f"expected manager reset idempotency block once, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Explicit manager reset continues to rotate one-time tokens")
