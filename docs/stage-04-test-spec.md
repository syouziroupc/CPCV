# CPCV Stage 4 試験仕様

## 1. Schema

- `participants`、`comments`、`comment_events`が作成される
- organization、session、participantの外部キーが有効
- idempotency keyが授業内で一意
- 生IP、User-Agent、端末指紋の列がない
- migration再実行がno-op
- `foreign_key_check`が0件
- `quick_check`が`ok`

## 2. 公開投稿

- 公開授業情報を取得できる
- 初回アクセスで授業単位のHttpOnly Cookieを発行する
- GETだけではparticipant rowを作らない
- 投稿成功時にHTTP 201と永続comment IDを返す
- 同じidempotency keyの再送はHTTP 200で既存commentを返す
- 再送を再broadcastしない
- 10秒以内の別投稿をHTTP 429で拒否する
- 投稿停止、終了、期限切れ授業を拒否する
- Durable Objectへの未検証直接投稿を拒否する

## 3. 入力

- NFKC正規化
- 制御文字とzero-width文字の除去
- 140 Unicode code points制限
- nickname 20 Unicode code points制限
- URL拒否
- 不正idempotency key拒否
- 不正JSONと想定外field拒否

## 4. Privacy

- comment DBへIPを保存しない
- broadcast payloadへIP、token hash、participant IDを含めない
- Student UIに永続localStorage IDを残さない
- Viewer cacheへIPを書かない

## 5. 履歴と権限

- Teacherは自分の授業だけ閲覧できる
- OwnerとAdminは自組織の授業を閲覧できる
- 同組織の別Teacherを拒否する
- 他組織を拒否する
- cursor paginationで重複しない
- CSVを認証済みendpointから取得する

## 6. CSV

- 全cellをdouble quoteで囲む
- double quoteを二重化する
- `=`, `+`, `-`, `@`で始まるformulaをapostropheで無害化する
- 先頭空白後のformulaも無害化する
- IP列を出力しない
- 10,000件超過をheaderで示す

## 7. Retention

- 期限切れcommentだけを物理削除する
- comment eventをcascade deleteする
- orphan participantを削除する
- Adminによる手動retentionを拒否する
- Ownerによる手動retentionを許可する
- scheduled handlerから同じ処理を実行できる

## 8. Fault injection

- event insert失敗時にparticipant、comment、eventを全rollbackする
- D1保存失敗時にbroadcastしない
- duplicate race時に一件だけ保存する

## 9. Regression

- Stage 2: 159件
- Stage 3-A: 120件
- Stage 3-B: 118件
- Stage 3-C: 49件
- Stage 4: 67件
- 機能回帰合計513件。失敗0件を完了条件とする

## 10. 精密監査

- request bodyのContent-Length偽装とstream超過
- secondary CSRF tokenの複数tabと上限超過
- DB triggerへの直接不正insert
- bounded cleanupのbacklog drain
- expired auth record cleanup
- stage別check commandの後方互換
- deployment configのUUID・Rate Limiting namespace重複拒否
- production workflowのexact SHA・migration・Owner・smoke検査
- static mirrorと配信SPAの一致
- 管理画面・manualにIP保存表現が残らないこと
