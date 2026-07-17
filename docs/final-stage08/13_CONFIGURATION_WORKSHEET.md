# Cloudflare実値記入表

Codexは空欄を推測しない。
Cloudflare DashboardまたはWrangler outputから転記する。

## Account

| 項目 | 実値 |
|---|---|
| Cloudflare account ID | `<未記入>` |
| production Worker name | `class-pdf-comment-viewer-v01` |
| production origin | `https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev` |
| staging Worker name | `<未記入>` |
| staging origin | `<未記入>` |

## D1

| 項目 | name | UUID |
|---|---|---|
| legacy production DB | `class_comment_db` | `f11457fa-27af-468d-94cc-6cdf1ae814e4` |
| production DB_V2 | `class_comment_db_v2` | `<未記入>` |
| staging DB_V2 | `<未記入>` | `<未記入>` |

## Queue

| 項目 | name |
|---|---|
| production AI queue | `cpcv-ai-jobs` |
| staging AI queue | `<未記入>` |

## Rate Limiting

| binding | namespace ID | limit | period |
|---|---|---:|---:|
| AUTH_LOGIN_IP_LIMITER | `<未記入>` | 20 | 60 |
| AUTH_LOGIN_ACCOUNT_LIMITER | `<未記入>` | 10 | 60 |
| PUBLIC_COMMENT_RATE_LIMITER | `<未記入>` | 30 | 60 |
| AUTH_PUBLIC_EMAIL_LIMITER | `<未記入>` | 30 | 60 |

四つのnamespace IDは異なる値にする。

## Email

| 項目 | 実値 |
|---|---|
| onboarded domain | `<未記入>` |
| AUTH_EMAIL_FROM | `<未記入>` |
| AUTH_EMAIL_REPLY_TO | `<未記入>` |
| SPF | `<未確認>` |
| DKIM | `<未確認>` |
| DMARC | `<未確認>` |

## Turnstile

| 項目 | 実値 |
|---|---|
| site key | `<未記入>` |
| secret key | `Worker secretへ設定。文書へ記載しない` |
| allowed hostname | `<未記入>` |

## Secret

| secret | 状態 |
|---|---|
| AUTH_RATE_LIMIT_PEPPER | `<未設定>` |
| PUBLIC_RATE_LIMIT_PEPPER | `<未設定>` |
| TURNSTILE_SECRET_KEY | `<未設定>` |

## Deployment record

| 項目 | 実値 |
|---|---|
| deploy前D1 bookmark | `<未記入>` |
| staging version ID | `<未記入>` |
| production version ID | `<未記入>` |
| production deployment ID | `<未記入>` |
| migration日時 | `<未記入>` |
| deploy日時 | `<未記入>` |
| operator | `<未記入>` |
