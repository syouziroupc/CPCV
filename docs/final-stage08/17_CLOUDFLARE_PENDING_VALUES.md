# Cloudflare反映前の未設定項目

現行sourceのlocal検査とは別です。次は外部Cloudflare accountでしか確定できません。

## production blocker

1. `DB_V2.database_id`
2. `AUTH_LOGIN_IP_LIMITER.namespace_id`
3. `AUTH_LOGIN_ACCOUNT_LIMITER.namespace_id`
4. `PUBLIC_COMMENT_RATE_LIMITER.namespace_id`
5. `AUTH_PUBLIC_EMAIL_LIMITER.namespace_id`
6. `AUTH_EMAIL_FROM`
7. `AUTH_EMAIL_REPLY_TO`
8. `TURNSTILE_SITE_KEY`
9. `EMAIL.allowed_sender_addresses`
10. `AUTH_RATE_LIMIT_PEPPER` secret
11. `PUBLIC_RATE_LIMIT_PEPPER` secret
12. `TURNSTILE_SECRET_KEY` secret
13. Email Service sending domain onboarding確認
14. 任意受信者送信に必要なaccount plan確認

## staging blocker

- staging Worker
- staging legacy DBとDB_V2
- staging Queue
- staging Rate Limiting namespace 4個
- staging EmailとTurnstile設定
- staging origin
- staging acceptance record

## 現行verify結果

実値未設定の`wrangler.toml`に対する`npm run verify:deployment`は9件で失敗します。

- DB_V2 UUID
- Rate Limiting binding 4個
- AUTH_EMAIL_FROM
- AUTH_EMAIL_REPLY_TO
- TURNSTILE_SITE_KEY
- EMAIL sender allowlist

secretとstagingはfileだけでは完全検証できません。Codexは失敗を消すために架空値を入れません。
