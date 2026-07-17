# CPCV 第3段階 API契約・実装補遺

## 0. 適用順位

この文書は `docs/stage-03-spec.md` を補足する。両者が衝突する場合はこの文書を優先する。Codexは未確定事項を独自判断しない。

## 1. 認証済みAPIでの組織確定

- 認証後の組織はsession Cookieに対応する `auth_sessions.organization_id` だけを正本とする。
- login以外のAPIでbody。query。headerに `organizationId` または `organization_id` が存在した場合は400を返す。
- 値がsessionの組織と一致していても受け付けない。

```json
{
  "ok": false,
  "error": "ORGANIZATION_ID_NOT_ALLOWED"
}
```

## 2. Password reset API

管理者による発行と利用者による消費を分離する。

```text
POST /api/org/members/:userId/password-reset
POST /api/auth/password/reset
```

旧案の次のendpointは実装しない。

```text
POST /api/auth/password/reset/request
```

### 2.1 管理者発行

`POST /api/org/members/:userId/password-reset`

要求:

- 認証Cookie
- Origin
- CSRF
- JSON Content-Type
- bodyは空objectまたは省略可能

権限:

- Ownerは自組織のAdminとTeacherへ発行可能
- Adminは自組織のTeacherへだけ発行可能
- Ownerへの発行は禁止
- active membershipが複数組織にある利用者は拒否

成功: 201

```json
{
  "ok": true,
  "resetToken": "raw-token-returned-once",
  "expiresAt": "2026-07-12T12:30:00.000Z"
}
```

DBにはtoken hashだけを保存する。raw tokenは監査ログへ記録しない。

### 2.2 利用者による消費

`POST /api/auth/password/reset`

```json
{
  "token": "raw-token",
  "newPassword": "new password"
}
```

要求:

- 未認証で使用可能
- Origin必須
- JSON Content-Type必須
- CSRF不要

成功: 200

```json
{
  "ok": true
}
```

成功時:

- tokenを使用済みにする
- 対象userの他reset tokenを全失効
- 対象userのauth sessionを全失効
- passwordを新schemeで保存
- audit logを記録

## 3. Login失敗とlock

外部へ返す認証失敗は次へ統一する。

```json
{
  "ok": false,
  "error": "INVALID_CREDENTIALS"
}
```

HTTP statusは401。

対象:

- userなし
- password不一致
- user suspendedまたはdeleted
- organization suspended
- membershipなし。停止。解除
- account lock中

`ACCOUNT_LOCKED`は外部error codeとして使用しない。監査ログの内部reasonだけに使用する。

Rate limiter超過だけは429とする。

```json
{
  "ok": false,
  "error": "RATE_LIMITED"
}
```

`Retry-After`を付ける。

## 4. 組織メンバーAPI契約

### 4.1 一覧

`GET /api/org/members?cursor=<id>&limit=<1..100>`

- default limit: 50
- organization指定parameterは禁止
- role。status。created_at。idの安定順で返す

成功: 200

```json
{
  "ok": true,
  "members": [
    {
      "userId": "usr_...",
      "loginId": "teacher01",
      "displayName": "Teacher 01",
      "role": "teacher",
      "status": "active",
      "createdAt": "2026-07-12T00:00:00.000Z",
      "updatedAt": "2026-07-12T00:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### 4.2 作成または既存userへのmembership追加

`POST /api/org/members`

```json
{
  "loginId": "teacher01",
  "displayName": "Teacher 01",
  "role": "teacher",
  "temporaryPassword": "at least 12 chars"
}
```

規則:

- loginIdは正規化してglobal unique
- 新規user作成時だけtemporaryPassword必須
- 既存userへmembershipを追加する場合はtemporaryPasswordを受け付けない
- 既存userをloginIdだけで自動接続しない。`existingUserId`を明示する別形式を使用する

既存user形式:

```json
{
  "existingUserId": "usr_...",
  "role": "teacher"
}
```

二形式のfield混在は400。

成功: 201。

重複membership: 409 `MEMBERSHIP_ALREADY_EXISTS`。

loginId重複: 409 `LOGIN_ID_ALREADY_EXISTS`。

### 4.3 role・status変更

`PATCH /api/org/members/:userId`

```json
{
  "role": "teacher",
  "status": "active"
}
```

- roleまたはstatusの最低一方が必要
- statusは `active` または `suspended`
- `removed`への変更はDELETEだけを使用
- 成功時に対象組織のauth sessionを全失効
- AdminはTeacherだけを変更可能

成功: 200。変更後memberを返す。

### 4.4 membership解除

`DELETE /api/org/members/:userId`

- rowを物理削除しない
- `status='removed'`へ変更
- 対象組織のauth sessionを全失効

成功: 204。bodyなし。

## 5. 最後のOwner保護

Owner数をJavaScriptで事前確認してから更新する方式は禁止する。

role変更。suspend。removeの各操作はDB内の条件付きUPDATEで行う。対象がactive Ownerで。変更後にactive Ownerが0人になる場合は更新件数0とする。

更新件数0の原因を再照会して判定し。該当時は409を返す。

```json
{
  "ok": false,
  "error": "LAST_OWNER_REQUIRED"
}
```

同じutilityを三経路で共有する。補償更新で戻す方式を通常経路にしない。

## 6. Audit log API

`GET /api/org/audit-logs?cursor=<id>&limit=<1..100>&action=<exact>`

- OwnerとAdminのみ
- default limit: 50
- 組織指定parameterは禁止
- `created_at DESC, id DESC`
- action filterは完全一致

成功: 200

```json
{
  "ok": true,
  "logs": [],
  "nextCursor": null
}
```

## 7. Rate Limiting local契約

Cloudflare bindingの実値はローカル実装へ書かない。

- `namespace_id`は正整数を表す文字列
- local testでは `{ limit({ key }): Promise<{ success: boolean }> }` を満たすmockを注入
- binding障害時はlimiterだけfail-open
- D1 account lockは継続
- 障害を監査ログへ記録する。ただし生IPと生login IDは記録しない

## 8. Stage 3分割

Stage 3を一つのCodex taskとして実装しない。

### Stage 3-A

- migration
- auth純粋utility
- middleware
- unitとintegration試験
- routeとUIは変更しない

### Stage 3-B

- login。logout。session
- password change
- password reset発行・消費
- organization member API
- audit API

### Stage 3-C

- live session authorization
- 旧DB projectionと補償
- Admin。Master UIのCookie化
- legacy auth 410
- 全体試験

各taskは前taskの0 failureを開始条件とする。
