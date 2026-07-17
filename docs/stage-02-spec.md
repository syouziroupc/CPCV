# CPCV 第2段階 DB再設計仕様書

## 文書状態

- 文書名: `docs/stage-02-spec.md`
- 対象段階: 第2段階 DB再設計
- 基準ソース: `CPCV_stage01_final_clean_source.zip`
- 基準ソースSHA-256: `b8c634b6a42d38c696c782a2af67f3e764b717a694c535e13029eddf66256205`
- 本文書の状態: 実装時訂正を反映した正式設計
- 実装時訂正日: 2026-07-12

実装前検証でSQLiteの`TEXT PRIMARY KEY`は明示的な`NOT NULL`がない場合にNULLを許容することを確認した。各列一覧では主キーをNULL不可としていたため、初期migration SQLの単一列主キー6件を`TEXT NOT NULL PRIMARY KEY`へ訂正した。その他の設計方針は変更していない。

---

## 0. 採用する基本方針

次を正式方針とする。

1. 旧D1は現行版専用として残す。
2. 新版D1を別のCloudflare D1リソースとして作る。
3. 旧migrationは削除も修正もしない。
4. 新版migrationは`migrations-v2/`へ分離する。
5. 現行binding `DB`は旧D1のまま残す。
6. 新版bindingは`DB_V2`とする。
7. `users`を利用者情報の唯一の本体とする。
8. roleは`users`ではなく`organization_members`へ保存する。
9. 認証セッションは組織単位に固定する。
10. 授業は必ず一つの組織へ所属させる。
11. 授業作成者は同じ組織の所属者でなければならない。
12. 物理削除は通常運用で使用しない。
13. 日時はUTCの固定形式で保存する。
14. コメントや匿名参加者やAI関連テーブルは作らない。
15. 第1段階の画面とAPIとWorker動作は変更しない。

### 推奨案を採用する理由

利用者本体と組織内権限を分けることで、一人の利用者を複数組織へ所属させられる。認証セッションに組織を固定することで、各APIがクライアント送信の`organization_id`へ依存しなくなる。`live_sessions`には組織と作成者の複合外部キーを設定する。これにより作成者が別組織にしか所属していない授業をDBレベルで拒否できる。

### 不採用案

#### `users.role`へroleを保存する案

不採用とする。一人の利用者が組織AではOwner、組織BではTeacherになる状態を表現できない。

#### 組織ごとに同じ人物の`users`行を複製する案

不採用とする。ログインIDとパスワードの重複管理が再発する。今回解消する`teachers`と`teacher_accounts`の二重管理に近い構造になる。

#### 旧D1のmigrationを修正して使い続ける案

不採用とする。本番DBの適用履歴とSQLファイルの対応が崩れる。空DBと既存DBで結果が変わる危険が残る。

#### 認証セッションを組織非依存にする案

不採用とする。複数組織所属時に毎回クライアントが組織を指定する必要が出る。権限確認漏れの原因になる。

---

## 1. 現行DB構造と問題点

### 1.1 現行テーブル

| 現行テーブル | 役割 | 主な問題 |
|---|---|---|
| `teachers` | 授業が参照する先生 | `teacher_accounts`と二重管理 |
| `sessions` | 授業 | 組織列がない。状態遷移制約が弱い |
| `admin_audit_logs` | 先生操作ログ | 外部キーがない。Master操作を記録しない |
| `system_settings` | 設定 | 現行コードで未使用 |
| `teacher_accounts` | 先生ログイン | `teachers`とIDがずれる可能性がある |
| `teacher_sessions` | 先生認証セッション | Master用セッションと別設計 |
| `master_sessions` | Master認証セッション | 利用者本体と結び付かない |

### 1.2 migrationの問題

`0001_init.sql`は`sessions.comment_display_seconds`を作成する。`0003_add_comment_display_seconds.sql`も同じ列を追加する。このため空D1への全migration適用は`duplicate column name: comment_display_seconds`で失敗する。

### 1.3 先生情報の二重管理

Teacherログイン時に`teacher_accounts`から認証する。その後`teachers`へupsertする。`teachers.email`の競合時は名前だけが更新される。先生を削除して同じlogin IDを再作成すると、新しい`teacher_accounts.id`と古い`teachers.id`が一致しない。この状態で授業を作ると外部キー違反になる。

### 1.4 セッション設計の分離

`teacher_sessions`と`master_sessions`は別テーブルである。Masterは`users`に相当する主体を持たない。role変更や利用者停止を一つの仕組みで処理できない。

### 1.5 組織境界の欠如

現行テーブルには組織が存在しない。授業と先生を組織単位で分離できない。将来複数組織を扱うと、SQLの条件漏れだけで別組織のデータが混在する。

### 1.6 削除と停止の不整合

現行Teacher削除は`teacher_accounts`と`teacher_sessions`を物理削除する。一方で`teachers`と`sessions`と監査ログは残る。授業は`deleted`から`active`へ戻せる。`status`と`ended_at`と投稿状態の組合せも制約されていない。

---

## 2. 新しいテーブルの一覧

| テーブル | 役割 |
|---|---|
| `organizations` | 組織本体 |
| `users` | 利用者と認証情報の本体 |
| `organization_members` | 利用者の組織所属とrole |
| `auth_sessions` | Owner、Admin、Teacher共通の認証セッション |
| `password_reset_tokens` | 一回限りのパスワード再設定トークン |
| `live_sessions` | CPCVの授業 |
| `audit_logs` | 組織操作と認証操作の監査ログ |

この段階では次を作らない。

- comments
- anonymous participants
- moderation
- translations
- AI判定
- PDF分析
- WebSocket接続状態

---

## 3. 共通規則

### 3.1 主キー

全テーブルの主キーは`TEXT`とする。単一列主キーはSQLiteのNULL許容挙動を避けるため`TEXT NOT NULL PRIMARY KEY`と明示する。アプリケーション側で暗号学的乱数を使用したUUIDを生成する。ハイフンを除去し、次のprefixを付ける。

| 対象 | prefix例 |
|---|---|
| organization | `org_` |
| user | `usr_` |
| auth session | `auth_` |
| password reset token | `prt_` |
| live session | `live_` |
| audit log | `audit_` |

連番IDは使用しない。公開コードを主キーとして使用しない。

### 3.2 日時

すべてUTCで保存する。形式は次に固定する。

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

例:

```text
2026-07-12T06:30:15.123Z
```

