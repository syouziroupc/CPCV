# CPCV 第3段階 認証・組織権限 正式設計書

## 0. 文書状態

- 保存先: `docs/stage-03-spec.md`
- 対象: 第3段階
- 基準ソース: `CPCV_stage02_debugged_source.zip`
- 基準DB設計: `docs/stage-02-spec.md`
- 状態: Stage 3-A・3-B・3-Cローカル実装完了。remote反映未実施
- API契約補遺: `docs/stage-03-contract-addendum.md`。衝突時は補遺を優先
- 第3段階実装状態: A・B・C完了。remote反映未実施

## 1. 目的

第2段階で作成した新版D1を使用し、Owner、Admin、Teacherを組織単位で認証・認可する。Bearer tokenとLocalStorageへ保存された認証tokenを廃止し、HttpOnly Cookie、CSRF対策、Origin検査を導入する。

第3段階で扱う最高権限は組織Ownerである。組織Ownerは自組織を管理する。システム全体の運営者は別主体とし、第3段階では実装しない。

## 2. 現行ソースとの整合確認

### 2.1 現行認証

現行コードには次が存在する。

- `/api/teacher/login`
- `/api/teacher/logout`
- `/api/private/**`
- `/api/master/**`
- `teacher_sessions`
- `master_sessions`
- Bearer token
- WebSocket subprotocol内のTeacher token
- `public/assets/admin.js`と`public/assets/master.js`のLocalStorage利用

### 2.2 第3段階で解消するもの

- 認証主体の二重化
- Bearer tokenのLocalStorage保存
- Master tokenによるシステム全体管理
- 組織境界の欠如
- account停止時のsession失効漏れ
- state-changing APIのCSRF対策不足
- login試行制限不足

### 2.3 暫定的に残すもの

学生投稿とWebSocket方式は変更禁止である。学生投稿とDurable Objectは旧D1の`sessions`を参照する。このため第3段階では旧D1を互換実行面として残す。

新版D1の`live_sessions`を授業権限の正本とする。旧D1の`sessions`は学生投稿と現行WebSocketのための互換投影とする。

この二重構造は第6段階までの暫定構造である。第3段階完了後に削除してはならない。

## 3. 採用するアーキテクチャ

### 3.1 認証DB

認証・組織・権限・監査は`env.DB_V2`だけを使用する。

対象:

- `organizations`
- `users`
- `organization_members`
- `auth_sessions`
- `password_reset_tokens`
- `live_sessions`
- `audit_logs`

### 3.2 旧DB

`env.DB`は次だけに使用する。

- 学生公開API
- 現行コメント投稿
- 現行Durable Object接続
- Viewer互換処理
- 第3段階で作成・更新された授業の互換投影

### 3.3 授業の正本と投影

- 正本: `DB_V2.live_sessions`
- 投影: `DB.sessions`
- 両方の`id`と`public_code`を同一にする
- 組織・作成者・role判定は必ず`DB_V2`で行う
- 学生公開APIは第3段階では旧DBを読む

### 3.4 跨DB更新

D1の別database間に単一transactionは存在しない。次の順序と補償処理を採用する。

#### 授業作成

1. DB_V2へ`live_sessions`を作成
2. 旧DBへ同一IDと公開コードで`sessions`を作成
3. 2が失敗した場合、DB_V2行を`deleted`へ変更し、`audit_logs`へ`session:create_projection_failed`を記録
4. APIは500を返し、成功として返さない

#### 授業設定変更

1. DB_V2の現行値と権限を確認
2. 旧DBを更新
3. DB_V2を更新
4. 3が失敗した場合、旧DBを更新前の値へ戻す
5. rollbackにも失敗した場合、`audit_logs`へ`session:projection_inconsistent`を記録し500を返す

#### 授業終了・削除

1. 旧DBを投稿停止・非表示へ変更
2. DB_V2を終了・削除状態へ変更
3. 2が失敗した場合、旧DBを安全側の停止状態のままにする
4. 不整合監査ログを記録する

