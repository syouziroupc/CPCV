# CPCV 新版D1データベース仕様

## 1. 対象

第2段階では旧D1を変更せず、新版D1を`DB_V2`として分離した。第3段階Aでは認証保護列を追加した。Stage 4ではcomment永続化を追加した。Stage 5では手動moderationを追加した。Stage 6ではRealtime sequence、接続ticket、event保持を追加した。Stage 6.5ではメール認証。組織招待。メール変更。組織quotaを追加した。

| 項目 | 旧版 | 新版 |
|---|---|---|
| binding | `DB` | `DB_V2` |
| database name | `class_comment_db` | `class_comment_db_v2` |
| migration directory | `migrations/` | `migrations-v2/` |
| 現行Workerからの利用 | 旧互換投影 | 認証。組織。授業。コメント。Realtimeの正本 |

新版remote D1のUUIDは未確定である。`wrangler.toml`へ架空の値は入れていない。

## 2. テーブル

単一列主キーは全て`TEXT NOT NULL PRIMARY KEY`である。SQLiteでは非INTEGERの`PRIMARY KEY`だけではNULLを拒否しないため、`NOT NULL`を省略しない。

### `organizations`

組織本体を保持する。

- 主キー: `id`
- status: `active`、`suspended`、`deleted`
- 論理削除: `status='deleted'`と`deleted_at`
- 同名組織を許可する

### `users`

利用者と認証情報の唯一の本体である。roleは保持しない。

- 主キー: `id`
- UNIQUE: `login_id COLLATE NOCASE`
- 部分UNIQUE: 正規化済み`email COLLATE NOCASE`
- `email_verified_at`がある場合だけ確認済み
- status: `active`、`suspended`、`deleted`
- password: scheme、hash、saltだけを保存
- login ID: 小文字英数字と`.` `_` `-`
- `failed_login_count`: account単位の連続失敗回数。初期値0
- `locked_until`: account lock期限。lockなしはNULL
- `require_password_change`: 初期password変更要求。0または1

### `organization_members`

利用者と組織の多対多関係を保持する。

- 主キー: `(organization_id, user_id)`
- role: `owner`、`admin`、`teacher`
- status: `active`、`suspended`、`removed`
- 外部キー: organizationとuserへ`ON DELETE RESTRICT`

一人の利用者を複数組織へ所属させられる。roleとstatusは所属ごとに異なる。

### `auth_sessions`

Owner、Admin、Teacher共通の認証セッションを保持する。

- 主キー: `id`
- UNIQUE: `token_hash`、`csrf_token_hash`
- 複合外部キー: `(organization_id, user_id)`からmembership
- idle expiryとabsolute expiryを分離
- 生tokenは保存しない

クライアントが送る`organization_id`を権限根拠にしない。第3段階では認証済みsessionの`organization_id`を使用する。

### `password_reset_tokens`

一回限りの再設定tokenを保持する。

- 主キー: `id`
- UNIQUE: `token_hash`
- 対象userと発行userへ外部キー
- 使用済みと取消済みを同時に設定できない

### `live_sessions`

CPCVの授業を保持する。

- 主キー: `id`
- UNIQUE: `public_code COLLATE NOCASE`
- `organization_id`はNOT NULL
- `(organization_id, created_by_user_id)`をmembershipへ複合外部キー
- status: `active`、`ended`、`deleted`
- endedまたはdeletedでは投稿と表示を停止する

授業作成者が別組織にしか所属していないINSERTはDBが拒否する。

### `audit_logs`

組織操作と認証操作の監査記録を保持する。

- 主キー: `id`
- actor type: `user`または`system`
- `details_json`は正しいJSONだけ許可
- password、生token、CSRF tokenを記録しない
- system actorはログイン可能な全体管理者を意味しない

## 3. INDEX

INDEXは各migrationで追加する。Stage 5ではmoderation検索INDEXを追加した。Stage 6ではRealtime event、接続ticket、授業状態の検索INDEXを追加した。