JavaScriptでは`new Date().toISOString()`を使用する。SQLiteの`CURRENT_TIMESTAMP`は使用しない。日時列のSQL型は`TEXT`とする。日時比較は固定形式を守った値だけに対して行う。

### 3.3 boolean

D1では`INTEGER`を使用する。値は`0`または`1`に制限する。

### 3.4 外部キー

全ての親子関係へ外部キーを設定する。通常の物理削除を禁止するため、原則として`ON DELETE RESTRICT`を使用する。D1は外部キー制約を有効にした状態で動作する。migrationやimportで一時的な順序問題がある場合だけ`PRAGMA defer_foreign_keys = on`を使用する。処理終了時に違反が残れば失敗させる。(Cloudflare, 2026b)

### 3.5 UNIQUE

ログインID、認証token hash、再設定token hash、授業公開コードは全体で一意とする。

### 3.6 論理削除

通常運用では行を物理削除しない。状態列と削除日時を更新する。物理削除は保存期間経過後の専用保守処理だけに限定する。

削除処理は次の単位で行う。

- organization削除: `organizations.status='deleted'`と`deleted_at`を設定する。同組織のactiveな`live_sessions`を終了または削除する。同組織の`auth_sessions`を失効させる。membershipとaudit logは履歴として残す。
- user削除: 最後のactive Ownerでないことを確認する。`users.status='deleted'`と`deleted_at`を設定する。全`auth_sessions`と未使用reset tokenを失効させる。全membershipを`removed`へ変更する。
- membership解除: `status='removed'`と`removed_at`を設定する。対象組織のauth sessionを失効させる。
- live session削除: `status='deleted'`へ変更する。`posting_enabled=0`と`comments_visible=0`を設定する。`ended_at`と`deleted_at`を設定する。

複数行更新は第3段階以降の実装でD1 batchを使用する。途中失敗時に一部だけ削除状態へ進めない。

---

## 4. `organizations`

### 4.1 列

| 列 | 型 | NULL | 内容 |
|---|---|---:|---|
| `id` | TEXT | 不可 | 主キー |
| `name` | TEXT | 不可 | 組織名。1〜120文字 |
| `status` | TEXT | 不可 | `active`、`suspended`、`deleted` |
| `created_at` | TEXT | 不可 | 作成日時 |
| `updated_at` | TEXT | 不可 | 最終更新日時 |
| `deleted_at` | TEXT | 可 | 論理削除日時 |

### 4.2 制約

- 主キー: `id`
- `updated_at`は`created_at`以後
- `deleted_at`はNULLまたは`created_at`以後
- `status='deleted'`では`deleted_at`必須
- `active`または`suspended`では`deleted_at`をNULLとする
- 組織名はUNIQUEにしない。同名組織を許可する

### 4.3 INDEX

```sql
CREATE INDEX idx_organizations_status
  ON organizations(status, created_at);
```

---

## 5. `users`

### 5.1 列

| 列 | 型 | NULL | 内容 |
|---|---|---:|---|
| `id` | TEXT | 不可 | 主キー |
| `login_id` | TEXT | 不可 | 全体で一意のログインID |
| `display_name` | TEXT | 不可 | 表示名。1〜80文字 |
| `password_scheme` | TEXT | 不可 | ハッシュ方式と版 |
| `password_hash` | TEXT | 不可 | パスワードハッシュ |
| `password_salt` | TEXT | 不可 | Salt |
| `password_changed_at` | TEXT | 不可 | パスワード設定または変更日時 |
| `status` | TEXT | 不可 | `active`、`suspended`、`deleted` |
| `created_at` | TEXT | 不可 | 作成日時 |
| `updated_at` | TEXT | 不可 | 最終更新日時 |
| `deleted_at` | TEXT | 可 | 論理削除日時 |

### 5.2 login ID規則

- 1〜64文字
- 保存前にtrimする
- 小文字へ正規化する
- 許可文字は`a-z`、`0-9`、`.`、`_`、`-`
- `COLLATE NOCASE UNIQUE`を設定する
- UI側の確認だけに依存しない

### 5.3 パスワード列

`password_scheme`を持たせる。既存データを移行する場合は現行方式を次のように識別する。

```text
pbkdf2-sha256-100000-v1
```

新規パスワードの反復回数は第3段階で正式決定する。新版スキーマは方式を固定しない。平文パスワードは保存しない。

### 5.4 roleを置かない理由

利用者のroleは組織ごとに異なる。`users`へroleを置くと複数組織所属を表現できない。roleは`organization_members`だけに保存する。

### 5.5 INDEX

`login_id`のUNIQUE indexは自動作成される。追加INDEXは次とする。

```sql
CREATE INDEX idx_users_status
  ON users(status, created_at);
```

---

## 6. `organization_members`

### 6.1 列

| 列 | 型 | NULL | 内容 |
|---|---|---:|---|
| `organization_id` | TEXT | 不可 | 組織ID |
| `user_id` | TEXT | 不可 | 利用者ID |
| `role` | TEXT | 不可 | `owner`、`admin`、`teacher` |
| `status` | TEXT | 不可 | `active`、`suspended`、`removed` |
| `created_at` | TEXT | 不可 | 所属作成日時 |
| `updated_at` | TEXT | 不可 | 最終更新日時 |
| `removed_at` | TEXT | 可 | 所属解除日時 |

### 6.2 主キー

複合主キーとする。

```sql
PRIMARY KEY (organization_id, user_id)
```

同じ利用者を同じ組織へ重複登録できない。

### 6.3 外部キー

- `organization_id` → `organizations.id`
- `user_id` → `users.id`
- どちらも`ON DELETE RESTRICT`

### 6.4 role

| role | 想定権限 |
|---|---|
| `owner` | 組織所有。OwnerとAdminとTeacherの管理。組織設定 |
| `admin` | 組織管理。Teacher管理。授業管理 |
| `teacher` | 自分の授業作成と操作 |

詳細な権限表は第3段階で確定する。

### 6.5 status

- `active`: 権限を使用できる
- `suspended`: 所属は残るが権限を使用できない
- `removed`: 所属解除済み

`removed`では`removed_at`を必須にする。再所属時は同じ行を`active`へ戻し、`removed_at=NULL`とする。再所属操作は監査ログへ残す。

### 6.6 INDEX

```sql
CREATE INDEX idx_organization_members_user_status
  ON organization_members(user_id, status, organization_id);

CREATE INDEX idx_organization_members_org_role_status
  ON organization_members(organization_id, role, status);
```

