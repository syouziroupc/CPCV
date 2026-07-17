# Stage 6.5 Cloudflare設定

## 1. D1

`DB_V2`の実UUIDを設定する。

```toml
[[d1_databases]]
binding = "DB_V2"
database_name = "class_comment_db_v2"
database_id = "REAL-UUID"
migrations_dir = "migrations-v2"
```

`0001`から`0009`まで適用する。

## 2. Email Service

```toml
[[send_email]]
name = "EMAIL"
```

`[vars]`へ実値を設定する。

```toml
AUTH_EMAIL_FROM = "noreply@ONBOARDED-DOMAIN"
AUTH_EMAIL_REPLY_TO = "support@ONBOARDED-DOMAIN"
```

送信domainのSPF。DKIM。DMARCを確認する。

## 3. Turnstile

public variable:

```toml
TURNSTILE_SITE_KEY = "REAL-SITE-KEY"
```

Worker secret:

```text
TURNSTILE_SECRET_KEY
```

## 4. Rate Limiting

全namespace IDを別値にする。

```toml
[[ratelimits]]
name = "AUTH_LOGIN_IP_LIMITER"
namespace_id = "REAL-1"
[ratelimits.simple]
limit = 20
period = 60

[[ratelimits]]
name = "AUTH_LOGIN_ACCOUNT_LIMITER"
namespace_id = "REAL-2"
[ratelimits.simple]
limit = 10
period = 60

[[ratelimits]]
name = "PUBLIC_COMMENT_RATE_LIMITER"
namespace_id = "REAL-3"
[ratelimits.simple]
limit = 30
period = 60

[[ratelimits]]
name = "AUTH_PUBLIC_EMAIL_LIMITER"
namespace_id = "REAL-4"
[ratelimits.simple]
limit = 30
period = 60
```

Worker secret:

- `AUTH_RATE_LIMIT_PEPPER`
- `PUBLIC_RATE_LIMIT_PEPPER`
- `TURNSTILE_SECRET_KEY`

## 5. 移行

1. `EMAIL_AUTH_REQUIRED=0`
2. remote migration適用
3. 既存Ownerが旧login IDでログイン
4. `/account`からメールを登録して確認
5. 全active Ownerの確認を完了
6. `EMAIL_AUTH_REQUIRED=1`
7. `npm run verify:email-auth-ready`
8. staging実動確認
9. production deploy

## 6. 検査

```bash
npm run verify:deployment
npm run check:stage06-5
npm run deploy:dry-run
node scripts/verify-remote-d1.mjs
npm run verify:email-auth-ready
npm audit
```