安全性を優先し、停止処理では旧DBを再開状態へ戻さない。

### 3.5 不採用案

#### 第3段階で学生公開APIもDB_V2へ移す案

不採用。学生投稿とWebSocket方式の変更禁止範囲に抵触する。

#### 旧DBだけへ組織IDを追加する案

不採用。旧migrationを延命し、二重管理問題を再発させる。

#### 認証だけDB_V2にして授業権限を旧DBで判定する案

不採用。旧DBに組織membershipがなく、組織越境をDBレベルで防止できない。

## 4. 第3段階DB変更

### 4.1 migration

追加する。

```text
migrations-v2/0002_auth_security.sql
```

### 4.2 `users`追加列

```sql
ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0
  CHECK (failed_login_count BETWEEN 0 AND 1000000);
ALTER TABLE users ADD COLUMN locked_until TEXT;
ALTER TABLE users ADD COLUMN require_password_change INTEGER NOT NULL DEFAULT 0
  CHECK (require_password_change IN (0,1));
```

SQLite/D1のALTER制約を実機検証する。ALTERでCHECK追加が不可能な場合は、設計変更せずtable rebuild migrationを使用する。

### 4.3 追加INDEX

```sql
CREATE INDEX idx_users_lock_state
  ON users(status, locked_until);
```

### 4.4 新規テーブル

新規テーブルは追加しない。IP単位の短期rate limitはCloudflare Workers Rate Limiting bindingを使用する。アカウント単位の連続失敗は`users.failed_login_count`と`locked_until`で保持する。

### 4.5 Rate Limiting binding

二つのbindingを分ける。

```toml
[[ratelimits]]
name = "AUTH_LOGIN_IP_LIMITER"
namespace_id = "実アカウント内で未使用の正整数"
  [ratelimits.simple]
  limit = 20
  period = 60

[[ratelimits]]
name = "AUTH_LOGIN_ACCOUNT_LIMITER"
namespace_id = "実アカウント内で未使用の別の正整数"
  [ratelimits.simple]
  limit = 10
  period = 60
```

`namespace_id`はCodexが架空値で決めない。Cloudflare accountで実際に割り当てる値を利用者が設定する。local試験ではmock bindingを使用する。

CloudflareのRate Limiting APIは短時間の防御に使用する。per-locationかつeventually consistentであるため、正確なaccount lockの正本にはしない。

## 5. Cookie設計

### 5.1 本番Cookie

認証Cookie:

```text
__Host-cpcv_session=<raw session token>;
Path=/;
Secure;
HttpOnly;
SameSite=Strict;
Max-Age=<absolute expiryまでの秒数>
```

属性:

- `Domain`を付けない
- `Path=/`
- `Secure`
- `HttpOnly`
- `SameSite=Strict`
- raw tokenはCookie以外へ返さない
- D1にはSHA-256 hashだけを保存する

CSRF tokenはCookieへ保存しない。ログインレスポンスまたは`GET /api/auth/session`でraw tokenをJSONとして返す。クライアントはメモリへ保持する。D1にはhashだけを保存する。

### 5.2 local Cookie

ローカルHTTPでは`__Host-`と`Secure` Cookieをブラウザ試験できない。次を使用する。

```text
cpcv_session_dev
```

条件:

- `APP_ENV=local`の場合だけ許可
- `Secure`なし
- `HttpOnly`
- `SameSite=Strict`
- remote originで`APP_ENV=local`を許可しない
- production相当試験ではSet-Cookie属性を文字列検査する

## 6. CSRFとOrigin

### 6.1 unsafe method

次へ適用する。

- POST
- PUT
- PATCH
- DELETE

要求条件:

1. 有効なsession Cookie
2. `Origin`が許可originと完全一致
3. `X-CSRF-Token`が存在
4. token hashが`auth_sessions.csrf_token_hash`と一致
5. `Content-Type: application/json`。例外はlogoutの空bodyだけ

