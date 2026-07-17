# CPCV 第2段階 実装報告書

## 1. 結論

第一段階完成版を基準に新版D1のlocal実装を完了した。現行Workerは引き続き`env.DB`だけを使用する。`src/**`と`public/**`と旧`migrations/**`は変更していない。

remote D1 resourceは作成していない。実UUIDも未設定である。このため第二段階完了条件25項目のうち22項目が合格。3項目が未実施である。

## 2. 実装内容

- `DB_V2` bindingのlocal定義
- `migrations-v2/0001_initial_schema.sql`
- 設計書で確定した7 application tables
- 外部キー、UNIQUE、CHECK、16件の明示INDEX
- 非公開Owner bootstrap utility
- schema境界検査
- 空local D1 migration試験
- 二回目applyのno-op試験
- 外部キー、整合性、越境、異常系の自動試験
- `docs/database-schema.md`
- 実装報告書と厳格デバッグ報告書

## 3. 実装前に確定した事項

### 3.1 Ownerと全体運営者

組織Ownerとシステム全体の運営者は別物である。今回実装したのは組織Ownerだけである。全組織横断の管理者は実装していない。

### 3.2 Remote bootstrap

remote実行では次を必須にした。

- `--remote`
- 実在する新版D1 UUID
- 旧D1 UUIDの拒否
- database nameの手入力確認
- Cloudflare APIから取得した実UUIDとnameの一致
- TTYの非表示パスワード入力
- migration履歴、7テーブル、全schema objectのSHA-256照合
- foreign key checkとquick check
- localhost限定の一時Worker
- 実行ごとのnonce
- D1 batchによる4件の一括作成
- 一時Workerと一時設定の削除

本番Workerへbootstrap endpointは追加していない。

## 4. 設計書の再確認と訂正

実装前設計の方針と第一段階ソースに致命的な衝突はなかった。ただし厳格なD1再現試験で設計書内のSQL欠陥を一件検出した。

1. 各列一覧では単一列主キーをNULL不可としていた。初期SQLは`TEXT PRIMARY KEY`だった。SQLite互換のD1ではこの宣言だけではNULLを拒否しない。実際にNULL主キーを登録できたため、6件を`TEXT NOT NULL PRIMARY KEY`へ訂正した。
2. `users`列一覧で`password_scheme`が重複していた。正式な列は一件だけとした。
3. D1経由の検査は`PRAGMA quick_check`を使用した。local SQLiteファイルへ補助的に`PRAGMA integrity_check`を実行した。
4. remote database IDは不明である。架空のIDは入れていない。

訂正後のmigration SQLは同梱する`stage-02-spec.md`の19.3とバイト単位で一致する。入力設計書のSHA-256は`c064af4f05f4ac720b0b153c2ba5ea56718e62084a0dd20c7c0513e2d7da1802`である。

## 5. 変更範囲

詳細は`docs/stage-02-changed-files.md`を参照する。

既存アプリケーション動作に関係する次の範囲はStage 1 manifestと一致した。

- `src/**`
- `public/**`
- `migrations/**`
- 既存の検査script
- GitHub Actions
- lock files

変更を許可した既存ファイルは`.gitignore`、`package.json`、`wrangler.toml`、`docs/INDEX.md`だけである。

## 6. Migration適用手順

### Local

```bash
npm ci
rm -rf .stage02-d1
npm run db:v2:migrate:local
npm run db:v2:migrate:local
npm run db:v2:test
```

二回目はno-opになる。

### Remote

第2段階では実行していない。

```bash
npx wrangler d1 create class_comment_db_v2 --location=apac
```

返された実UUIDを`wrangler.toml`の`DB_V2` blockへ追加する。

```toml
database_id = "実際に返されたUUID"
```

確認後に適用する。

```bash
npx wrangler d1 migrations list DB_V2 --remote
npx wrangler d1 migrations apply DB_V2 --remote
```

旧`DB`へ適用してはならない。本番Workerをdeployしない。

## 7. Bootstrap実行手順

### Local

```bash
npm run db:v2:bootstrap -- --persist-to .stage02-d1
```

### Remote

```bash
npm run db:v2:bootstrap -- --remote --database-id 実際のDB_V2_UUID
```

パスワードは端末へ非表示入力する。remoteでは`--password-stdin`を拒否する。

## 8. 自動テスト

```text
154 passed, 0 failed, 154 total
```

主な検査対象:

- schema、列、型、主キー
- 外部キーと`ON DELETE`
- UNIQUEとCHECK
- 16件のINDEX
- 複数組織所属
- 組織越境拒否
- auth sessionの組織固定
- 論理削除日時
- live sessionのstatus整合
- audit actor整合
- physical deleteのRESTRICT
- query plan
- bootstrap rollback
- bootstrap二回目拒否
- 平文パスワード非出現
- remote DB identity preflight
- bootstrap前のschema検証（table名だけでなく全table・INDEX定義を照合）

