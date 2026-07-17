> **履歴資料** これはStage 1時点の旧API基準です。記載されたBearer認証やraw WebSocket tokenは現行仕様ではありません。現在のAPIは`docs/current-system.md`とStage 3〜6の正式仕様を参照してください。

# CPCV API基準

## 1. 共通

- JSON responseは原則`Cache-Control: no-store`
- 成功は原則`{"ok":true}`
- 失敗は原則`{"ok":false,"error":"ERROR_CODE"}`
- 未処理のD1制約違反は`500 INTERNAL_ERROR`
- Teacher private APIはBearer認証
- Master loginとlogout以外はMaster Bearer認証
- Teacher logoutとMaster logoutはBearerなしでも200
- JSON Content-Typeやbody byte sizeを共通検証しない
- JSON parse失敗時は空objectとして処理する

## 2. Public API

### `GET /api/public/qr?text=<value>`

認証なし。
`text`必須。JavaScript文字列長で最大500。
成功時は`image/svg+xml`。

主なerror:

- `400 TEXT_REQUIRED`
- `400 TEXT_TOO_LONG`
- `405 METHOD_NOT_ALLOWED`

### `GET /api/public/sessions/:publicCode`

認証なし。
public codeは大文字化する。
`active`かつ作成から6時間以内だけ利用可能。

成功例:

```json
{"ok":true,"title":"授業名","postingEnabled":true}
```

主なerror:

- `404 SESSION_NOT_FOUND`

### `POST /api/public/sessions/:publicCode/messages`

認証なし。

Request body:

```json
{"nickname":"任意","message":"必須","clientId":"任意"}
```

`x-client-id` headerがbodyの`clientId`より優先される。

現行正規化:

- nicknameは改行とtabをspace化しtrim後20 code unit
- messageは改行 tab 連続空白を正規化
- message最大140 code unit
- `http://` `https://` `www.`を含むmessageを拒否
- clientIdは英数字 `_` `-`だけ。最大80字
- IPは数字 hexadecimal colon dotだけ。最大64字

成功時header:

```text
Set-Cookie: cpcv_client_id=...; Path=/; Max-Age=2592000; SameSite=Lax; Secure
```

Cookieは現行Student JSとWorkerで読み戻されない。

主なerror:

- `400 EMPTY_MESSAGE`
- `400 MESSAGE_TOO_LONG`
- `400 URL_NOT_ALLOWED`
- `403 POSTING_CLOSED`
- `404 SESSION_NOT_FOUND`
- `429 RATE_LIMITED`

## 3. Teacher認証

### `POST /api/teacher/login`

Request body:

```json
{"loginId":"teacher-id","password":"password"}
```

処理:

- loginIdをtrim lowercase 許可文字化 最大64字
- active accountとpasswordを検証
- 12時間のsessionを発行
- token hashをD1へ保存
- `teachers`をemail conflict基準でupsert

成功例:

```json
{
  "ok": true,
  "teacherSession": "raw-token",
  "expiresAt": "ISO-8601",
  "teacher": {
    "id": "teacher-account-id",
    "loginId": "login-id",
    "email": "login-id@teacher.local",
    "name": "display-name"
  }
}
```

主なerror:

- `401 LOGIN_REQUIRED`
- `401 INVALID_LOGIN`
- `405 METHOD_NOT_ALLOWED`
- DB不整合時 `500 INTERNAL_ERROR`

### `POST /api/teacher/logout`

Bearerは任意。
存在すれば該当sessionを失効する。
Bearerなしでも200。

## 4. Teacher private API

認証:

```http
Authorization: Bearer <teacher_session>
```

有効条件:

- token hashが存在
- revokedでない
- expires_atを過ぎていない
- accountがactive

### `GET /api/private/me`

現在のTeacher情報を返す。

### `GET /api/private/sessions`

自分の`active`かつ6時間以内の授業を新しい順で返す。

### `POST /api/private/sessions`

Request body:

```json
{"title":"授業名"}
```

現行挙動:

- title未指定または空文字は`Untitled class`
- title最大80 code unit
- trimしないためspaceだけのtitleを保存できる
- IDは`sess_`とUUID
- public codeは紛らわしい文字を除いた6文字
- posting ON visibility ON activeで作成

### `GET /api/private/sessions/:sessionId`

存在 所有者 期限を確認する。
`active`の期限切れは404。
`ended`と`deleted`は期限確認を通らず取得できる。

主なerror:

