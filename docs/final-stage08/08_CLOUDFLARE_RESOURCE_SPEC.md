# Cloudflare resourceと設定仕様

## 1. 必須resource

| resource | production | staging |
|---|---|---|
| Worker | 既存production Worker | 別Worker |
| DB | 既存legacy DB | 必要なら別DB |
| DB_V2 | production正本 | 完全に別のD1 |
| Queue | production AI queue | 別Queue |
| Durable Object | production namespace | staging Worker側 |
| Email Service | production送信domain | test senderまたはstaging制限 |
| Turnstile | production widget | testまたはstaging widget |
| Rate Limiting | 4個の固有namespace | productionと分離 |

stagingからproduction DB。Queue。secretを共有しない。

## 2. 必須binding

- `DB`
- `DB_V2`
- `ASSETS`
- `COMMENT_ROOM`
- `EMAIL`
- `AI`
- `AI_JOBS_QUEUE`
- `AUTH_LOGIN_IP_LIMITER`
- `AUTH_LOGIN_ACCOUNT_LIMITER`
- `PUBLIC_COMMENT_RATE_LIMITER`
- `AUTH_PUBLIC_EMAIL_LIMITER`

## 3. 必須vars

- `APP_ENV=production`
- `AUTH_V2_ENABLED=1`
- `EMAIL_AUTH_REQUIRED=0`または`1`
- `AUTH_ORIGIN`
- `PUBLIC_ORIGIN`
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_REPLY_TO`
- `TURNSTILE_SITE_KEY`
- AI model vars
- `AI_TIMEOUT_MS`

## 4. 必須secret

- `AUTH_RATE_LIMIT_PEPPER`
- `PUBLIC_RATE_LIMIT_PEPPER`
- `TURNSTILE_SECRET_KEY`

AI Gatewayを使う場合はGateway IDをsecretではなく設定値として扱う。
外部provider keyを導入する場合は必ずsecretにする。

## 5. Rate Limiting template

```toml
[[ratelimits]]
name = "AUTH_LOGIN_IP_LIMITER"
namespace_id = "<UNIQUE_POSITIVE_INTEGER>"
simple = {{ limit = 20, period = 60 }}

[[ratelimits]]
name = "AUTH_LOGIN_ACCOUNT_LIMITER"
namespace_id = "<DIFFERENT_POSITIVE_INTEGER>"
simple = {{ limit = 10, period = 60 }}

[[ratelimits]]
name = "PUBLIC_COMMENT_RATE_LIMITER"
namespace_id = "<DIFFERENT_POSITIVE_INTEGER>"
simple = {{ limit = 30, period = 60 }}

[[ratelimits]]
name = "AUTH_PUBLIC_EMAIL_LIMITER"
namespace_id = "<DIFFERENT_POSITIVE_INTEGER>"
simple = {{ limit = 30, period = 60 }}
```

同じnamespace IDを使うとcounterを共有する。
本システムでは四つすべてを分離する。

## 6. Queue設定

現行設定:

```toml
[[queues.producers]]
binding = "AI_JOBS_QUEUE"
queue = "cpcv-ai-jobs"

[[queues.consumers]]
queue = "cpcv-ai-jobs"
max_batch_size = 5
max_batch_timeout = 5
max_retries = 3
```

Queueはat-least-once deliveryである。
D1 job claimを必須とする。
DLQは現行Stage 8の必須resourceではない。
導入する場合は別stageで設計。試験してから追加する。

## 7. Email Service

- sending domainをonboardする。
- SPF。DKIM。DMARCを確認する。
- `send_email` bindingを設定する。
- senderを可能な限りbinding側で制限する。
- production senderとreply-toをvarsへ設定する。
- delivery logとmetricsを確認する。

## 8. Turnstile

- production originに対応するsite keyを作る。
- secret keyをWorker secretへ設定する。
- Siteverifyをserverで実行する。
- tokenは5分。一回限りである。

## 9. Cron

現行cronはUTC `17 3 * * *`である。
expired token。retention。stale AI job。Stage 8 data cleanupを行う。

## 10. 未設定のままdeployしてはいけない項目

- `DB_V2.database_id`
- 4個のrate limit namespace ID
- production email vars
- production Turnstile site key
- 3個のsecret
- production Queue存在
- Email sending domain
- active Owner
