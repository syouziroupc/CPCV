# Staging受入試験

productionと完全に分離したresourceで実施します。同じrelease commitを使います。本書の試験項目は44件です。

canonical staging configはsource外に置きます。Wrangler commandにはsource rootへmaterializeした完全一致copyを使います。

```bash
STAGING_CONFIG_SHA256=$(sha256sum /absolute/path/wrangler.staging.toml | cut -d' ' -f1)
node scripts/materialize-staging-config.mjs /absolute/path/wrangler.staging.toml --expected-sha256 "$STAGING_CONFIG_SHA256"
node scripts/verify-deployment-config.mjs .cpcv-staging.wrangler.toml
node scripts/verify-environment-separation.mjs wrangler.toml .cpcv-staging.wrangler.toml
node scripts/verify-ai-readiness.mjs --config .cpcv-staging.wrangler.toml
npx wrangler deploy --dry-run --config .cpcv-staging.wrangler.toml
```

## 事前検査

- Worker originがstaging専用
- legacy DBとDB_V2がstaging専用
- Queueがstaging専用
- Rate Limiting namespace 4個がstaging専用
- Email senderとTurnstile hostnameがstaging条件に一致
- migration `0001`〜`0017`が記録済み
- Stage 8.2 trigger 42本が存在
- foreign key違反0件
- quick check `ok`

## 認証

- Owner login
- invalid loginのIP制限
- invalid loginのaccount制限
- limiter障害時503
- CSRF発行上限8件
- logout競合で虚偽auditなし
- password変更後に新sessionだけ有効
- email verification
- password reset
- invitation
- email change
- email delivery attemptがpendingへ残らない

## commentとRealtime

- public codeの大小文字差でparticipant Cookieが維持される
- participantを跨ぐidempotency keyで情報が漏れない
- 期限切れcommentが一覧。CSV。snapshotへ出ない
- ticketは一回だけ消費される
- catch-up。reset。sequence gapが正しい
- auth失効後にWebSocketが5分以内に閉じる

## moderation。filter。AI

- moderation singleとbulk
- 期限切れcommentをmoderationできない
- 101番目以降のreject語がrejectになる
- term上限2000件をDBが拒否する
- filter mutationとauditが同時確定する
- old AI workerが新結果を上書きしない
- 3回目停止jobがfailedへ回収される
- 期限切れcomment本文がAIへ送信されない

## PDF

- networkへPDF bytes。filename。page text。画像。注釈が出ない
- 同一PDF bindがidempotent
- PDF切替失敗時に孤児snapshotを残さない
- page更新競合の敗者がacceptedにならない
- session終了後にunderstandingを保存できない
- 切断後の滞在時間を加算しない
- 2人以下の内訳を抑制する
- snapshot checksumが一致する
- CSVにparticipant ID。nickname。comment textがない

## 証跡

`templates/STAGING_ACCEPTANCE_RECORD_TEMPLATE.txt`を使います。44項目の結果。実行者。UTC日時。commit。deployment IDを記録します。受入試験書のSHA-256も記録します。

```bash
sha256sum docs/final-stage08/10_STAGING_ACCEPTANCE_TEST.md
sha256sum /absolute/path/wrangler.staging.toml
sha256sum /absolute/path/staging-acceptance-record.txt
node scripts/verify-staging-evidence.mjs /absolute/path/staging-acceptance-record.txt \
  --commit <EXACT_COMMIT> \
  --deployment <STAGING_DEPLOYMENT_ID> \
  --config-sha256 <STAGING_CONFIG_SHA256>
rm -f .cpcv-staging.wrangler.toml
```

一件でも失敗した場合は`result=PASSED`を記録しません。productionへ進みません。