不一致は403とする。認証失敗の401と区別する。

### 6.2 loginとpassword reset

未認証endpointでもOrigin確認を行う。

- `/api/auth/login`
- `/api/auth/password/reset`

login前にはCSRF sessionがないためCSRF headerは要求しない。OriginとJSON Content-Typeは要求する。

### 6.3 許可Origin

正本は新しい環境変数`AUTH_ORIGIN`とする。`PUBLIC_ORIGIN`やリクエストのHostから自動推定しない。

例:

```text
AUTH_ORIGIN=https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev
```

本番値は実環境で設定する。複数originは第3段階では許可しない。

## 7. セッション設計

### 7.1 token

- 32 bytes以上の暗号学的乱数
- base64url
- D1にはSHA-256 hashのみ
- session IDとtokenを分離
- session fixation防止のためloginごとに新規発行

### 7.2 有効期限

推奨値:

- idle期限: 2時間
- absolute期限: 12時間
- password変更時: 全session失効。ただし現在の変更処理を最後に新規sessionを発行してもよい
- account停止、membership停止・解除: 対象sessionを即時失効
- role変更: 対象組織のsessionを即時失効

### 7.3 last_seen更新

DB書込みを毎requestで行わない。`last_seen_at`から5分以上経過した場合だけ更新する。idle期限も同時に延長する。ただしabsolute期限を超えない。

### 7.4 session lookup

Cookie raw tokenをhash化し、次を一回のJOINで確認する。

- auth session未失効
- idle期限内
- absolute期限内
- user active
- organization active
- membership active
- roleが有効

結果から`AuthContext`を作成する。

```js
{
  sessionId,
  organizationId,
  userId,
  role,
  loginId,
  displayName
}
```

クライアント送信の`organization_id`で上書きしない。

## 8. roleと権限

### 8.1 role

- `owner`
- `admin`
- `teacher`

### 8.2 権限表

| 操作 | Owner | Admin | Teacher |
|---|---:|---:|---:|
| 自分の情報取得 | 可 | 可 | 可 |
| 自分のpassword変更 | 可 | 可 | 可 |
| 組織情報取得 | 可 | 可 | 可 |
| membership一覧 | 可 | 可 | 不可 |
| Teacher作成 | 可 | 可 | 不可 |
| Teacher停止・再開 | 可 | 可 | 不可 |
| Teacher membership解除 | 可 | 可 | 不可 |
| Admin作成・変更 | 可 | 不可 | 不可 |
| Owner追加 | 可 | 不可 | 不可 |
| Owner解除 | 最後のOwner以外可 | 不可 | 不可 |
| 全組織授業一覧 | 可 | 可 | 自分の授業だけ |
| 他Teacher授業の終了 | 可 | 可 | 不可 |
| 授業作成 | 可 | 可 | 可 |
| 自分の授業更新 | 可 | 可 | 可 |
| 監査ログ閲覧 | 可 | 可 | 不可 |

AdminはOwnerを停止・降格・削除できない。Adminは他Adminを管理できない。

## 9. API

