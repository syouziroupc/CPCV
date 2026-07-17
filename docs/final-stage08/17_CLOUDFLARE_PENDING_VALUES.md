# Cloudflare反映前の未設定項目

この文書は現行`wrangler.toml`とdry-run出力を基準にする。
Codexは次を実値で設定するまでproduction deployを行わない。

## 必須blocker

1. `DB_V2.database_id`が未設定
2. `AUTH_LOGIN_IP_LIMITER`が未設定
3. `AUTH_LOGIN_ACCOUNT_LIMITER`が未設定
4. `PUBLIC_COMMENT_RATE_LIMITER`が未設定
5. `AUTH_PUBLIC_EMAIL_LIMITER`が未設定
6. `AUTH_EMAIL_FROM`が未設定
7. `AUTH_EMAIL_REPLY_TO`が未設定
8. `TURNSTILE_SITE_KEY`が未設定
9. `AUTH_RATE_LIMIT_PEPPER` secretが未設定
10. `PUBLIC_RATE_LIMIT_PEPPER` secretが未設定
11. `TURNSTILE_SECRET_KEY` secretが未設定
12. staging用Worker。DB_V2。Queue。originが未定
13. Email Service sending domainのonboarding確認が必要
14. `EMAIL` bindingは現在unrestrictedとしてdry-runへ表示される

## 設定済み

- Worker name
- legacy `DB` UUID
- `DB_V2` database nameとmigration directory
- Durable Object binding
- Static Assets
- Workers AI binding
- AI model vars
- production AI Queue名
- Cron Trigger
- production origin
- `EMAIL_AUTH_REQUIRED=0`

## deploy禁止条件

`npm run verify:deployment`が成功しない状態でdeployしない。
Email bindingは可能な限りsender制限を追加する。
四つのrate limit bindingは異なるnamespace IDを使う。
未確認Ownerがいる場合は`EMAIL_AUTH_REQUIRED=0`を維持する。
