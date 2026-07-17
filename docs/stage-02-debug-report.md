# CPCV 第2段階 厳格デバッグ報告書

## 1. 検査方針

生成物を正しいと仮定しない。Stage 1境界、migration、schema、異常系、bootstrap、配布ZIPを独立して検査する。

## 2. Stage 1境界

検査項目:

- `src/**` SHA-256
- `public/**` SHA-256
- 旧`migrations/**` SHA-256
- 既存scripts SHA-256
- lock files SHA-256
- GitHub Actions SHA-256
- 旧D1 database ID
- main Workerの`DB_V2`参照
- production bootstrap route

結果:

```text
合格
```

変更を許可した設定ファイルは内容を個別に固定して検査した。

## 3. Migrationとschema

実装前設計のSQLをそのまま適用した候補では、`TEXT PRIMARY KEY`へNULLを登録できた。これは列一覧のNULL不可と矛盾する。単一列主キー6件へ明示的な`NOT NULL`を追加し、訂正後の設計書とmigrationを一致させた。

検査項目:

- 訂正後のStage 2設計書19.3とのSQL完全一致
- 全ての単一列主キーがNULLを拒否
- 空local D1へのapply
- 二回目apply
- application tableが正確に7件
- 全列、型、NULL、default、主キー
- 全外部キーと`ON DELETE`
- 16件の明示INDEX
- `foreign_key_check`
- `quick_check`
- local SQLite `integrity_check`

結果:

```text
154 passed, 0 failed, 154 total
```

## 4. 制約と越境

次の正常系と異常系を検査した。

- organization statusと論理削除
- login ID uniquenessと文字規則
- membership主キー、外部キー、role、status
- 一人の利用者の複数組織所属
- auth session複合外部キー、token uniqueness、期限
- password reset token uniquenessと状態
- live sessionの組織、作成者、公開コード、status、日時
- audit actor整合とJSON
- 組織越境拒否
- physical deleteのRESTRICT
- INDEXのquery plan

結果:

```text
全項目合格
```

## 5. Bootstrap utility

検査項目:

- 平文パスワードを引数または環境変数で受け取らない
- remoteで`--password-stdin`を拒否
- 旧D1 UUIDを拒否
- Cloudflare上のUUIDとnameを事前照合するコード
- loopback限定temporary Worker
- 一回限りのnonce
- migration履歴と7テーブルの事前検査
- 全table・INDEX定義のcanonical SHA-256照合
- `foreign_key_check`と`quick_check`
- table追加だけでなくINDEX欠落も拒否
- batch途中失敗時の全rollback
- 正常作成
- 二回目実行拒否
- DB、stdout、stderrへの平文パスワード非出現
- 一時設定と子プロセスの削除

rollback試験ではaudit insertを強制失敗させる一時triggerを使用した。organization、user、membership、auditが全て0件へ戻ることを確認した。

結果:

```text
全項目合格
```

remote D1への実書込みは行っていない。remote identity照合はコードと異常系を検査した。実remote確認は未実施である。

## 6. 現行Worker

```text
npm run check             合格
npm run check:project     合格
npm run check:pdf-links   合格
npm run deploy:dry-run    合格
npm ls --all              合格
```

実deployは行っていない。

## 7. 依存関係

```text
npm audit: low 1、high 4、total 5
npm audit --omit=dev: 0
```

Stage 1から依存関係を変更していない。

## 8. Git

入力ZIPと現在の作業ディレクトリに`.git`はない。元branchとcommit IDは確認不能である。Git履歴を再構成したとは扱わない。元repositoryへ反映する際に`stage-02-database` branchを作成する必要がある。

```text
git diff --check            未実施（Git metadataなし）
git status                  未実施（Git metadataなし）
implementation commit      未実施
```

## 9. 配布物

最終ZIPについて次を検査する。

- CRC
- 単一トップレベルフォルダ
- path traversalなし
- 重複entryなし
- 大文字小文字衝突なし
- symlinkなし
- directory 0755
- file 0644
- `.git`なし
- `node_modules`なし
- `.wrangler`なし
- `.env*`なし
- `.dev.vars*`なし
- 一時D1なし
- 展開後SHA-256一致
- 展開後`npm ci`
- 展開後の全static check
- 展開後の全DB試験

結果:

```text
合格。単一トップレベルフォルダ、CRC、path traversal、重複entry、大文字小文字衝突、symlink、権限、秘密ファイル混入、展開後manifest一致を確認した。展開物で`npm ci`、既存Worker検査、dry-run、154件のDB試験を再実行し全て合格した。
```

## 10. 未実施

- 新版remote D1 resource作成
- remote UUID設定
- remote migration
- remote bootstrap
- 本番deploy

## 11. 最終判定

```text
合格。local Stage 2実装と提出ZIPは再現可能である。remote D1作成、remote UUID設定、remote migration、remote bootstrap、本番deployは意図的に未実施である。Git metadataがないためbranchとcommitだけは確認不能である。
```
