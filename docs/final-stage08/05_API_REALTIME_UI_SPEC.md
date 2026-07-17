# API。Realtime。UI契約

## 1. 共通API規則

- JSON responseは`ok`を持つ。
- private responseは`Cache-Control: no-store`を付ける。
- errorは内部stackを返さない。
- organization越境は404を優先する。
- unsafe private APIはOriginとCSRFを要求する。
- idempotencyが必要な投稿はclient keyを使う。

## 2. 公開API

### `GET /api/public/sessions/:publicCode`

授業title。投稿可否。事前承認。理解度可否。現在PDF pageを返す。

### `POST /api/public/sessions/:publicCode/messages`

匿名コメントを投稿する。
Studentからpage番号を受け取らない。
serverの現在pageへ紐付ける。

### `POST /api/public/sessions/:publicCode/understanding`

`understood`。`unsure`。`confused`を送る。
`bindingId`。`pageNumber`。`clientVersion`がserver状態と一致した場合だけ保存する。

### `GET /api/public/qr`

Student join URLのQRを返す。

## 3. 認証API

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/password/change`
- `POST /api/auth/password/reset/request`
- `POST /api/auth/password/reset`
- `POST /api/auth/registration/request`
- `POST /api/auth/registration/resend`
- `POST /api/auth/registration/verify`
- `GET /api/auth/account`
- `POST /api/auth/email-change/request`
- `POST /api/auth/email-change/confirm`
- `POST /api/auth/invitations/inspect`
- `POST /api/auth/invitations/accept`

## 4. 組織API

- `GET/PATCH /api/org`
- `GET/POST /api/org/members`
- `PATCH/DELETE /api/org/members/:userId`
- `GET /api/org/audit-logs`
- `GET/POST /api/org/invitations`
- `POST /api/org/invitations/:id/resend`
- `DELETE /api/org/invitations/:id`
- `GET/PATCH /api/org/ai-settings`
- `GET /api/org/content-filter`
- `POST /api/org/content-filter/terms`
- `PATCH/DELETE /api/org/content-filter/terms/:id`
- `PATCH /api/org/content-filter/policies`
- `POST /api/org/content-filter/packs/:packId/install`

## 5. private授業API

base pathは`/api/private/sessions`である。

- 授業list。create
- 授業detail。update。終了
- コメントlist。CSV
- moderation単一。一括。履歴
- Realtime ticket。catch-up
- AI授業設定。再試行
- 辞書filter授業設定
- PDF bind。page state
- analytics。snapshot。CSV export

正確なpathは`src/routes/private-v2.js`と段階別API契約を正本とする。

## 6. Realtime契約

### 接続

1. private APIまたはViewerが短命ticketを取得する。
2. ticketは一回だけ消費する。
3. WebSocketはDurable Objectへ接続する。
4. serverは最後のsequenceとsnapshotを返す。

### event

- eventはorganization。session。sequenceへ固定する。
- sequenceはsession内で単調増加する。
- clientは`lastSequence`以下を重複として捨てる。
- gapがある場合はcatch-up APIを使う。

### broadcast失敗

D1へevent保存後にDurable Object通知を行う。
通知失敗でD1 eventを削除しない。
再接続時にcatch-upする。

## 7. UI

- `/admin`: 授業管理。PDF。moderation。AI。辞書。分析
- `/master`: organization管理。member。招待。辞書pack
- `/account`: accountとemail変更
- `/j/:publicCode`: Student投稿と理解度
- `/viewer/:sessionId`: 弾幕。積層表示
- `/signup`: organization自己登録
- `/verify-email/:token`: email確認
- `/forgot-password`: reset request
- `/reset-password/:token`: password再設定
- `/accept-invitation/:token`: 招待承認

mobileではページ全体を横overflowさせない。
大きいtableだけ内部scrollを許可する。
