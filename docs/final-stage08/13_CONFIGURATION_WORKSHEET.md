# Cloudflare実値記入表

空欄を推測しません。DashboardまたはWrangler出力から転記します。secret値は記載しません。

## AccountとWorker

| 項目 | 実値 |
|---|---|
| account ID | `<未記入>` |
| production Worker | `class-pdf-comment-viewer-v01` |
| production origin | `https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev` |
| staging Worker | `<未記入>` |
| staging origin | `<未記入>` |

## D1

| 用途 | name | UUID |
|---|---|---|
| legacy production | `class_comment_db` | `f11457fa-27af-468d-94cc-6cdf1ae814e4` |
| production DB_V2 | `class_comment_db_v2` | `<未記入>` |
| staging legacy DB | `<未記入>` | `<未記入>` |
| staging DB_V2 | `<未記入>` | `<未記入>` |

4個のUUIDは重複させません。

## Queue

| 用途 | name |
|---|---|
| production | `cpcv-ai-jobs` |
| staging | `<未記入>` |

## Rate Limiting

| environment | binding | namespace ID | limit | period |
|---|---|---|---:|---:|
| production | AUTH_LOGIN_IP_LIMITER | `<未記入>` | 20 | 60 |
| production | AUTH_LOGIN_ACCOUNT_LIMITER | `<未記入>` | 10 | 60 |
| production | PUBLIC_COMMENT_RATE_LIMITER | `<未記入>` | 30 | 60 |
| production | AUTH_PUBLIC_EMAIL_LIMITER | `<未記入>` | 30 | 60 |
| staging | AUTH_LOGIN_IP_LIMITER | `<未記入>` | 20 | 60 |
| staging | AUTH_LOGIN_ACCOUNT_LIMITER | `<未記入>` | 10 | 60 |
| staging | PUBLIC_COMMENT_RATE_LIMITER | `<未記入>` | 30 | 60 |
| staging | AUTH_PUBLIC_EMAIL_LIMITER | `<未記入>` | 30 | 60 |

8個のnamespace IDを重複させません。

## Email

| 項目 | production | staging |
|---|---|---|
| sending domain | `<未記入>` | `<未記入>` |
| domain onboarding | `<未確認>` | `<未確認>` |
| arbitrary-recipient plan eligibility | `<未確認>` | `<未確認>` |
| AUTH_EMAIL_FROM | `<未記入>` | `<未記入>` |
| AUTH_EMAIL_REPLY_TO | `<未記入>` | `<未記入>` |
| allowed_sender_addresses | `<未記入>` | `<未記入>` |
| SPF。DKIM。DMARC | `<未確認>` | `<未確認>` |

## Turnstile

| 項目 | 実値 |
|---|---|
| production site key | `<未記入>` |
| production hostname | `<未記入>` |
| staging site key | `<未記入>` |
| staging hostname | `<未記入>` |
| production secret | Worker secret。記載しない |
| staging secret | Worker secret。記載しない |

## Secret status

| secret | production | staging |
|---|---|---|
| AUTH_RATE_LIMIT_PEPPER | `<未設定>` | `<未設定>` |
| PUBLIC_RATE_LIMIT_PEPPER | `<未設定>` | `<未設定>` |
| TURNSTILE_SECRET_KEY | `<未設定>` | `<未設定>` |

## Staging evidence

| 項目 | 実値 |
|---|---|
| exact commit | `<未記入>` |
| deployment/version ID | `<未記入>` |
| external config path | `<未記入>` |
| config SHA-256 | `<未記入>` |
| acceptance record path | `<未記入>` |
| acceptance record SHA-256 | `<未記入>` |
| evidence verifier result | `<未実行>` |
| test data cleanup | `<未確認>` |

## Production record

| 項目 | 実値 |
|---|---|
| deploy前D1 bookmark | `<未記入>` |
| rollback Worker deployment | `<未記入>` |
| production deployment ID | `<未記入>` |
| production version ID | `<未記入>` |
| migration output path | `<未記入>` |
| smoke record SHA-256 | `<未記入>` |
| deployment record manifest | `<未記入>` |
| operatorとUTC日時 | `<未記入>` |
