# CPCV Stage 6.5-A Cloudflare設定

## Email Service

`wrangler.toml`:

```toml
[[send_email]]
name = "EMAIL"
```

必要な変数:

```text
AUTH_EMAIL_FROM
AUTH_EMAIL_REPLY_TO
AUTH_ORIGIN
```

`AUTH_EMAIL_FROM`はCloudflare Email Serviceでonboardingした送信domainを使用する。

## Turnstile

public variable:

```text
TURNSTILE_SITE_KEY
```

secret:

```text
TURNSTILE_SECRET_KEY
```

本番で空値を使用しない。

## D1 exact rate limit

secret:

```text
AUTH_RATE_LIMIT_PEPPER
```

32 byte以上のランダム値を使用する。

## Edge rate limit

任意binding:

```text
AUTH_PUBLIC_EMAIL_LIMITER
```

D1 exact counterが正本である。Edge limiterだけを厳密制限として扱わない。

## DB_V2

1. Remote `DB_V2`を確定する。
2. `0008_email_auth.sql`をstagingへ適用する。
3. `foreign_key_check`と`quick_check`を実行する。
4. 既存Ownerのメール移行経路を確認する。
5. 実メールとTurnstileをstagingで確認する。

## 切替条件

次が完了するまで維持する。

```text
EMAIL_AUTH_REQUIRED=0
```

切替前条件:

- active Owner全員に確認済みメールがある
- 送信domain設定済み
- SPF、DKIM、DMARC確認済み
- Turnstile実key設定済み
- registration、login、resetの実到達試験成功
- rollback手順確認済み

条件を満たした後だけ次へ変更する。

```text
EMAIL_AUTH_REQUIRED=1
```
