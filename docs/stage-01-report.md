# CPCV 第1段階作業報告

作業日: 2026-07-12

## 1. 判定

第1段階成果物として合格。
現行動作は変更していない。
本番D1と本番Workerは操作していない。

## 2. 実施内容

- 入力ZIPのSHA-256を固定
- 基準source fileのSHA-256を固定
- 構成 API 画面 D1 DO 認証 data flowを再調査
- 既存checkとdry-runをclean installから実行
- 空D1 migration失敗を再現
- 手動統合schemaのlocal D1でAPIとWebSocketを実動試験
- 正常系と既知異常系67項目を確認
- 既知問題を優先度と対応段階で整理
- `.gitignore`をsecretと生成物へ対応
- clean sourceとgit apply patchを作成
- 配布ZIPを別directoryへ再展開して再検証

Codexは使用していない。

## 3. 変更ファイル

```text
.gitignore
docs/INDEX.md
docs/stage-01-spec.md
docs/current-system.md
docs/api-baseline.md
docs/known-issues.md
docs/stage-01-report.md
docs/stage-01-debug-report.md
docs/source-archives.sha256
docs/original-source-manifest.sha256
docs/final-source-manifest.sha256
docs/baseline-file-list.txt
```

`src` `public` `migrations` `scripts` package files Wrangler設定 workflow READMEは未変更。

## 4. `.gitignore`の変更

追加または拡張:

```gitignore
.tools/
.baseline-d1/
.dev.vars*
.env*
```

既存の`node_modules` `.wrangler` `tmp` `output` `*.log`除外は維持する。

## 5. Test結果

| 項目 | 結果 |
|---|---|
| `npm ci` | 成功 |
| `npm run check` | 成功 |
| `npm run check:project` | 成功 |
| `npm run check:pdf-links` | 成功 |
| `npm run deploy:dry-run` | 成功 |
| `npm ls --all` | 成功。platform外optional dependencyだけ未導入 |
| `npm audit --json` | low 1 high 4。exit 1 |
| `npm audit --omit=dev --json` | 0件。exit 0 |
| 空D1 migration | `0003`でduplicate column。期待した既知失敗 |
| local HTTP API WebSocket | 67項目完了 |
| secret generated artifact scan | 合格 |
| local resource reference scan | 合格 |
| case-insensitive filename collision | なし |
| patch apply check | 合格 |
| ZIP CRC permission structure | 合格 |
| production operation | 未実行 |

## 6. 未解決事項

製品欠陥は`docs/known-issues.md`へ記録した。
第1段階で直すと基準動作が変わるため修正していない。

次段階へ進む前に必要な情報:

- production D1へ適用済みmigration一覧
- production dataを保持する必要の有無
- 新版D1 database nameとbinding name
- 元Git repositoryのcommit branch tracked state

## 7. Git

提供ZIPに`.git`がないため次は不明。

- 元commit
- 元branch
- tracked state
- remote

元repositoryではpatch適用前に状態を保存する。

推奨commit:

```text
stage-01: document and freeze current system baseline
```

## 8. 次段階

第2段階 DB再設計へ進める。
現行production D1へ既存migrationを再適用しない。