### 9.1 認証

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
POST /api/auth/password/change
POST /api/org/members/:userId/password-reset
POST /api/auth/password/reset
```

### 9.2 組織

```text
GET  /api/org
GET  /api/org/members
POST /api/org/members
PATCH /api/org/members/:userId
DELETE /api/org/members/:userId
GET  /api/org/audit-logs
```

### 9.3 授業

現行`/api/private/sessions/**`を維持する。ただし認証と認可を新版middlewareへ置き換える。

- Owner/Admin: 自組織の授業
- Teacher: `created_by_user_id = auth.userId`の授業
- request bodyの`organizationId`は受け付けない
- pathのsession IDをDB_V2で組織境界確認した後だけ旧DBへ触る

### 9.4 legacy endpoint

`AUTH_V2_ENABLED=1`の場合、次を410で無効化する。

- `/api/teacher/login`
- `/api/teacher/logout`
- `/api/master/**`

ただし学生公開APIとWebSocketは無効化しない。

local移行試験時だけ`AUTH_V2_ENABLED=0`を許可する。本番で0を許可しない。

## 10. login

### 10.1 入力

```json
{
  "loginId": "teacher01",
  "password": "...",
  "organizationId": "org_..."
}
```

`organizationId`は選択候補であり信用しない。serverがmembershipを照合する。

### 10.2 複数組織

1. credentialsを検証
2. active membershipを取得
3. 0件: genericな401
4. 1件: serverがその組織を選択。入力organizationIdは無視
5. 複数件でorganizationIdなし: 409と組織候補を返す。sessionは作らない
6. 複数件でorganizationIdあり: active membershipと一致した場合だけsession作成

UIはpasswordを永続保存しない。組織選択後の再送までメモリだけに保持する。

### 10.3 error秘匿

次は同じ401 `INVALID_CREDENTIALS`とする。

- userなし
- password不一致
- membershipなし
- user deleted

`suspended`とlock中も外部レスポンスはgenericにする。監査ログでは理由を区別する。

## 11. login試行制限

### 11.1 IP limiter

key:

```text
sha256(CF-Connecting-IP + AUTH_RATE_LIMIT_PEPPER)
```

生IPをkeyやlogへ保存しない。pepperはsecretとして設定する。

### 11.2 account limiter

key:

```text
sha256(normalized login_id + AUTH_RATE_LIMIT_PEPPER)
```

### 11.3 account lock

- password失敗5回: 15分lock
- 成功: countを0、locked_untilをNULL
- lock中のattemptでもpassword hash比較を行わず拒否
- user不存在ではdummy hash計算を行いtiming差を減らす
- limiterとlockの発動をauditへ記録する

Cloudflare limiterは防御層である。account lockの正確な状態はD1を正本とする。

## 12. Password

### 12.1 hash方式

現行`src/lib/password.js`の実装を再確認し、Web Cryptoで実行できるPBKDF2-SHA-256を使用する。第3段階では次へ固定する。

```text
pbkdf2-sha256-600000-v2
```

- salt 16 bytes以上
- derived key 32 bytes
- constant-time比較
- login成功時に旧schemeなら新schemeへrehash

OWASPの現行推奨値である600,000回を初期値とする。Workers実機で許容できない性能問題が再現した場合は勝手に下げず、測定値と代替案を報告して設計を再承認する。

### 12.2 password規則

- 12〜128文字
- 前後trimしない
- Unicodeを許可
- login IDと同一を拒否
- 一律の記号・大文字要件は設けない
- requestとresponseとlogへ平文を残さない

### 12.3 password変更

- current passwordを要求
- CSRFとOrigin必須
- 成功時にpassword列を更新
- reset tokenを全失効
- auth sessionを全失効
- 新規sessionを発行
- audit logを記録

### 12.4 password reset

メール基盤とemail列は現行ソースに存在しない。自動メール式self-service resetは第3段階では実装できない。

採用方式:

- Owner/Adminが対象利用者へ一回限りのreset tokenを発行
- raw tokenはレスポンスへ一度だけ返す
- DBにはhashだけを保存
- 有効期限30分
- 使用時に全sessionと他reset tokenを失効
- AdminはTeacherだけに発行可能
- OwnerはAdminとTeacherに発行可能
- Owner自身はログイン中のpassword変更を使用
- 複数組織所属者のglobal passwordを一組織が変更する危険を避けるため、対象利用者にactive membershipが複数ある場合は`RESET_REQUIRES_SYSTEM_OPERATOR`で拒否
- システム全体運営者用resetは後段階

## 13. accountとmembership停止

### 13.1 user status

`users.status='suspended'`は全組織でログイン不可になる。組織Owner/Adminがglobal user statusを変更してはならない。

第3段階の組織管理画面は`organization_members.status`だけを変更する。

### 13.2 membership status

- `active`
- `suspended`
- `removed`

`suspended`または`removed`時は対象組織のauth sessionを全失効する。

### 13.3 最後のOwner

role変更。停止。解除は共通の条件付きUPDATEを使用する。対象が最後のactive Ownerであり、変更後にactive Ownerが0人になる場合は更新件数を0とする。session失効と監査ログは同じD1 batch内で対象更新の成功を条件に実行する。JavaScriptによる事前countだけの判定や通常経路での補償更新は使用しない。

## 14. Audit log

### 14.1 必須action

- `auth.login.success`
- `auth.login.failure`
- `auth.login.rate_limited`
- `auth.logout`
- `auth.session.revoked`
- `auth.password.changed`
- `auth.password_reset.issued`
- `auth.password_reset.used`
- `member.created`
- `member.role_changed`
- `member.suspended`
- `member.activated`
- `member.removed`
- `session.created`
- `session.updated`
- `session.ended`
- `session.deleted`
- `session.projection_failed`
- `session.projection_inconsistent`

### 14.2 details_json

保存してよいもの:

- reason code
- target role
- old/new status
- request ID
- Cloudflare colo

保存禁止:

- password
- raw session token
- raw CSRF token
- raw reset token
- password hash
- salt
- full Cookie header
- full Authorization header
- 生IP

## 15. 認証middleware

追加予定:

```text
src/auth/cookies.js
src/auth/csrf.js
src/auth/middleware.js
src/auth/passwords.js
src/auth/permissions.js
src/auth/rate-limit.js
src/auth/sessions.js
src/routes/auth.js
src/routes/organization.js
src/routes/private-v2.js
src/db/live-session-projection.js
```

`src/index.js`はrouting接続だけに限定する。大規模リファクタリングは禁止する。

Middleware API:

```js
requireAuth(request, env, options)
requireRole(auth, allowedRoles)
requireSameOrigin(request, env)
requireCsrf(request, env, auth)
requireSessionAccess(env, auth, sessionId, action)
```

## 16. UI変更

変更を次に限定する。

- `public/assets/admin.js`
- `public/assets/master.js`
- `public/admin/index.html`
- `public/master/index.html`
- 必要最小限の共通auth fetch helper

要件:

- LocalStorageから認証tokenを削除
- `credentials: "same-origin"`
- CSRF tokenはメモリだけ
- page reload時は`GET /api/auth/session`
- `/master`は組織Owner/Admin管理画面として扱う
- システム全体管理を示す文言を削除
- UI全面変更は禁止

ViewerとStudent UIは変更しない。

## 17. Response header

認証APIへ最低限次を付ける。

```text
Cache-Control: no-store
Pragma: no-cache
Content-Type: application/json; charset=utf-8
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

認証済みHTMLもcacheしない。

## 18. Error code

最低限:

```text
AUTH_REQUIRED
INVALID_CREDENTIALS
SESSION_EXPIRED
SESSION_REVOKED
CSRF_REQUIRED
CSRF_INVALID
ORIGIN_FORBIDDEN
ROLE_FORBIDDEN
ORGANIZATION_SELECTION_REQUIRED
MEMBERSHIP_INACTIVE
ACCOUNT_LOCKED
RATE_LIMITED
PASSWORD_POLICY_FAILED
CURRENT_PASSWORD_INVALID
RESET_TOKEN_INVALID
RESET_TOKEN_EXPIRED
RESET_REQUIRES_SYSTEM_OPERATOR
SESSION_NOT_FOUND
SESSION_FORBIDDEN
PROJECTION_WRITE_FAILED
```

内部理由を500 responseへ露出しない。request IDを返し、詳細はlogとauditへ記録する。

## 19. Legacy移行

第3段階で旧Teacher accountを自動移行しない。理由は次のとおり。

- 旧accountと新organizationの対応が確定していない
- 旧Teacherが複数組織へ属するか不明
- MasterをどのOwnerへ対応させるか不明
- password scheme移行可否を確認する必要がある

初回Ownerは第2段階Bootstrapで作成する。Ownerが第3段階UIまたは管理APIからAdmin、Teacherを作成する。

旧認証を無効化する前に、少なくとも一つのactive Owner sessionをlocal試験で確認する。

## 20. 環境変数とsecret

通常変数:

```text
APP_ENV
AUTH_ORIGIN
AUTH_V2_ENABLED
```

secret:

```text
AUTH_RATE_LIMIT_PEPPER
```

禁止:

- SQLへsecret記載
- sourceへsecret記載
- `.dev.vars`のcommit
- command lineへpassword記載

Rate Limiting namespace IDはsecretではないが、実accountで重複しない値を使用する。

## 21. 変更禁止範囲

- `migrations/**`
- 旧D1 database ID
- 学生投稿payload
- 匿名参加者
- コメント保存
- Durable Objectのcomment protocol
- WebSocket subprotocol方式。第6段階で変更
- AI
- 翻訳
- PDF分析
- Viewer UI
- Student UI
- 本番deploy

## 22. 実装順序

1. migration 0002とschema test
2. password/session/cookie utility
3. Origin/CSRF middleware
4. auth routes
5. organization permission routes
6. live session authorization
7.旧DB投影adapter
8. admin/master JSのtoken撤去
9. legacy endpoint無効化feature flag
10. 自動試験
11. 厳格レビュー

各項目を独立した小commitへ分けてもよい。ただし最終提出は一つのStage 3 patchとする。

## 23. 完了条件

1. 第2段階remote D1とBootstrapが完了済み、またはlocal専用試験であることを明示
2. migration 0002が空の新版DBへ適用可能
3. 二回目applyがno-op
4. 旧migration無変更
5. auth CookieがHttpOnly
6. production CookieがSecure、SameSite=Strict、Path=/、Domainなし
7. raw session tokenがJSONとLocalStorageへ出ない
8. unsafe APIがOrigin不一致を拒否
9. unsafe authenticated APIがCSRFなしを拒否
10. loginはgeneric error
11. login試行制限が動作
12. account lockが動作
13. user、organization、membership停止でlogin不可
14. session idle/absolute expiryが動作
15. logoutでsession失効
16. password変更で全session失効
17. reset tokenが一回限り
18. role権限表どおり
19. AdminがOwner/Adminを管理できない
20. 最後のOwnerを除去できない
21. Teacherが他人の授業へアクセスできない
22. 他組織のsession IDを指定しても404または403
23. requestのorganizationIdで越境できない
24. DB_V2 live sessionと旧DB投影が作成時に一致
25. 投影失敗時に成功レスポンスを返さない
26. 学生投稿が現行形式で動作
27. WebSocketが現行方式で動作
28. legacy Bearer tokenがV2有効時に使用不能
29. `/api/master/**`がV2有効時に使用不能
30. audit logに秘密値がない
31. production deploy未実施
32. 全自動試験合格
33. ZIP再展開後の再試験合格
34. Stage 3だけのpatchとcommitを作成可能

## 24. 第4段階への引継ぎ

- AuthContext形式
- Cookie名とCSRF方式
- role permission matrix
- live session正本と旧DB投影の状態
- organization境界middleware
- audit action naming
- account/session失効utility
- Stage 3で残ったprojection不整合
- 第4段階DB migration開始番号

## 25. 参考資料

Cloudflare. (2026). *Authorization cookie*. Cloudflare One documentation.

Cloudflare. (2026). *D1 Database: batch*. Cloudflare D1 documentation.

Cloudflare. (2026). *Rate Limiting*. Cloudflare Workers documentation.

OWASP Foundation. (2026). *Password Storage Cheat Sheet*. OWASP Cheat Sheet Series.

Mozilla. (2026). *Set-Cookie header*. MDN Web Docs.