---

## 7. `auth_sessions`

### 7.1 列

| 列 | 型 | NULL | 内容 |
|---|---|---:|---|
| `id` | TEXT | 不可 | 主キー |
| `organization_id` | TEXT | 不可 | この認証セッションで使用する組織 |
| `user_id` | TEXT | 不可 | 利用者ID |
| `token_hash` | TEXT | 不可 | 認証tokenのSHA-256 hash |
| `csrf_token_hash` | TEXT | 不可 | CSRF tokenのhash |
| `created_at` | TEXT | 不可 | 作成日時 |
| `last_seen_at` | TEXT | 不可 | 最終利用日時 |
| `idle_expires_at` | TEXT | 不可 | アイドル失効日時 |
| `absolute_expires_at` | TEXT | 不可 | 絶対失効日時 |
| `revoked_at` | TEXT | 可 | 明示失効日時 |

### 7.2 組織固定

認証セッションは一つの組織へ固定する。複数組織へ所属する利用者が組織を切り替える場合は、所属を再確認したうえで新しい認証セッションを発行する。古いセッションを継続使用して`organization_id`だけを書き換えない。

### 7.3 外部キー

```sql
FOREIGN KEY (organization_id, user_id)
  REFERENCES organization_members(organization_id, user_id)
  ON DELETE RESTRICT
```

これにより利用者が所属していない組織の認証セッションをDBレベルで作れない。ただし所属の`status`とroleは外部キーでは判定できない。第3段階の認証処理で毎回確認する。

### 7.4 UNIQUE

- `token_hash`
- `csrf_token_hash`

生tokenはDBへ保存しない。

### 7.5 INDEX

```sql
CREATE INDEX idx_auth_sessions_user_org_expiry
  ON auth_sessions(user_id, organization_id, absolute_expires_at);

CREATE INDEX idx_auth_sessions_org_expiry
  ON auth_sessions(organization_id, absolute_expires_at);

CREATE INDEX idx_auth_sessions_idle_expiry
  ON auth_sessions(idle_expires_at);

CREATE INDEX idx_auth_sessions_absolute_expiry
  ON auth_sessions(absolute_expires_at);
```

### 7.6 有効判定

第3段階では次を全て満たす場合だけ有効とする。

- `revoked_at IS NULL`
- 現在時刻が`idle_expires_at`未満
- 現在時刻が`absolute_expires_at`未満
- `users.status='active'`
- `organizations.status='active'`
- `organization_members.status='active'`

roleは`organization_members.role`から取得する。認証セッションへroleを複製しない。

---

## 8. `password_reset_tokens`

### 8.1 列

| 列 | 型 | NULL | 内容 |
|---|---|---:|---|
| `id` | TEXT | 不可 | 主キー |
| `user_id` | TEXT | 不可 | 対象利用者 |
| `token_hash` | TEXT | 不可 | 一回限りtokenのhash |
| `created_by_user_id` | TEXT | 可 | 発行主体。system発行ではNULL |
| `created_at` | TEXT | 不可 | 発行日時 |
| `expires_at` | TEXT | 不可 | 期限 |
| `used_at` | TEXT | 可 | 使用日時 |
| `revoked_at` | TEXT | 可 | 失効日時 |

### 8.2 制約

- `token_hash`はUNIQUE
- `used_at`と`revoked_at`を同時に設定しない
- `used_at`は期限内だけ許可する
- 生tokenを保存しない
- 使用時は未使用、未失効、期限内を条件に更新する
- 使用済みtokenを再利用できない

### 8.3 複数組織利用者への注意

パスワードは`users`に属する全体共通資格情報である。一組織のAdminが既存利用者のパスワードを直接変更すると、他組織のログインにも影響する。このため推奨方針は次とする。

- 利用者本人の再設定を基本とする
- 組織管理者は所属停止と招待再発行を行う
- 既存利用者の平文パスワードを管理者へ表示しない
- 運用者による緊急復旧は別途監査する

正式な再設定フローは第3段階で決める。

### 8.4 INDEX

```sql
CREATE INDEX idx_password_reset_tokens_user_expires
  ON password_reset_tokens(user_id, expires_at);

CREATE INDEX idx_password_reset_tokens_expires
  ON password_reset_tokens(expires_at);
```

---

## 9. `live_sessions`

### 9.1 列

| 列 | 型 | NULL | 内容 |
|---|---|---:|---|
| `id` | TEXT | 不可 | 主キー |
| `organization_id` | TEXT | 不可 | 所属組織 |
| `created_by_user_id` | TEXT | 不可 | 作成者 |
| `public_code` | TEXT | 不可 | 学生参加用6文字コード |
| `title` | TEXT | 不可 | 授業名。1〜80文字 |
| `posting_enabled` | INTEGER | 不可 | 投稿受付。0または1 |
| `comments_visible` | INTEGER | 不可 | コメント表示。0または1 |
| `comment_display_seconds` | INTEGER | 不可 | 10〜300秒 |
| `comment_display_mode` | TEXT | 不可 | `stack3`、`stack5`、`stack7`、`scroll` |
| `status` | TEXT | 不可 | `active`、`ended`、`deleted` |
| `created_at` | TEXT | 不可 | 作成日時 |
| `updated_at` | TEXT | 不可 | 最終更新日時 |
| `started_at` | TEXT | 不可 | 開始日時 |
| `expires_at` | TEXT | 不可 | 利用期限 |
| `ended_at` | TEXT | 可 | 終了日時 |
| `deleted_at` | TEXT | 可 | 論理削除日時 |

### 9.2 組織所属

`organization_id`はNOT NULLとする。全ての授業は必ず一つの組織へ所属する。

### 9.3 作成者と組織の整合

次の複合外部キーを設定する。

```sql
FOREIGN KEY (organization_id, created_by_user_id)
  REFERENCES organization_members(organization_id, user_id)
  ON DELETE RESTRICT
```

これにより別組織の利用者IDを作成者として設定できない。

### 9.4 公開コード