現行Worker検査:

```text
npm run check             合格
npm run check:project     合格
npm run check:pdf-links   合格
npm run deploy:dry-run    合格
npm ls --all              合格
```

`npm audit`:

```text
devを含む: low 1、high 4、total 5
productionのみ: 0
```

依存関係はStage 1から変更していない。

## 9. 未解決事項

1. 新版remote D1 resourceは未作成。
2. `DB_V2`のremote database IDは未設定。
3. remote migrationとremote bootstrapは未実施。
4. 本番用のremote bindingは実UUID設定まで未完成。
5. 元ZIPに`.git`がないため元リポジトリ履歴は不明。
6. 第3段階の新規password scheme反復回数は未決定。
7. system全体管理者は未実装。
8. `live_sessions`の逆方向status遷移は第3段階の条件付きUPDATEで防止する。
9. Windows上の一時設定についてPOSIX mode bitは検査できない。

## 10. 第二段階完了条件

| No. | 条件 | 判定 | 根拠 |
|---:|---|---|---|
| 1 | `stage-02-spec.md`が実装と一致 | 合格 | migration SQL完全一致。記載差異は明文化 |
| 2 | `stage-02-database`ブランチ | 合格 | Stage 1 ZIPから再構成したlocal repositoryで作業 |
| 3 | 旧migration未変更 | 合格 | Stage 1 SHA-256一致 |
| 4 | 新版D1が旧D1と別resource | 未実施 | remote resourceを作成していない |
| 5 | `DB`が旧D1のまま | 合格 | 旧database ID不変 |
| 6 | `DB_V2`が新版remote D1を指す | 未実施 | 実UUID未確定 |
| 7 | `0001_initial_schema.sql`存在 | 合格 | `migrations-v2/`に存在 |
| 8 | 指定7 application tables | 合格 | 厳密なtable一覧検査 |
| 9 | 空local D1へ一発適用 | 合格 | 自動試験 |
| 10 | 二回目apply no-op | 合格 | 自動試験 |
| 11 | schema自動試験全成功 | 合格 | 154件合格、0件失敗 |
| 12 | `foreign_key_check`が0行 | 合格 | 初期時と試験後に確認 |
| 13 | `integrity_check`が`ok` | 合格 | local SQLite補助検査。D1経由は`quick_check` |
| 14 | login ID重複拒否 | 合格 | exactと大文字小文字差を検査 |
| 15 | 一人を複数組織へ所属可能 | 合格 | 自動試験 |
| 16 | 授業organization必須 | 合格 | NOT NULLとFK |
| 17 | 別組織memberを作成者にできない | 合格 | 複合FK試験 |
| 18 | auth sessionが一組織へ固定 | 合格 | membership複合FK試験 |
| 19 | status、role、boolean不正値拒否 | 合格 | CHECK制約試験 |
| 20 | 論理削除日時の不整合拒否 | 合格 | CHECK制約試験 |
| 21 | 初回Ownerに平文秘密情報なし | 合格 | TTY、local hash、出力とDB検索 |
| 22 | 現行Worker checks成功 | 合格 | check、project、PDF、dry-run |
| 23 | 現行APIと画面を変更していない | 合格 | protected file SHA-256一致 |
| 24 | 本番Worker未deploy | 合格 | dry-runだけ実行 |
| 25 | 旧本番D1へ新版migration未適用 | 合格 | local D1だけで試験 |

集計:

```text
合格: 22
不合格: 0
未実施: 3
```

## 11. 総合判定

local実装と検査は合格である。remote D1 resourceと実UUIDに加え、元Git repositoryのbranch確認ができないため、設計書が定義する第二段階の正式完了状態にはまだ達していない。本番環境を変更しない条件を優先し、未実施2項目を隠さず残した。

## 参考文献

Cloudflare. (2026, June 22). *D1 Database*. Cloudflare Developers. https://developers.cloudflare.com/d1/worker-api/d1-database/

Cloudflare. (2026, June 8). *Migrations*. Cloudflare Developers. https://developers.cloudflare.com/d1/reference/migrations/

Cloudflare. (2026, April 21). *Define foreign keys*. Cloudflare Developers. https://developers.cloudflare.com/d1/sql-api/foreign-keys/

Cloudflare. (2026, June 25). *Local development*. Cloudflare Developers. https://developers.cloudflare.com/d1/best-practices/local-development/

SQLite Project. (2025, April 30). *CREATE TABLE*. https://www.sqlite.org/lang_createtable.html
