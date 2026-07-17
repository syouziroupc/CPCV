# Release process

## 原則

通常のpushとPRではremote D1とWorkerを変更しない。本番反映は手動workflowだけで行う。対象commitは40文字SHAへ固定する。

## CI

- `npm ci`
- static。project。PDF link検査
- Stage 2からStage 6.5の全試験
- Wrangler dry-run
- npm audit

CIへCloudflare credentialを渡さない。

## Production secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `AUTH_RATE_LIMIT_PEPPER`
- `PUBLIC_RATE_LIMIT_PEPPER`
- `TURNSTILE_SECRET_KEY`

## Production workflow

1. exact SHA確認
2. checkout SHA一致確認
3. dependency再構築
4. production config検査
5. Stage 6.5全local検査
6. legacy D1 migration
7. DB_V2 migration
8. remote DB integrity検査
9. email cutover readiness検査
10. authentication secrets設定
11. Worker deploy
12. production smoke test

## Rollback

D1 migrationは追加型を基本とする。Worker rollbackとD1 rollbackは別管理である。メール認証の緊急rollbackは`EMAIL_AUTH_REQUIRED=0`へ戻す。