- organization status
- user status
- user statusとlock期限
- userからmembershipを検索
- organization、role、statusからmembershipを検索
- auth sessionの組織、利用者、期限
- idle expiry
- absolute expiry
- password reset期限
- organization別live session
- creator別live session
- live session expiry
- organization別audit
- actor別audit
- target別audit

`login_id`、token hash、public codeのUNIQUE indexはSQLiteが自動作成する。

## 4. 日時

日時はUTCのISO 8601固定形式で保存する。

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

JavaScriptでは`new Date().toISOString()`を使用する。SQL型は`TEXT`である。

## 5. Migration

### Local

```bash
npm ci
rm -rf .stage02-d1
npm run db:v2:migrate:local
npm run db:v2:migrate:local
npm run db:v2:test
npm run db:v2:test:stage03a
```

PowerShell:

```powershell
npm ci
Remove-Item .stage02-d1 -Recurse -Force -ErrorAction SilentlyContinue
npm run db:v2:migrate:local
npm run db:v2:migrate:local
npm run db:v2:test
npm run db:v2:test:stage03a
```

二回目のapplyはno-opでなければならない。

### Remote

第2段階成果物では実行していない。実行する場合は新版D1を新規作成する。

```bash
npx wrangler d1 create class_comment_db_v2 --location=apac
```

返された実UUIDを`wrangler.toml`の`DB_V2` blockへ追加する。

```toml
database_id = "実際に返されたUUID"
```

その後に次を実行する。

```bash
npx wrangler d1 migrations list DB_V2 --remote
npx wrangler d1 migrations apply DB_V2 --remote
```

旧`DB`へ`migrations-v2`を適用してはならない。本番Workerをdeployしない。

## 6. Bootstrap Owner

### Local

```bash
npm run db:v2:bootstrap -- --persist-to .stage02-d1
```

自動試験だけは、試験プロセスが生成した一時パスワードを標準入力へ直接渡す`--password-stdin`を使用する。手作業では使用しない。シェル履歴へパスワードを含むコマンドを書かない。

### Remote

```bash
npm run db:v2:bootstrap -- --remote --database-id 実際のDB_V2_UUID
```

remoteでは次を自動確認する。

- 旧D1 UUIDではない
- Cloudflare上の実UUIDが入力値と一致する
- Cloudflare上のdatabase nameが`class_comment_db_v2`と一致する
- TTYから非表示でパスワードを入力している
- `0001_initial_schema.sql`と`0002_auth_security.sql`が適用済み
- application tableが正確に7件
- 外部キー違反が0件
- `quick_check`が`ok`
- organizationがまだ存在しない

作成する4件は一つのD1 batchへ含める。

1. organization
2. user
3. Owner membership
4. bootstrap audit log

## 7. 整合性検査

D1経由:

```bash
npx wrangler d1 execute DB_V2 --local --persist-to .stage02-d1 \
  --command="PRAGMA foreign_key_check;"

npx wrangler d1 execute DB_V2 --local --persist-to .stage02-d1 \
  --command="PRAGMA quick_check;"
```

自動試験はlocal SQLiteファイルへ補助的に`PRAGMA integrity_check`も実行する。この補助検査にはPython 3が必要である。

## 8. 第3段階Aで追加した認証基盤

- password scheme: `pbkdf2-sha256-600000-v2`
- 旧`pbkdf2-sha256-100000-v1`の検証互換
- production Cookie: `__Host-cpcv_session`
- local Cookie: `cpcv_session_dev`
- session idle期限: 2時間
- session absolute期限: 12時間
- `last_seen_at`更新間隔: 5分
- Origin完全一致検査
- CSRF token hash検査
- Owner、Admin、Teacher permission matrix
- `auth_sessions`、`users`、`organizations`、`organization_members`の一回JOIN認証middleware
- Cloudflare Rate Limiting binding用utility

