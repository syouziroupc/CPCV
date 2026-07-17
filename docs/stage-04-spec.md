# CPCV Stage 4 正式仕様: 匿名参加者・コメント永続化

## 1. 目的

匿名参加者とコメントを組織および授業へ固定し、投稿再送を重複保存せず、必要な期間だけDB_V2へ保存する。

## 2. 正本

- 授業境界の正本: `DB_V2.live_sessions`
- コメントの正本: `DB_V2.comments`
- 匿名参加者の正本: `DB_V2.participants`
- Durable Object: 同時投稿の直列化、即時配信、接続中Viewerへのbroadcast
- IndexedDB: 表示端末の補助cacheのみ。記録の正本ではない
- 生IP、User-Agent、端末指紋は保存しない

## 3. 匿名参加者

- 授業コードごとのHttpOnly Cookieを利用する
- Cookie名: `cpcv_p_<lowercase public code>`
- tokenは32byte以上の乱数
- DBへ保存するのはSHA-256 hashだけ
- 同じbrowserでも授業ごとに別tokenとする
- participant IDはserver生成のopaque ID
- participant rowは初回投稿時に作成する

## 4. コメント投稿

Endpoint:

`POST /api/public/sessions/:publicCode/messages`

JSON:

```json
{
  "nickname": "optional",
  "message": "required",
  "idempotencyKey": "required"
}
```

- 新UIの`idempotencyKey`は必須。16〜128文字の英数字、`.`、`_`、`:`、`-`
- 旧client互換のため欠落時はserverが一回限りのkeyを補う。旧clientには再送重複防止を保証しない
- 同一授業内で一意
- 同じkeyの再送は既存commentを返し、再broadcastしない
- messageはNFKC正規化後に制御文字と連続空白を整理
- 最大140 Unicode code points
- nicknameは最大20 Unicode code points
- URLを含む投稿は現行仕様通り拒否
- 投稿間隔はparticipant単位で10秒
- rate claimとcomment insertは同一D1 batch内で処理する

Response:

- 新規保存: HTTP 201
- 再送: HTTP 200、`duplicate: true`
- rate limit: HTTP 429
- 保存後のpayloadには永続comment IDを含める

## 5. 永続化

追加table:

- `participants`
- `comments`
- `comment_events`

comment state:

- `visible`
- `pending`
- `hidden`
- `deleted`

Stage 4では既存表示互換のためdefaultを`visible`とする。Stage 5がmoderation transitionを実装する。

## 6. 保存期間

- default 30日
- `COMMENT_RETENTION_DAYS`で1〜365日に変更可能
- commentごとに`retained_until`を保存
- scheduled handlerまたは保守関数が期限切れcommentを物理削除する
- `comment_events`はcascade delete
- commentが残っていないparticipantも削除する
- 授業がsoft deleteされても保存期限まではcommentを保持する

## 7. 履歴とCSV

Authenticated endpoints:

- `GET /api/private/sessions/:sessionId/comments`
- `GET /api/private/sessions/:sessionId/comments/export`

Teacherは自分の授業のみ。OwnerとAdminは自組織の授業を参照できる。

CSVではセル先頭の空白を除いた最初の文字が `=`, `+`, `-`, `@` の場合にapostropheを付ける。全cellをdouble quoteで囲み、double quoteを二重化する。

## 8. 障害時

- D1保存失敗時はbroadcastしない
- D1保存成功後のsocket送信失敗は保存結果を失敗扱いにしない
- 同じidempotency keyの再送で保存済みcommentを回収できる
- comment created eventはcomment insertと同一batchで作成する

## 9. 変更禁止

- 認証方式
- role matrix
- 旧migration
- Stage 3 session投影契約
- AI、翻訳、WebSocket sequence再設計
- PDF.js
- deployment workflow

## 10. 精密監査補遺

- JSON bodyは公開投稿4KiB。認証API16KiB
- comment本文・message_length・nicknameをDB triggerでも検証
- secondary CSRF tokenはsessionごとに最大8本
- comment・participant・security record cleanupは500件単位
- scheduled処理は最大20 batch
- HTML・APIへ共通security headerを適用
- production loginはCloudflare client IPと2個のRate Limiting bindingを必須化
- CIはStage 2〜4を全実行
- production deployはmanual workflowとexact commit SHAだけ
- static mirror HTMLはWorker配信SPAと同期
- 管理画面とmanualからobsolete IP列を撤去

Stage 4当初の「deployment workflow変更禁止」は通常機能実装の境界です。精密監査では未移行DBへの誤deployを防ぐため運用系を独立修正しました。


## 14. 精密監査後の確定事項

- 認証JSON bodyは16 KiB。公開投稿JSON bodyは4 KiBを上限とする
- Sessionごとのsecondary CSRF tokenは最大8本とする
- comment本文・message_length・nicknameはDB triggerでも検証する
- comment・participant・security record cleanupはbounded batchで実行する
- scheduled maintenanceはUTC 03:17に日次実行する
- HTML responseへCSP・frame防御・HSTS等を付与する
- production loginはRate Limiting bindingとCloudflare client IPを必須とする
- local devは非本番専用pepperを明示して起動する
- 実Worker smoke testでlogin、授業作成、匿名投稿、履歴、CSV、終了、logoutを確認する
- Stage 4ローカル完了基準は機能試験513件と精密境界88件の失敗0件とする