- 全体でUNIQUE
- 6文字
- 大文字
- 使用文字は`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- `I`、`O`、`0`、`1`を使用しない

学生画面は組織IDを入力しないため、公開コードは組織内UNIQUEではなく全体UNIQUEとする。

### 9.5 status

| 保存status | 意味 |
|---|---|
| `active` | 稼働中 |
| `ended` | 正常終了 |
| `deleted` | 論理削除 |

`expired`はDBへ保存しない。`status='active'`かつ現在時刻が`expires_at`以後の場合に、APIが有効状態として`expired`を算出する。時刻経過だけでDB更新を発生させない。

### 9.6 状態遷移

許可する遷移は次だけとする。

```text
active -> ended
active -> deleted
ended  -> deleted
```

次は禁止する。

```text
ended  -> active
deleted -> active
deleted -> ended
```

`ended`または`deleted`では`posting_enabled=0`かつ`comments_visible=0`をDB制約で要求する。

日時の整合は次とする。

- `active`: `ended_at=NULL`、`deleted_at=NULL`
- `ended`: `ended_at`必須、`deleted_at=NULL`
- `deleted`: `ended_at`必須、`deleted_at`必須

稼働中授業を直接削除する場合は、同じ処理で`ended_at`と`deleted_at`を設定する。

### 9.7 INDEX

```sql
CREATE INDEX idx_live_sessions_org_status_created
  ON live_sessions(organization_id, status, created_at DESC);

CREATE INDEX idx_live_sessions_creator_status_created
  ON live_sessions(created_by_user_id, status, created_at DESC);

CREATE INDEX idx_live_sessions_expires
  ON live_sessions(expires_at);
```

---

## 10. `audit_logs`

### 10.1 列

| 列 | 型 | NULL | 内容 |
|---|---|---:|---|
| `id` | TEXT | 不可 | 主キー |
| `organization_id` | TEXT | 可 | 対象組織。全体操作ではNULL |
| `actor_type` | TEXT | 不可 | `user`または`system` |
| `actor_user_id` | TEXT | 可 | 操作者利用者ID |
| `actor_role` | TEXT | 可 | 操作時点のrole snapshot |
| `action` | TEXT | 不可 | 操作名 |
| `target_type` | TEXT | 可 | 対象種別 |
| `target_id` | TEXT | 可 | 対象ID |
| `details_json` | TEXT | 可 | 補助情報。正しいJSONだけ許可 |
| `created_at` | TEXT | 不可 | 発生日時 |

### 10.2 方針

- 監査ログは更新しない
- 通常運用では削除しない
- パスワード、生token、CSRF tokenを記録しない
- `details_json`には必要最小限の情報だけ保存する
- IP保存方針は第3段階で決める
- `target_type`と`target_id`は多態参照のため外部キーを設定しない

### 10.3 actor整合

- `actor_type='system'`では`actor_user_id=NULL`かつ`actor_role=NULL`
- `actor_type='user'`では`actor_user_id`必須
- `actor_role`は`owner`、`admin`、`teacher`またはNULL

### 10.4 INDEX

```sql
CREATE INDEX idx_audit_logs_org_created
  ON audit_logs(organization_id, created_at DESC);

CREATE INDEX idx_audit_logs_actor_created
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX idx_audit_logs_target_created
  ON audit_logs(target_type, target_id, created_at DESC);
```

---

## 11. 主キー、外部キー、UNIQUE制約の一覧

| テーブル | 主キー | 外部キー | UNIQUE |
|---|---|---|---|
| `organizations` | `id` | なし | なし |
| `users` | `id` | なし | `login_id` |
| `organization_members` | `(organization_id,user_id)` | organization、user | 複合主キーと同じ |
| `auth_sessions` | `id` | membership複合FK | `token_hash`、`csrf_token_hash` |
| `password_reset_tokens` | `id` | user、created_by user | `token_hash` |
| `live_sessions` | `id` | organization、membership複合FK | `public_code` |
| `audit_logs` | `id` | organization、actor user | なし |

---

## 12. 組織とユーザーの関係

`organizations`と`users`は多対多である。関係は`organization_members`で表現する。

```text
organizations 1 --- N organization_members N --- 1 users
```

一人の利用者は複数組織へ所属できる。各所属行は独立したroleとstatusを持つ。

例:

| user | organization | role | status |
|---|---|---|---|
| U1 | Organization A | owner | active |
| U1 | Organization B | teacher | active |
| U1 | Organization C | admin | suspended |

`users.status='suspended'`は全組織で利用不可を意味する。`organization_members.status='suspended'`は対象組織だけ利用不可を意味する。

---

## 13. 一人のユーザーが複数組織に所属する場合

認証セッションは一つの組織だけを持つ。

### 13.1 ログイン時

1. login IDとパスワードを検証する。
2. activeな所属を取得する。
3. 所属が一つならその組織を選ぶ。
4. 複数なら利用者へ候補を表示する。
5. 選択値をサーバーで再検証する。
6. 検証済みの`organization_id`を`auth_sessions`へ保存する。

クライアントが送った組織IDは選択候補としてのみ扱う。権限根拠にはしない。

### 13.2 組織切替

組織切替では新しい認証セッションを発行する。新しい所属のstatusを再確認する。古いセッションは失効させるか、別組織用として明示的に管理する。第3段階では一ブラウザ一組織セッションを推奨する。

---

## 14. 一つの授業を必ず一つの組織へ所属させる仕組み

次の三層で強制する。

### DB

- `live_sessions.organization_id NOT NULL`
- `organizations.id`への外部キー
- `(organization_id,created_by_user_id)`から`organization_members`への複合外部キー

### API

- 作成時の組織は`auth_sessions.organization_id`を使用する
- request bodyの`organization_id`は使用しない
- 取得と更新では`WHERE id=? AND organization_id=?`を使用する
- 組織IDは認証セッションから取得する

### テスト

- 他組織の授業IDを指定しても404または403
- 別組織の利用者を作成者にしたINSERTは外部キー違反
- 組織IDなしのINSERTはNOT NULL違反

---

## 15. Owner、Admin、Teacherを後から実装できる構造

roleは`organization_members.role`へ保存する。認証のたびに所属行を確認する。roleをauth sessionへ複製しない。これによりrole変更を既存セッションへ即時反映できる。

### 最低限の不変条件

- activeな組織にはactiveなOwnerを最低一人残す
- 最後のOwnerを削除、停止、降格できない
- Owner自身の削除でも同じ条件を適用する
- AdminはOwnerを作成、削除、降格できない
- Teacherは他利用者の所属を変更できない

「最後のOwner」制約は複数行集計が必要である。単純なCHECK制約では実装しない。第3段階で条件付きUPDATEとD1 batchを使用し、競合試験を追加する。

D1の`batch()`は複数statementを一つのtransactionとして実行し、途中失敗時は全体をrollbackする。初回Owner作成や複数行の状態変更に使用する。(Cloudflare, 2026a)

---

## 16. 初回Ownerを安全に作成する方法

### 16.1 正式方針

初回Ownerをmigrationへ書かない。SQLやGit管理ファイルへパスワードを記載しない。`MASTER_TOKEN`をOwnerパスワードへ流用しない。

第2段階の実装時に一回限りの`bootstrap-owner`ユーティリティを用意する。ユーティリティは次を満たす。

1. remote実行は明示的な`--remote`指定を必要とする。
2. 組織名、login ID、表示名を対話入力または引数で受け取る。
3. パスワードは端末の非表示入力から受け取る。
4. 平文パスワードを引数、環境変数、SQL、ログへ出さない。
5. password hashとsaltをローカルで生成する。
6. organization、user、owner membership、audit logを一つのD1 batchで作成する。
7. 対象DBに既存organizationがある場合は標準で拒否する。
8. 同じlogin IDが存在する場合は拒否する。
9. 成功後もパスワードを表示しない。
10. bootstrap用のHTTP endpointを本番Workerへ残さない。

### 16.2 作成順

```text
users
  -> organizations
  -> organization_members(role=owner,status=active)
  -> audit_logs(actor_type=system, action=organization.bootstrap)