第3段階Aでは既存routeとUIへ接続していない。

## 9. Stage 3で完了した事項

- login。logout。session確認API
- password変更とreset API
- account lock
- 組織member管理API
- 最後のactive Owner保護
- Worker routeのDB_V2認証
- 新旧授業DB投影
- UIのCookie認証化

## 参考文献

Cloudflare. (2026, June 8). *Migrations*. Cloudflare Developers. https://developers.cloudflare.com/d1/reference/migrations/

Cloudflare. (2026, April 21). *Define foreign keys*. Cloudflare Developers. https://developers.cloudflare.com/d1/sql-api/foreign-keys/

Cloudflare. (2026, April 21). *SQL statements*. Cloudflare Developers. https://developers.cloudflare.com/d1/sql-api/sql-statements/

Cloudflare. (2026, June 25). *Local development*. Cloudflare Developers. https://developers.cloudflare.com/d1/best-practices/local-development/

SQLite Project. (2025, April 30). *CREATE TABLE*. https://www.sqlite.org/lang_createtable.html

## Bootstrap前のschema同一性検査

Bootstrap utilityはmigration履歴とtable名だけでは判断しない。`sqlite_schema`から明示的なtableとINDEXの定義を取得し、空D1へ正式migrationを適用した基準schemaのcanonical SHA-256と照合する。table追加、列定義変更、制約変更、INDEX欠落がある場合は`DB_V2_SCHEMA_MISMATCH`で拒否する。

## 10. Stage 4で追加したコメント永続化

`0003_comments.sql`は次を追加する。

### `participants`

匿名参加者を授業単位で保持する。

- 主キー: `id`
- UNIQUE: `(live_session_id, token_hash)`
- tokenの平文は保存しない
- organizationとlive sessionへ複合外部キー
- `post_claim_id`と`next_post_at`で投稿間隔を原子的にclaimする
- 生IP、User-Agent、端末指紋を保持しない

### `comments`

コメントの正本である。

- 主キー: `id`
- UNIQUE: `(live_session_id, idempotency_key)`
- organization、live session、participantへ複合外部キー
- NFKC正規化後の本文とUnicode code point数を保持
- state: `visible`、`pending`、`hidden`、`deleted`
- `retained_until`まで保持する
- Stage 4のdefault stateは`visible`

### `comment_events`

コメントの状態変化を追跡する。

- Stage 4では`created` eventをcomment insertと同一batchで作成する
- comment削除時はcascade deleteする
- Stage 5が手動moderation eventを追加する

### Stage 4 INDEX

- `uq_live_sessions_organization_id`
- `idx_participants_session_last_seen`
- `idx_participants_retention_cleanup`
- `idx_comments_session_created`
- `idx_comments_org_created`
- `idx_comments_retention`
- `idx_comments_moderation`
- `idx_comment_events_comment_created`
- `idx_comment_events_session_created`

### Stage 4 migration確認

```bash
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage04-d1
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage04-d1
npx wrangler d1 execute DB_V2 --local --persist-to .stage04-d1 \
  --command="PRAGMA foreign_key_check; PRAGMA quick_check;"
```

二回目は`No migrations to apply`でなければならない。

## 11. Stage 5で追加した手動モデレーション

### `session_moderation_settings`

- 主キー: `(organization_id, live_session_id)`
- `moderation_mode`: `off`または`pre`
- 授業削除時にcascade delete
- 更新者userを保持

### `comment_moderation_actions`

- commentごとのappend-only action記録
- actor userとrole
- action。from state。to state
- 任意reason。最大200 Unicode code points
- expected timestampとresult timestamp
- comment削除時にcascade delete
- comment本文を複製しない

### DB guard

- pending -> visible。hidden。deleted
- visible -> hidden。deleted
- hidden -> visible。deleted
- deleted -> hidden
- state変更時は`updated_at`が必ず前進
- deleted -> visibleを直接許可しない

