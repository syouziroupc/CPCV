# CPCV 第2段階 実装前決定事項

## 1. 組織Ownerとシステム全体の運営者

組織Ownerとシステム全体の運営者は別の主体とする。

第2段階の対象は`organization_members.role='owner'`で表現する組織Ownerまでである。Ownerの権限範囲は所属組織内に限定する。

システム全体の運営者アカウントや全組織横断権限は実装しない。`audit_logs.actor_type='system'`は自動処理またはbootstrap処理を示す技術的な記録である。ログイン可能な全体管理者を意味しない。

全体管理者が必要になった場合は後段階で別途設計する。組織Ownerへ暗黙に全体管理権限を与えない。

## 2. Remote Bootstrapの正式方式

`node scripts/bootstrap-owner.mjs`を実行入口とする。本番Workerへbootstrap routeは追加しない。

remote実行は次の順序で行う。

1. `--remote`と実在する`--database-id`を必須にする。
2. 旧D1のUUIDを拒否する。
3. 操作者に`class_comment_db_v2`を手入力させる。
4. 一時Wrangler設定を作成する。
5. `wrangler d1 info DB_V2 --json`で実際のUUIDとdatabase nameを取得する。
6. 入力したUUIDとnameの両方が一致しなければ停止する。
7. remoteではTTYの非表示入力だけからパスワードを受け取る。
8. CLI内でsaltとpassword hashを生成する。
9. 実行ごとのnonceを含む別の一時Wrangler設定を作成する。
10. `127.0.0.1`限定の一時Workerを起動する。
11. 一時Workerはmigration記録、7テーブル、外部キー、`quick_check`を検査する。
12. organizationが既に存在する場合は停止する。
13. organization、user、Owner membership、audit logを`D1Database.batch()`で作成する。
14. 途中で一件でも失敗した場合はbatch全体をrollbackする。
15. 一時Workerと一時設定を必ず削除する。

パスワードは引数、環境変数、SQL、一時設定、標準出力、標準エラーへ出さない。hashとsaltも出力しない。local自動試験だけは明示的な`--password-stdin`を許可する。

POSIX環境では一時設定の権限を`0600`に検査する。WindowsではPOSIX mode bitを検査できないため、実行ユーザーの作業ディレクトリを他ユーザーから読めない状態にする。

Cloudflare D1の`batch()`はprepared statement群をtransactionとして実行する。途中失敗時はsequence全体がrollbackされる。

## 3. 設計書と第一段階ソースの照合

実装を停止すべき致命的矛盾は確認されなかった。

次は未確定である。

- 新版remote D1は未作成
- `DB_V2`の実database IDは不明
- 本番環境への書込みは禁止

このため`wrangler.toml`にはlocal構築用の`DB_V2` blockを追加する。架空の`database_id`は記載しない。実在する新版D1を作成してUUIDを設定するまでremote bindingは未完成である。

## 4. 設計書内の記載差異

### 4.1 `password_scheme`

`users`の列一覧では`password_scheme`が重複している。正式なmigration SQLでは一列である。実装は正式SQLに従い一列だけ作成する。

### 4.2 7テーブル

「指定7テーブルだけ」はapplication tableを意味する。WranglerやD1が管理する`d1_migrations`、`_cf_METADATA`、SQLite内部tableは数えない。

### 4.3 `PRAGMA integrity_check`

D1経由で利用可能な整合性検査として`PRAGMA quick_check`を使用する。local D1のSQLiteファイルにはPython sqlite3から補助的に`PRAGMA integrity_check`を実行する。両方が`ok`でなければ試験を失敗させる。


### 4.4 `TEXT PRIMARY KEY`のNULL許容

実装前のD1再現試験で、SQLite互換のD1は`TEXT PRIMARY KEY`だけではNULLを拒否しないことを確認した。設計書の各列一覧は主キーをNULL不可としていたため、単一列主キー6件を`TEXT NOT NULL PRIMARY KEY`へ訂正した。これは設計意図を変更する追加機能ではなく、列定義とSQLを一致させるための欠陥修正である。

## 5. 状態遷移の境界

第2段階のCHECK制約は現在行のstatus、日時、booleanの組合せを検査する。更新前のstatusは保持しない。このため`ended`から`active`への逆遷移禁止はDB CHECKだけでは実現できない。

第3段階では次の形式を採用する。

```sql
UPDATE live_sessions
SET status = 'ended', ...
WHERE id = ?
  AND organization_id = ?
  AND status = 'active';
```

更新件数が1でなければ失敗させる。関連する認証セッション失効や監査ログはD1 batchでまとめる。

## 参考文献

Cloudflare. (2026, June 22). *D1 Database*. Cloudflare Developers. https://developers.cloudflare.com/d1/worker-api/d1-database/

Cloudflare. (2026, June 25). *Local development*. Cloudflare Developers. https://developers.cloudflare.com/workers/local-development/

Cloudflare. (2026, April 21). *SQL statements*. Cloudflare Developers. https://developers.cloudflare.com/d1/sql-api/sql-statements/

SQLite Project. (2025, April 30). *CREATE TABLE*. https://www.sqlite.org/lang_createtable.html
