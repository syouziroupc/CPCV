# CPCV 現行システム基準

## 1. 基本情報

| 項目 | 値 |
|---|---|
| README表記 | Class PDF Comment Viewer v0.2.0 |
| package名 | `class-pdf-comment-viewer-v01` |
| package version | `0.1.0` |
| Worker名 | `class-pdf-comment-viewer-v01` |
| entry | `src/index.js` |
| compatibility date | `2026-06-17` |
| 静的配信 | `./public`を`ASSETS` Bindingで配信 |
| D1 Binding | `DB` |
| D1 database name | `class_comment_db` |
| Durable Object Binding | `COMMENT_ROOM` |
| Durable Object class | `CommentRoom` |
| 公開URL設定 | `PUBLIC_ORIGIN` |
| 未使用設定 | `TEACHER_ORIGIN` |

## 2. ソース構成

```text
.github/workflows/deploy.yml   main push時のmigrationとdeploy
migrations/                   D1 migration 0001から0005
public/                       HTML CSS browser JavaScript PDF.js
scripts/                      静的検査 deploy補助 manual生成
src/index.js                  Worker API Asset routing CommentRoom
src/routes/master.js          Master API
src/lib/master-auth.js        Master session
src/lib/password.js           PBKDF2 token hash
```

## 3. Workerの処理順

1. `OPTIONS`
2. Public QR API
3. Public session API
4. Teacher login/logout
5. Master API
6. Teacher private API
7. 画面用Static Assets
8. その他のStatic Assets

全JSONレスポンスは原則`Cache-Control: no-store`。
Private画面は`Referrer-Policy: no-referrer`。
Public画面は`strict-origin-when-cross-origin`。
Static Assetsには`X-Content-Type-Options: nosniff`を付ける。
`/assets/`は`no-store`。

## 4. 画面

### `/`

- 6文字の授業コードを入力
- `/j/:publicCode`へ移動

### `/j/:publicCode`

- 授業名と投稿状態を取得
- nickname最大20字
- comment最大140字
- `clientId`をLocalStorageへ保存
- `x-client-id`で投稿
- 改行 タブ 連続空白を正規化

### `/admin`

- Teacher login
- 授業作成
- 自分の6時間以内のactive授業一覧
- 授業終了と削除

### `/admin/:sessionId`

- 投稿URL Viewer URL 公開コード
- 投稿ON/OFF
- コメント表示ON/OFF
- 表示方式 `stack3` `stack5` `stack7` `scroll`
- 表示時間または横流れ速度
- Viewerへの表示消去通知
- 授業終了と削除
- 同一browserのIndexedDBログ確認
- BroadcastChannelと定期更新

### `/viewer/:sessionId`

- Teacher login
- ローカルPDF選択
- PDF.js Canvas描画
- PDF link annotation
- Canvasのlink外クリックで次ページ
- keyboardとbuttonでページ移動
- 全画面
- 大型QRと隅QR
- WebSocket受信
- 受信queue最大50件
- 2秒ごとに1件表示
- 積み上げ3 5 7件または横流れ14 lane
- IndexedDBへcommentとIPを保存
- CSV出力
- 授業単位の端末ログ削除

### `/master`

- `MASTER_TOKEN`でlogin
- 先生アカウント作成
- password reset
- enable disable delete
- 6時間以内のactive授業一覧
- 授業終了と削除

## 5. D1テーブル

### `teachers`

授業が参照する先生レコード。
Teacher login成功時とPrivate API利用時にupsertされる。
emailは`<login_id>@teacher.local`。

### `sessions`

- ID
- 6文字public code
- teacher ID
- title
- posting state
- visibility state
- display seconds
- display mode
- status
- created and ended timestamps

`sessions.teacher_id`は`teachers.id`への外部キー。
利用可能時間はWorkerコードで6時間。

### `admin_audit_logs`

現行で記録するaction:

- `session:create`
- `session:settings`
- `comments:clear`
- `session:delete`

Master操作は記録しない。

### `system_settings`

テーブルは存在する。
現行コードからは利用しない。

### `teacher_accounts`

login ID display name password hash salt active stateを保存。

### `teacher_sessions`

Teacher session tokenのSHA-256 hashと期限 失効時刻を保存。

### `master_sessions`

Master session tokenのSHA-256 hashと期限 失効時刻を保存。

## 6. Durable Object

`CommentRoom`がメモリへ保持する値:

```text
sockets
lastPostAt
postingEnabled
commentsVisible
commentDisplaySeconds
commentDisplayMode
```

内部endpoint:

| path | 用途 |
|---|---|
| `/connect` | Viewer WebSocket接続 |
| `/message` | Public APIからcomment受付 |
| `/settings` | 設定変更をbroadcast |
| `/clear` | 表示消去をbroadcast |

`/connect` `/settings` `/clear`は内部header `x-teacher-token-verified: true`を要求する。
`/message`はPublic API経由。

WebSocket event:

- `room:state`
- `message:new`
- `settings:update`
- `message:clear`
- `pong`

Durable Object Storageは未使用。
再起動後にstate comment history rate-limit stateを復元しない。

## 7. コメントデータフロー

1. StudentがPublic APIへ投稿
2. WorkerがD1から授業を取得
3. Workerが接続元IPを取得
4. Workerが授業IDのCommentRoomへ送る
5. CommentRoomが本文と投稿状態を検証
6. `clientId`単位の10秒制限を確認
7. 接続中Viewerへ`message:new`をbroadcast
8. Viewerが受信内容をIndexedDBへ保存
9. 表示ONならqueueから画面へ表示
10. CSVはIndexedDBからbrowser側で生成

D1とDurable Object Storageにはcomment本文を保存しない。
Viewerが接続していない時間のcommentは後から取得できない。

## 8. Browser storage

| storage | keyまたはDB | 内容 |
|---|---|---|
| LocalStorage | `CPCV_MASTER_SESSION` | Master生token |
| LocalStorage | `CPCV_MASTER_EXPIRES_AT` | Master期限 |
| LocalStorage | `CPCV_TEACHER_SESSION` | Teacher生token |
| LocalStorage | `cpcv_client_id` | Student指定ID |
| LocalStorage | `CPCV_QR_CORNER` | QR隅表示設定 |
| IndexedDB | `CPCV_LOCAL_LOGS` | comment端末ログ |
| BroadcastChannel | `CPCV_LOCAL_LOG_UPDATES` | 同一origin tab間のログ更新通知 |

## 9. Sessionと状態

- 授業は作成から6時間で期限切れ
- Teacher sessionは12時間
- Master sessionは15分
- 授業statusは`active` `ended` `deleted`
- display modeは`stack3` `stack5` `stack7` `scroll`
- display secondsは10から300へclamp

現行APIにはstatus遷移制約がない。

## 10. Buildとdeploy

### package scripts

- `check`
- `check:project`
- `check:pdf-links`
- `dev`
- `deploy`
- `deploy:dry-run`
- `db:migrate:local`
- `db:migrate:remote`

### GitHub Actions

pull requestではcheckとdry-runを実行する。
main pushとmanual dispatchではcheck後に次を実行する。

1. remote D1 migrations
2. `MASTER_TOKEN` secret設定または既存secret利用
3. Worker deploy

## 11. Manual生成補助

Python scriptは次へ依存する。

- reportlab
- Pillow
- pypdfium2
- Windowsの特定font path

これらは`package.json`では管理されない。
`create_manual_pdf.py`にはWindows絶対font pathがある。