### Remote確認

production deploy前に`verify-remote-d1.mjs`が次を確認する。

- migration `0006_manual_moderation`の記録
- Stage 5 table
- moderation transition trigger
- moderation timestamp trigger
- foreign key。quick check。active Owner


## 12. Stage 6で追加したRealtime安定化

Migrationは`0007_realtime.sql`。

### `realtime_session_state`

- 授業単位の現在sequenceを保持する。
- `last_clear_sequence`で画面clear以前のcommentがsnapshotへ復活することを防ぐ。
- `live_sessions`削除時にcascade deleteする。

### `realtime_events`

- 授業単位のsequence付きeventを保持する。
- UNIQUE: `(live_session_id, sequence)`。
- event typeは`message:new`、`message:remove`、`message:restore`、`message:clear`、`settings:update`、`room:closed`。
- payloadは正しいJSONだけ許可する。
- default retentionは24時間。
- 即時WebSocket配信の成否にかかわらずcatch-upの正本になる。

### `realtime_connection_tickets`

- WebSocket接続用の60秒・一回限りticketを保持する。
- 保存するのはSHA-256 hashだけ。
- auth session、organization、user、role、授業へ固定する。
- 消費時に認証session、membership、授業状態を再検証する。
- 使用済みまたは期限切れticketはscheduled maintenanceで削除する。

### Stage 6 migration確認

```bash
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage06-d1
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage06-d1
npx wrangler d1 execute DB_V2 --local --persist-to .stage06-d1 \
  --command="PRAGMA foreign_key_check; PRAGMA quick_check;"
```

二回目は`No migrations to apply`でなければならない。


## 13. Stage 6.5で追加したメール認証

Migrationは`0008_email_auth.sql`と`0009_account_lifecycle.sql`。

### `pending_registrations`

- 自己登録確認前のemail。display name。organization name。password hashを保持
- raw tokenは保存しない
- active registrationはemailごとに一件
- 確認時にuser。organization。Owner membership。quota。sessionを原子的に作成

### `organization_origins`

- organizationの作成経路を`bootstrap`。`self_signup`。`system`で記録
- 一userのself signup organizationは一件

### `organization_quotas`

- active member上限
- pending invitation上限
- 日次invitation email上限
- organizationごとに一行

### `organization_invitations`

- organization。email。role。inviterへ固定
- token hashだけを保存
- accepted。revoked。expiredを区別
- active invitationはorganizationとemailごとに一件

### `email_change_requests`

- user。旧email。新emailへ固定
- token hashだけを保存
- userごとのactive requestは一件

### `email_enrollment_requests`

- email未登録の既存user向け
- current password確認後に発行
- 確認完了でemailを登録し全sessionを失効

### `email_delivery_attempts`

- mail種別。recipient hashとmask。status。provider message ID。error codeを保持
- mail本文。raw token。full emailを保存しない
- Stage 6.5-Bでorganization IDを追加

### `auth_public_counters`

- recipient email hashとrequest IP hashの日次exact counter
- secret pepperを用いる
- full emailと生IPを保存しない

### `organization_email_events`

- organization単位の日次invitation email quotaを記録
- conditional insertで同時再送時の二重計上を防ぐ

### D1 trigger

- `trg_organization_members_active_limit_insert`
- `trg_organization_members_active_limit_update`
- `trg_organization_invitations_pending_limit`
- `trg_organization_invitation_daily_email_limit`

### Stage 6.5 migration確認

```bash
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage06-5-d1
npx wrangler d1 migrations apply DB_V2 --local --persist-to .stage06-5-d1
npx wrangler d1 execute DB_V2 --local --persist-to .stage06-5-d1 \
  --command="PRAGMA foreign_key_check; PRAGMA quick_check;"
```

二回目は`No migrations to apply`でなければならない。