- `401 TEACHER_SESSION_REQUIRED`
- `401 INVALID_TEACHER_SESSION`
- `403 FORBIDDEN`
- `404 SESSION_NOT_FOUND`

### `DELETE /api/private/sessions/:sessionId`

- posting OFF
- visibility OFF
- status `deleted`
- `ended_at`設定
- Viewerへ表示消去通知
- `comments:clear`と`session:delete`をaudit記録

### `POST /api/private/sessions/:sessionId/settings`

Request body候補:

```json
{
  "postingEnabled": true,
  "commentsVisible": true,
  "commentDisplaySeconds": 60,
  "commentDisplayMode": "stack3",
  "status": "active"
}
```

現行挙動:

- secondsは10から300へround and clamp
- modeは`stack3` `stack5` `stack7` `scroll`
- statusは`active` `ended` `deleted`
- statusとposting visibilityの組合せを制約しない
- `deleted`から`active`へ戻せる
- statusが`ended`以外なら`ended_at`をnullへする
- 設定値をCommentRoomへbroadcast

### `POST /api/private/sessions/:sessionId/comments/clear`

Viewerへ`message:clear`をbroadcastする。
IndexedDBログやserver dataを削除しない。

### `GET /api/private/sessions/:sessionId/live`

WebSocket Upgrade。
Bearerまたは`teacher-token.<token>` subprotocolを認証に使う。
Viewerはsubprotocol方式を使う。

成功時:

- HTTP 101
- token入りsubprotocolを選択値として返す
- 最初に`room:state`を送信

主なerror:

- `401 TEACHER_SESSION_REQUIRED`
- `401 INVALID_TEACHER_SESSION`
- `403 FORBIDDEN`
- `404 SESSION_NOT_FOUND`
- `410 SESSION_EXPIRED`
- `426 WEBSOCKET_REQUIRED`

## 5. Master API

### `POST /api/master/login`

Request body:

```json
{"masterToken":"MASTER_TOKEN value"}
```

成功時に15分のraw session tokenを返す。

主なerror:

- `401 MASTER_TOKEN_REQUIRED`
- `401 INVALID_MASTER_TOKEN`
- `500 MASTER_TOKEN_NOT_CONFIGURED`

### `POST /api/master/logout`

Bearerは任意。
存在すれば該当sessionを失効する。
Bearerなしでも200。

### Master認証済みAPI

```http
Authorization: Bearer <master_session>
```

- `GET /api/master/status`
- `GET /api/master/teachers`
- `POST /api/master/teachers`
- `POST /api/master/teachers/:teacherId/reset-password`
- `POST /api/master/teachers/:teacherId/disable`
- `POST /api/master/teachers/:teacherId/enable`
- `DELETE /api/master/teachers/:teacherId`
- `GET /api/master/sessions`
- `POST /api/master/sessions/:sessionId/end`
- `DELETE /api/master/sessions/:sessionId`

### `POST /api/master/teachers`

Request body:

```json
{"loginId":"required","displayName":"optional at API","password":"8 chars or more"}
```

APIではdisplayName未指定時にloginIdへfallbackする。
Master UIはdisplayName入力を必須としている。

現行異常挙動:

- duplicate loginIdは500
- D1 error詳細はclientへ出さずserver logへ出す

### 対象存在確認

次の操作は対象が存在しなくても現行では200を返す。

- reset password
- enable disable delete teacher
- end delete session

存在しないteacherへのreset passwordでも生成passwordを返す。

## 6. CommentRoom内部endpoint

外部公開APIではない。

| path | method | 認証 | 用途 |
|---|---|---|---|
| `/connect` | GET Upgrade | internal verified header | WebSocket接続 |
| `/message` | POST | Public API経由 | comment受付 |
| `/settings` | POST | internal verified header | state変更 broadcast |
| `/clear` | POST | internal verified header | 消去broadcast |

## 7. 実動確認済みの現行挙動

2026-07-12のlocal testで確認した。

- Master login success and failure
- Master logout without Bearer returns 200
- Teacher displayName API fallback
- duplicate login ID returns 500
- nonexistent target operations return 200
- Teacher login success failure logout revoke
- whitespace-only class title saved
- public class lookup
- WebSocket `room:state` `message:new` `settings:update` `message:clear`
- selected WebSocket protocol contains raw Teacher token
- formula-like comment is accepted
- same client ID rapid post returns 429
- `ftp://` text is accepted
- deleted state with enabled flags is accepted
- deleted class can be revived to active
- deleted class detail remains readable by owner
- account delete and same ID recreation causes session create 500
