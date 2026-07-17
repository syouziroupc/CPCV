# Staging受入試験

productionと完全に分離したresourceで実施します。release commitを記録します。

## 基盤

- Worker originがstaging専用
- DB_V2がstaging専用
- Queueがstaging専用
- Rate Limiting namespaceがstaging専用
- Email senderとTurnstile hostnameがstaging条件に一致
- `npm run verify:deployment <staging config>`相当が成功
- Remote migration `0001`〜`0017`が記録済み
- Stage 8.2 trigger 42本が存在
- foreign key 0件。quick check `ok`

## 認証

- Owner login
- invalid loginのIPとaccount制限
- limiter障害時503
- CSRF発行上限8件
- logout競合で虚偽auditなし
- password変更後に新sessionだけ有効
- email verification。reset。invitation。email change
- email delivery attemptがpendingへ残らない

## commentとRealtime

- public codeの大小文字差でparticipant Cookieが維持される
- participantを跨ぐidempotency keyで情報が漏れない
- 期限切れcommentが一覧。CSV。snapshotへ出ない
- ticket一回消費
- catch-up。reset。sequence gap
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

- networkへPDF bytes。filename。page textが出ない
- 同一PDF bindがidempotent
- PDF切替失敗時に孤児snapshotを残さない
- page更新競合の敗者がacceptedにならない
- session終了後にunderstandingを保存できない
- 切断後の滞在時間を加算しない
- 2人以下の内訳を抑制
- snapshot checksum
- CSVにparticipant ID。nickname。comment textがない

## 記録

全項目の結果。実行者。日時。timezone。commit。deployment IDを保存します。記録fileのSHA-256を計算します。一件でも失敗した場合はproductionへ進みません。