```

外部キー上はorganizationを先に作ってもよい。実装では全statementを一つのbatchへ含める。

### 16.3 不採用案

- migrationへ初期パスワードを書く
- `.dev.vars`へ固定初期パスワードを保存する
- 公開bootstrap APIを作る
- 初回ログイン後も固定パスワードを使い続ける
- Ownerを`MASTER_TOKEN`だけで表現する

---

## 17. 旧D1と新版D1を分離する方法

### 17.1 リソース

| 用途 | binding | database name | migration directory |
|---|---|---|---|
| 現行版 | `DB` | `class_comment_db` | `migrations/` |
| 新版 | `DB_V2` | `class_comment_db_v2` | `migrations-v2/` |

Cloudflare Workersは一つのWorkerへ複数のD1 bindingを設定できる。各bindingには別のdatabase IDを指定できる。`migrations_dir`もbindingごとに指定できる。(Cloudflare, 2026c, 2026g)

### 17.2 分離規則

- `migrations/*.sql`を`DB_V2`へ適用しない
- `migrations-v2/*.sql`を`DB`へ適用しない
- 第2段階では現行コードは`env.DB`だけを使用する
- `env.DB_V2`はスキーマ構築と試験だけに使用する
- 旧D1のdatabase IDを変更しない
- 新版D1へ旧D1と同じdatabase IDを設定しない
- 本番切替は第3段階以降の別作業とする

### 17.3 新版DB名

正式名称は次とする。

```text
class_comment_db_v2
```

Japan中心の現行利用を基準に、作成時のlocation hintは`apac`を推奨する。データ所在地に別要件がある場合は作成前に変更する。D1 databaseは`wrangler d1 create`で作成し、返されたdatabase IDを設定へ記録する。(Cloudflare, 2026f)

---

## 18. `wrangler.toml`の変更案

現行bindingを残し、その下へ新版bindingを追加する。

```toml
[[d1_databases]]
binding = "DB"
database_name = "class_comment_db"
database_id = "f11457fa-27af-468d-94cc-6cdf1ae814e4"

[[d1_databases]]
binding = "DB_V2"
database_name = "class_comment_db_v2"
database_id = "<wrangler d1 createで取得したUUID>"
migrations_dir = "migrations-v2"
```

`<...>`のplaceholderをコミットしたまま完了扱いにしない。新版D1を作成できない環境では、実DB ID未確定と明記して実装未完了とする。

### 18.1 GitHub Actions

第2段階では旧DBへのremote migrationと本番deployを変更しない。新版DBのremote migrationをmain pushへ自動追加しない。

PRのcheckには次だけ追加してよい。

- 空のlocal DBへの`DB_V2` migration適用
- schema test
- 二回目applyがno-opになる確認

本番用remote applyは手動承認付き運用を別途決める。

---

## 19. migrationファイルの構成案

### 19.1 正式構成

```text
migrations/                         旧D1用。変更しない
migrations-v2/
└─ 0001_initial_schema.sql          新版D1の全7テーブルとINDEX
```

初期スキーマは一つのmigrationへまとめる。理由は次のとおり。

- 新版D1は空から開始する
- 7テーブルは同じ設計単位である
- 初回migration失敗時に全体をrollbackしやすい
- テーブルだけ作成されINDEXがない中間状態を避ける

D1 migration applyは未適用ファイルだけを適用する。適用中のmigrationが失敗した場合はそのmigrationをrollbackし、以前に成功したmigrationは残る。適用前にはbackupも取得される。(Cloudflare, 2026c, 2026f)

### 19.2 同じmigrationの再実行

`wrangler d1 migrations apply`を二回実行する。二回目は未適用migrationなしで終了することを期待する。SQLへ大量の`IF NOT EXISTS`を付けて差異を隠さない。

一度でも共有環境へ適用したmigrationファイルは書き換えない。変更が必要な場合は`0002_...sql`を追加する。

### 19.3 初期migration SQL

```sql
CREATE TABLE organizations (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (
    (status = 'deleted' AND deleted_at IS NOT NULL)
    OR
    (status IN ('active', 'suspended') AND deleted_at IS NULL)
  )
);

CREATE TABLE users (
  id TEXT NOT NULL PRIMARY KEY,
  login_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  password_scheme TEXT NOT NULL CHECK (length(password_scheme) BETWEEN 1 AND 64),
  password_hash TEXT NOT NULL CHECK (length(password_hash) BETWEEN 16 AND 512),
  password_salt TEXT NOT NULL CHECK (length(password_salt) BETWEEN 8 AND 256),
  password_changed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (length(login_id) BETWEEN 1 AND 64),
  CHECK (login_id = lower(trim(login_id))),
  CHECK (login_id NOT GLOB '*[^a-z0-9._-]*'),
  CHECK (password_changed_at >= created_at),
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (
    (status = 'deleted' AND deleted_at IS NOT NULL)
    OR
    (status IN ('active', 'suspended') AND deleted_at IS NULL)
  )
);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'teacher')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT,
  PRIMARY KEY (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (updated_at >= created_at),
  CHECK (removed_at IS NULL OR removed_at >= created_at),
  CHECK (
    (status = 'removed' AND removed_at IS NOT NULL)
    OR
    (status IN ('active', 'suspended') AND removed_at IS NULL)
  )
);

CREATE TABLE auth_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (organization_id, user_id)
    REFERENCES organization_members(organization_id, user_id)
    ON DELETE RESTRICT,
  CHECK (last_seen_at >= created_at),
  CHECK (idle_expires_at > last_seen_at),
  CHECK (absolute_expires_at > created_at),
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE password_reset_tokens (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at),
  CHECK (used_at IS NULL OR used_at <= expires_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE TABLE live_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  public_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  posting_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (posting_enabled IN (0, 1)),
  comments_visible INTEGER NOT NULL DEFAULT 1
    CHECK (comments_visible IN (0, 1)),
  comment_display_seconds INTEGER NOT NULL DEFAULT 60
    CHECK (comment_display_seconds BETWEEN 10 AND 300),
  comment_display_mode TEXT NOT NULL DEFAULT 'stack3'
    CHECK (comment_display_mode IN ('stack3', 'stack5', 'stack7', 'scroll')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by_user_id)
    REFERENCES organization_members(organization_id, user_id)
    ON DELETE RESTRICT,
  CHECK (length(public_code) = 6),
  CHECK (public_code = upper(public_code)),
  CHECK (public_code NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'),
  CHECK (updated_at >= created_at),
  CHECK (started_at >= created_at),
  CHECK (expires_at > started_at),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (deleted_at IS NULL OR deleted_at >= ended_at),
  CHECK (
    (status = 'active' AND ended_at IS NULL AND deleted_at IS NULL)
    OR
    (status = 'ended' AND ended_at IS NOT NULL AND deleted_at IS NULL)
    OR
    (status = 'deleted' AND ended_at IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CHECK (
    status = 'active'
    OR (posting_enabled = 0 AND comments_visible = 0)
  )
);

CREATE TABLE audit_logs (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system')),
  actor_user_id TEXT,
  actor_role TEXT CHECK (actor_role IS NULL OR actor_role IN ('owner', 'admin', 'teacher')),
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 100),
  target_type TEXT CHECK (target_type IS NULL OR length(trim(target_type)) BETWEEN 1 AND 64),
  target_id TEXT CHECK (target_id IS NULL OR length(target_id) BETWEEN 1 AND 128),
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (
    (actor_type = 'system' AND actor_user_id IS NULL AND actor_role IS NULL)
    OR
    (actor_type = 'user' AND actor_user_id IS NOT NULL)
  )
);

CREATE INDEX idx_organizations_status
  ON organizations(status, created_at);

CREATE INDEX idx_users_status
  ON users(status, created_at);

CREATE INDEX idx_organization_members_user_status
  ON organization_members(user_id, status, organization_id);

CREATE INDEX idx_organization_members_org_role_status
  ON organization_members(organization_id, role, status);

CREATE INDEX idx_auth_sessions_user_org_expiry
  ON auth_sessions(user_id, organization_id, absolute_expires_at);

CREATE INDEX idx_auth_sessions_org_expiry
  ON auth_sessions(organization_id, absolute_expires_at);

CREATE INDEX idx_auth_sessions_idle_expiry
  ON auth_sessions(idle_expires_at);

CREATE INDEX idx_auth_sessions_absolute_expiry
  ON auth_sessions(absolute_expires_at);

CREATE INDEX idx_password_reset_tokens_user_expires
  ON password_reset_tokens(user_id, expires_at);

CREATE INDEX idx_password_reset_tokens_expires
  ON password_reset_tokens(expires_at);

CREATE INDEX idx_live_sessions_org_status_created
  ON live_sessions(organization_id, status, created_at DESC);

CREATE INDEX idx_live_sessions_creator_status_created
  ON live_sessions(created_by_user_id, status, created_at DESC);

CREATE INDEX idx_live_sessions_expires
  ON live_sessions(expires_at);

CREATE INDEX idx_audit_logs_org_created
  ON audit_logs(organization_id, created_at DESC);

CREATE INDEX idx_audit_logs_actor_created
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX idx_audit_logs_target_created
  ON audit_logs(target_type, target_id, created_at DESC);

PRAGMA optimize;
```

CloudflareはINDEX作成後に`PRAGMA optimize`を実行し、query planner用統計を更新することを推奨している。(Cloudflare, 2026e)

---

## 20. 空のD1から構築する手順

### 20.1 新版remote D1作成

```bash
npx wrangler d1 create class_comment_db_v2 --location=apac
```

返されたdatabase IDを`wrangler.toml`の`DB_V2`へ設定する。`wrangler d1 create`は新しいD1を作成し、bindingへ使用するUUIDを返す。(Cloudflare, 2026f)

### 20.2 local空DB作成

既存persist directoryを削除してから実行する。

```bash
rm -rf .stage02-d1
npx wrangler d1 migrations apply DB_V2 \
  --local \
  --persist-to .stage02-d1
```

Windows PowerShellでは次を使用する。

```powershell
Remove-Item .stage02-d1 -Recurse -Force -ErrorAction SilentlyContinue
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage02-d1
```

### 20.3 二回目apply

```bash
npx wrangler d1 migrations apply DB_V2 \
  --local \
  --persist-to .stage02-d1
```

未適用migrationがないことを確認する。

### 20.4 schema確認

```bash
npx wrangler d1 execute DB_V2 \
  --local \
  --persist-to .stage02-d1 \
  --command="SELECT name, type, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;"
```

### 20.5 外部キーと整合性

```bash
npx wrangler d1 execute DB_V2 \
  --local \
  --persist-to .stage02-d1 \
  --command="PRAGMA foreign_key_check;"

npx wrangler d1 execute DB_V2 \
  --local \
  --persist-to .stage02-d1 \
  --command="PRAGMA integrity_check;"
```

期待値:

- `foreign_key_check`: 0行
- `integrity_check`: `ok`

Wranglerは`d1 execute`でSQL commandまたはSQL fileをlocalまたはremote D1へ実行できる。(Cloudflare, 2026f)

### 20.6 remote適用

remote適用はlocal試験合格後だけ実施する。

```bash
npx wrangler d1 migrations list DB_V2 --remote
npx wrangler d1 migrations apply DB_V2 --remote
```

本番Workerのdeployは行わない。

---

## 21. migration失敗時の戻し方

### 21.1 local DB

`.stage02-d1`を削除する。SQLを修正する。空DBから再適用する。

### 21.2 新版remote DBが未使用の場合

まだOwnerも実データも存在せず、Workerから参照されていない場合は次を推奨する。

1. 失敗内容を記録する。
2. 新版D1を削除する。
3. 同名または修正版名で作り直す。
4. 新しいdatabase IDを`wrangler.toml`へ反映する。
5. 空DBから再適用する。

旧D1は操作しない。

### 21.3 新版remote DBにデータがある場合

適用済みmigrationを編集しない。次のどちらかを使用する。

- forward migrationを追加する
- D1 Time Travelで適用前へrestoreする

D1 Time Travelはproduction backendで直近30日以内の任意の分までrestoreできる。常時有効である。restoreはDBをその場で上書きする破壊的操作なので、対象DBと時刻を二重確認する。(Cloudflare, 2026d)

例:

```bash
npx wrangler d1 time-travel info class_comment_db_v2 \
  --timestamp="2026-07-12T06:00:00.000Z"

npx wrangler d1 time-travel restore class_comment_db_v2 \
  --timestamp="2026-07-12T06:00:00.000Z"
```

### 21.4 D1 migration自身の失敗

Cloudflareのmigration applyは失敗したmigrationをrollbackし、それ以前に成功したmigrationを残す。失敗後にDB状態を確認し、勝手に成功扱いにしない。(Cloudflare, 2026c, 2026f)

---

## 22. 旧データを移行する場合の方法

旧データ移行は第2段階の必須作業ではない。必要になった場合だけ別スクリプトで実施する。migrationファイルへ旧データ移行ロジックを混在させない。

### 22.1 移行前提

現行ソースだけでは各先生がどの組織へ所属するか分からない。組織名も確定できない。この情報は不明である。移行前に運用者が次を作成する。

```text
legacy teacher account ID -> new organization ID
legacy teacher account ID -> new user ID
legacy session ID -> new live session ID
```

現在の運用が実質一組織である場合でも、組織名とOwnerは運用者が明示する。自動推測しない。

### 22.2 データ源の優先順位

利用者情報は`teacher_accounts`を正とする。`teachers`を利用者本体として移行しない。

| 旧列 | 新列 |
|---|---|
| `teacher_accounts.id` | `users.id`またはmapping先 |
| `login_id` | `users.login_id` |
| `display_name` | `users.display_name` |
| `password_hash` | `users.password_hash` |
| `password_salt` | `users.password_salt` |
| `active=1` | `users.status='active'` |
| `active=0` | `users.status='suspended'` |

移行したhashには次を設定する。

```text
password_scheme = pbkdf2-sha256-100000-v1
```

### 22.3 `teachers`と`teacher_accounts`の不一致

次のケースを自動確定しない。

- `sessions.teacher_id`が`teacher_accounts.id`に存在しない
- 同じlogin IDを削除後に再作成した形跡がある
- `teachers.email`と現行login IDの対応が一意でない
- 先生行はあるがaccountがない

移行スクリプトは事前レポートを出す。不一致行は`unresolved`として停止する。勝手に別利用者へ割り当てない。

### 22.4 授業移行

| 旧列 | 新列 |
|---|---|
| `sessions.id` | `live_sessions.id`またはmapping先 |
| `teacher_id` | `created_by_user_id` |
| mapping組織 | `organization_id` |
| `public_code` | `public_code` |
| `title` | `title` |
| `posting_enabled` | 同名列 |
| `comments_visible` | 同名列 |
| `comment_display_seconds` | 同名列 |
| `comment_display_mode` | 同名列 |
| `status` | status mapping |
| `created_at` | `created_at`と`started_at` |
| `created_at + 6時間` | `expires_at` |
| `ended_at` | `ended_at` |

`deleted`行では`deleted_at`が旧DBにない。移行実行日時を`deleted_at`へ入れるか、移行対象外にする。どちらを採用するかは移行開始前に決める。現時点では未決定とする。

### 22.5 認証セッション

次は移行しない。

- `teacher_sessions`
- `master_sessions`

新版切替時に全利用者へ再ログインを要求する。

### 22.6 audit log

`admin_audit_logs`は外部キーと組織情報が不足する。mappingが確定した行だけ移行する。Master操作は旧DBに記録されていないため復元不能である。

### 22.7 移行方式

1. 旧D1をread onlyとしてexportする。
2. 移行前検査レポートを作る。
3. mapping fileを人が確認する。
4. 新版D1の空または専用staging DBへ移行する。
5. row countと参照整合を確認する。
6. 本番移行前に再度exportする。
7. 移行は再実行可能にする。
8. 失敗時は新版DBだけを破棄またはrestoreする。

旧D1を直接更新しない。

---

## 23. 自動テスト項目

### 23.1 migration

- 空local D1へ全migrationを適用できる
- 二回目applyで未適用migrationがない
- 7テーブルが存在する
- 必要なINDEXが存在する
- `PRAGMA foreign_key_check`が0行
- `PRAGMA integrity_check`が`ok`
- 旧`migrations/`の内容が変更されていない

### 23.2 users

- 同じlogin IDを二回登録できない
- 大文字小文字だけ違うlogin IDを登録できない
- 空login IDを登録できない
- 許可外文字を含むlogin IDを登録できない
- 不正なuser statusを登録できない
- `deleted`で`deleted_at=NULL`を拒否する

### 23.3 organizations

- 不正なorganization statusを拒否する
- 空組織名を拒否する
- `deleted`で`deleted_at=NULL`を拒否する

### 23.4 organization members

- 同じ利用者を同じ組織へ重複登録できない
- 同じ利用者を別組織へ登録できる
- 存在しないorganizationを拒否する
- 存在しないuserを拒否する
- 不正roleを拒否する
- 不正statusを拒否する
- `removed`で`removed_at=NULL`を拒否する

### 23.5 auth sessions

- membershipがない組織でsessionを作れない
- token hash重複を拒否する
- CSRF token hash重複を拒否する
- idle期限が最終利用日時以前なら拒否する
- idle期限が絶対期限を超える場合は拒否する
- revoked日時が作成日時より前なら拒否する

### 23.6 password reset tokens

- token hash重複を拒否する
- 存在しないuserを拒否する
- `used_at`と`revoked_at`の同時設定を拒否する
- 期限が作成日時以前なら拒否する

### 23.7 live sessions

- organizationなしを拒否する
- creatorが同じorganizationのmemberでない場合を拒否する
- 同一public codeを拒否する
- 6文字以外のpublic codeを拒否する
- 禁止文字を含むpublic codeを拒否する
- 不正display modeを拒否する
- display secondsの範囲外を拒否する
- boolean列の0と1以外を拒否する
- `ended`または`deleted`で投稿ONを拒否する
- `active`で`ended_at`がある状態を拒否する
- `ended`で`ended_at=NULL`を拒否する
- `deleted`で`deleted_at=NULL`を拒否する

### 23.8 audit logs

- system actorにuser IDを設定した行を拒否する
- user actorでuser IDがない行を拒否する
- 不正JSONを拒否する
- 存在しないactor userを拒否する

### 23.9 越境

- 組織Aだけの利用者で組織Bのauth sessionを作れない
- 組織Aだけの利用者で組織Bのlive sessionを作れない
- 一人の利用者がAとBの両方に所属する場合は、それぞれの組織用auth sessionを作れる

### 23.10 初回Owner

- organization、user、owner membership、auditが全て作成される
- 一件でも失敗した場合は全件rollbackされる
- DB、標準出力、ログに平文パスワードがない
- 二回目実行を標準で拒否する

### 23.11 INDEX

代表queryへ`EXPLAIN QUERY PLAN`を実行する。

- userの所属一覧
- 組織のOwner一覧
- 組織のactive授業一覧
- auth session token検索
- 期限切れsession cleanup
- 組織のaudit log一覧

---

## 24. 第二段階の完了条件

次を全て満たした場合だけ完了とする。

1. `docs/stage-02-spec.md`が実装と一致している。
2. `stage-02-database`ブランチで作業している。
3. 旧migrationを変更していない。
4. 新版D1が旧D1と別resourceである。
5. `DB`が旧D1を指したままである。
6. `DB_V2`が新版D1を指している。
7. `migrations-v2/0001_initial_schema.sql`が存在する。
8. 指定7テーブルだけが作成される。
9. 空local D1へ一発適用できる。
10. 二回目applyがno-opになる。
11. schema自動テストが全て成功する。
12. `PRAGMA foreign_key_check`が0行である。
13. `PRAGMA integrity_check`が`ok`である。
14. 同一login ID重複をDBが拒否する。
15. 一人の利用者を複数組織へ所属させられる。
16. 授業にorganization IDが必須である。
17. 別組織のmemberを授業作成者にできない。
18. auth sessionが一組織へ固定される。
19. status、role、booleanの不正値をDBが拒否する。
20. 論理削除日時との不整合をDBが拒否する。
21. 初回Owner作成方法に平文秘密情報がない。
22. 現行Workerの主要checkが引き続き成功する。
23. 現行APIと画面の動作を変更していない。
24. 本番Workerをdeployしていない。
25. 旧本番D1へ新版migrationを適用していない。

---

## 25. 第三段階のログイン実装へ引き継ぐ事項

### 25.1 認証DB

第3段階は`DB_V2`の次を使用する。

- `users`
- `organization_members`
- `auth_sessions`
- `password_reset_tokens`
- `audit_logs`

`teacher_accounts`、`teacher_sessions`、`master_sessions`へ新規書込みをしない。

### 25.2 組織コンテキスト

- ログイン後の組織は`auth_sessions.organization_id`
- API bodyの`organization_id`を権限根拠にしない
- 既存resourceはDBからorganization IDを取得する
- 取得と更新queryはorganization条件を必須にする
- roleとmembership statusは毎回DBから確認する

### 25.3 CookieとCSRF

- 生tokenはHttpOnly Cookieだけに保持する
- DBには`token_hash`だけ保存する
- CSRF tokenもDBにはhashだけ保存する
- LocalStorageのMasterとTeacher tokenを廃止する
- idle expiryとabsolute expiryを実装する

詳細値は第3段階仕様で決める。

### 25.4 role変更と停止

- user停止時は全組織のauth sessionを失効させる
- organization停止時はその組織のauth sessionを失効させる
- membership停止またはremoved時は対象組織のauth sessionを失効させる
- role変更時はauth sessionを残してもよいが、次requestから新roleを反映する
- 最後のactive Ownerを削除または降格できない

### 25.5 パスワード

- PBKDF2-HMAC-SHA-256を使用する
- 新規反復回数は第3段階で決める
- 旧hash移行時は`password_scheme`を見て検証する
- 旧方式でログイン成功後に新方式へrehashする案を検討する
- 管理者へ現在パスワードを表示しない

### 25.6 live sessions

第3段階で認証を新版へ切り替える際は、授業APIも`live_sessions`へ接続する必要がある。旧`teacher_accounts.id`と新`users.id`を混在させない。切替を一部だけ行うと再び外部キーと所有者が不整合になる。

学生投稿、コメント保存、WebSocketの方式は変更しない。ただしPublic APIが授業を検索する参照先を旧`sessions`から新版`live_sessions`へ切り替える時点を明示する。

### 25.7 不明または第3段階で決める事項

次は本ソースだけでは確定できない。

- 実運用上の最初の組織名
- 初回Ownerのlogin IDと表示名
- 一組織に複数Ownerを置く運用方針
- 組織管理者による既存利用者のpassword reset可否
- auth sessionのidle時間とabsolute時間
- audit logの保存期間
- IPを監査ログへ保存するか
- 旧データを実際に移行するか
- 旧データ移行時のdeleted session日時

推測で埋めない。第3段階または移行作業開始前に決定する。

---

## 参考文献

Cloudflare. (2026a, June 22). *D1 Database*. Cloudflare D1 Docs.

Cloudflare. (2026b, April 21). *Define foreign keys*. Cloudflare D1 Docs.

Cloudflare. (2026c, April 21). *Migrations*. Cloudflare D1 Docs.

Cloudflare. (2026d, April 21). *Time Travel and backups*. Cloudflare D1 Docs.

Cloudflare. (2026e, April 21). *Use indexes*. Cloudflare D1 Docs.

Cloudflare. (2026f, April 21). *Wrangler commands*. Cloudflare D1 Docs.

Cloudflare. (2026g). *Configuration: D1 databases*. Cloudflare Workers Docs.

Cloudflare. (2026h, April 21). *Environments*. Cloudflare D1 Docs.

CPCV. (2026). *CPCV 第1段階完成版ソース* [Source code archive].

CPCV. (2026). *CPCV 段階別開発指示書* [Development specification].

SQLite Project. (2025, April 30). *CREATE TABLE*. https://www.sqlite.org/lang_createtable.html
