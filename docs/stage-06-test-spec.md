# Stage 6 試験仕様

## DB・migration

- 追加table・index・trigger。
- foreign key check。
- quick check。
- migration再実行no-op。
- sequence unique制約。
- ticket hash unique制約。

## Ticket

- 60秒失効。
- 一回限り。
- 利用者越境拒否。
- 期限切れ拒否。
- 発行後のauth session失効を消費時に拒否。
- 発行後のmembership停止を消費時に拒否。
- 発行後の授業終了を消費時に拒否。

## Sequence・同期

- comment作成でsequence発行。
- settings、clear、moderationの連番。
- catch-up順序。
- duplicate排除。
- future sequenceのsnapshot reset。
- event pruning後のsnapshot reset。
- clear以前のcommentをsnapshotへ戻さない。

## Durable Object

- Hibernation API使用。
- attachment保存。
- ACK更新。
- 未送信sequenceへのACK拒否。
- 256 bytes超client frameを1009でclose。
- 同じeventを二重送信しない。
- auth失効socketを4001でclose。
- 80件超のauth session再検証。

## Edge rate limit

- HMAC keyへ生IPを含めない。
- productionのbinding・pepper不足を拒否。
- limiter拒否を429へ変換。

## Viewer

- ticket endpoint利用。
- LocalStorageはsequenceだけ。
- sequence gap検出。
- 指数backoff上限30秒。
- room終了と認証失効で停止。
- page-level横overflowなし。
- toolbar、comment、QRの重なりなし。

## 回帰

Stage 2、3-A、3-B、3-C、4、5の全試験を再実行する。旧認証、授業投影、コメント永続化、moderationの契約を維持する。

## 実Worker

- login。
- 授業作成。
- ticket取得。
- WebSocket sync。
- 公開投稿とsequence event。
- ticket再利用拒否。
- network切断。
- 切断中event。
- 再接続catch-up。
- clear watermark。
- room終了。
- scheduled handler。
