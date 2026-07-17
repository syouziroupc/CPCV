# CPCV 開発資料

## 現行正本

Cloudflare反映担当は最初に`final-stage08/00_INDEX.md`を読みます。現行versionは`0.8.2`です。migrationは`0017`までです。Codex指示は`final-stage08/20_CODEX_DEPLOY_INSTRUCTION_FINAL.md`だけを使用します。以下の段階別資料は履歴です。

最初に`stage-01-spec.md`を読む。

| ファイル | 内容 |
|---|---|
| `stage-01-spec.md` | 第1段階の正式仕様と変更境界 |
| `current-system.md` | 現行実装の構成とデータフロー |
| `api-baseline.md` | Stage 1時点の旧APIと実測挙動を保存した履歴資料 |
| `known-issues.md` | 後続段階で修正する問題 |
| `stage-01-report.md` | 実施内容と完了判定 |
| `stage-01-debug-report.md` | 厳格検証の方法と結果 |
| `original-source-manifest.sha256` | 元ZIPから抽出した基準ファイルのSHA-256 |
| `final-source-manifest.sha256` | 第1段階成果物の非docsファイルSHA-256 |
| `source-archives.sha256` | 入力ZIPのSHA-256 |
| `baseline-file-list.txt` | 基準対象ファイル一覧 |

第1段階ではアプリケーションの動作を変更しない。
DB 認証 UI WebSocket 入力処理の修正は第2段階以降へ送る。

## 第2段階資料

| ファイル | 内容 |
|---|---|
| `stage-02-spec.md` | DB再設計の正式仕様 |
| `stage-02-implementation-decisions.md` | 実装前決定事項と設計差異 |
| `database-schema.md` | DB_V2の実装済みschemaと運用手順 |
| `stage-02-implementation-report.md` | 変更内容、試験結果、完了条件 |
| `stage-02-debug-report.md` | 厳格デバッグの方法と結果 |
| `stage-02-changed-files.md` | 変更ファイル一覧 |
| `stage-02-git-record.md` | 再構成したGit branchの記録 |
| `stage-02-test-results.txt` | 自動試験の実行結果 |
| `stage-02-final-manifest.sha256` | 第2段階完成版のファイルSHA-256 |

## Stage 3

- `stage-03-spec.md`
- `stage-03-contract-addendum.md`
- `stage-03-test-spec.md`
- `stage-03-review-checklist.md`
- `codex-stage-03-a.md`
- `codex-stage-03-b.md`
- `codex-stage-03-c.md`
- `codex-stage-03-implementation.md`
- `codex-execution-order.md`
- `stage-03a-implementation-report.md`
- `stage-03a-debug-report.md`
- `stage-03a-changed-files.md`
- `stage-03a-test-results.txt`
- `stage-03a-final-manifest.sha256`

## Stage 3-B実装成果物

| ファイル | 内容 |
|---|---|
| `stage-03b-implementation-report.md` | 認証・組織APIの実装内容と完了判定 |
| `stage-03b-debug-report.md` | 随時デバッグで発見・修正した事項 |
| `stage-03b-test-results.txt` | Stage 2。Stage 3-A。Stage 3-Bの試験結果 |
| `stage-03b-changed-files.md` | Stage 3-A完成版からの変更一覧 |
| `stage-03b-next-development.md` | Stage 3-C開始条件と未設定の外部環境項目 |
| `stage-03b-source-manifest.sha256` | 完成ソースのファイルmanifest |

## Stage 3-C・Stage 3完了成果物

| ファイル | 内容 |
|---|---|
| `stage-03c-implementation-report.md` | 授業API、跨DB投影、UI移行の実装内容 |
| `stage-03c-debug-report.md` | fault injection、UI、依存更新を含むデバッグ記録 |
| `stage-03c-test-results.txt` | Stage 2からStage 3-Cまでの最終試験結果 |
| `stage-03c-changed-files.md` | Stage 3-B完成版からの変更一覧 |
| `stage-03c-source-manifest.sha256` | Stage 3-C完成ソースmanifest |
| `stage-03-completion-report.md` | Stage 3全体の完了判定 |
| `stage-03c-visual-review.md` | desktop・mobile画面確認の判定 |
| `stage03c-screenshots/` | desktop・mobileの画面確認証跡 |

## Stage 4以降

- `stage-04-next-development.md`
- `stage-04-outline.md`
- `stage-05-outline.md`
- `stage-06-outline.md`
- `stage-07-outline.md`
- `stage-08-outline.md`
- `stage-09-outline.md`
- `stage-change-boundaries.md`
- `stage-completion-criteria.md`
- `stage-dependency-matrix.md`
## Stage 4実装成果物

| ファイル | 内容 |
|---|---|
| `stage-04-spec.md` | 匿名参加者とコメント永続化の正式仕様 |
| `stage-04-test-spec.md` | 正常系、異常系、越境、rollback、privacy試験 |
| `stage-04-review-checklist.md` | 実装境界と完了判定 |
| `stage-04-implementation-report.md` | Stage 4実装内容 |
| `stage-04-debug-report.md` | デバッグとfault injection記録 |
| `stage-04-test-results.txt` | Stage 2からStage 4までの試験結果 |
| `stage-04-changed-files.md` | Stage 3-C完成版からの変更一覧 |
| `stage-04-source-manifest.sha256` | Stage 4完成ソースmanifest |
| `stage-04-final-verification.txt` | 再構成後の最終検証結果 |
| `stage-04-visual-review.md` | desktop、mobile表示確認 |
| `stage04-screenshots/` | 画面確認証跡 |
| `stage-05-next-development.md` | Stage 5開始条件と設計対象 |

## Stage 4精密監査成果物

| ファイル | 内容 |
|---|---|
| `stage-04-precision-audit-report.md` | 発見事項と修正内容 |
| `stage-04-precision-debug-report.md` | 詳細な再現・原因・修正 |
| `stage-04-precision-test-results.txt` | 精密監査後の試験結果 |
| `stage-04-precision-final-verification.txt` | 再展開後の最終検証 |
| `stage-04-precision-changed-files.md` | Stage 4完成版からの変更一覧 |
| `stage04-precision-screenshots/` | desktop・mobile画面確認 |


## Stage 5実装成果物

| ファイル | 内容 |
|---|---|
| `stage-05-spec.md` | 手動モデレーション正式仕様 |
| `stage-05-test-spec.md` | 正常。異常。越境。競合。rollback試験 |
| `stage-05-review-checklist.md` | 完了判定 |
| `stage-05-implementation-report.md` | 実装内容 |
| `stage-05-debug-report.md` | 実装中の修正とfault injection |
| `stage-05-test-results.txt` | Stage 1〜5の試験結果 |
| `stage-05-final-verification.txt` | 再展開後の最終検証 |
| `stage-05-visual-review.md` | Desktop。Mobile画面確認 |
| `stage05-screenshots/` | Stage 5画面証跡 |
| `stage-06-next-development.md` | Stage 6開始条件 |


## Stage 6実装成果物

| ファイル | 内容 |
|---|---|
| `stage-06-spec.md` | Realtime安定化正式仕様 |
| `stage-06-test-spec.md` | Ticket、sequence、catch-up、Hibernation試験 |
| `stage-06-review-checklist.md` | 完了判定 |
| `stage-06-implementation-report.md` | 実装内容 |
| `stage-06-debug-report.md` | 実装中の不具合と修正 |
| `stage-06-test-results.txt` | Stage 2〜6の試験結果 |
| `stage-06-final-verification.txt` | 再展開後の最終検証 |
| `stage-06-visual-review.md` | Desktop・Mobile画面確認 |
| `stage06-screenshots/` | Stage 6画面証跡 |
| `stage-07-next-development.md` | Stage 7開始条件 |

## 再現用Python依存

- `requirements-manual.txt`: 取扱説明書PDF生成・描画
- `requirements-visual.txt`: Chromium画面確認用Playwright


## Stage 6.5実装成果物

| ファイル | 内容 |
|---|---|
| `stage-06-5-spec.md` | メール認証とaccount lifecycleの正式仕様 |
| `stage-06-5-implementation-report.md` | 実装内容と完了判定 |
| `stage-06-5-debug-report.md` | 発見事項と修正内容 |
| `stage-06-5-test-results.txt` | 全試験結果 |
| `stage-06-5-visual-review.md` | desktop・mobile画面検査 |
| `stage-06-5-cloudflare-setup.md` | Email Service。Turnstile。D1。limiter設定 |
| `stage-06-5-deployment-cutover.md` | 既存Owner移行とメール必須化手順 |
| `stage-06-5-handoff.md` | 次段階への引継ぎ |
| `stage06-5-screenshots/` | 画面確認証跡 |
## Stage 7

- `stage-07-spec.md`
- `stage-07-db-spec.md`
- `stage-07-api-contract.md`
- `stage-07-implementation-report.md`
- `stage-07-debug-report.md`
- `stage-07-test-results.txt`
- `stage-07-visual-review.md`
- `stage-07-cloudflare-setup.md`
- `stage-07-handoff.md`
- `stage-07-final-verification.txt`


## Stage 7.6

- `stage-07-6-spec.md`
- `stage-07-6-foreign-language-policy.md`
- `stage-07-6-dictionary-format.md`
- `stage-07-6-implementation-report.md`
- `stage-07-6-debug-report.md`
- `stage-07-6-test-results.txt`
- `stage-07-6-visual-review.md`
- `stage-07-6-handoff.md`
- `stage-07-6-references.md`
- `stage07-6-test-logs/`
- `stage07-6-screenshots/`

## Stage 7.7

- `stage-07-7-spec.md`
- `stage-07-7-dictionary-packs.md`
- `stage-07-7-implementation-report.md`
- `stage-07-7-debug-report.md`
- `stage-07-7-test-summary.md`
- `stage-07-7-visual-review.md`
- `stage-07-7-deployment.md`
- `stage-07-7-handoff.md`
- `stage-07-7-references.md`
- `stage07-7-records/`
- `stage07-7-screenshots/`
## Stage 7.8

- `stage-07-8-spec.md`
- `stage-07-8-dictionary-audit.md`
- `stage-07-8-implementation-report.md`
- `stage-07-8-debug-report.md`
- `stage-07-8-test-results.txt`
- `stage-07-8-visual-review.md`
- `stage-07-8-deployment.md`
- `stage-07-8-handoff.md`
- `stage-07-8-references.md`
- `stage07-8-screenshots/`



## Stage 8 完成成果物

- `stage-08-spec.md`
- `stage-08-db-spec.md`
- `stage-08-api-contract.md`
- `stage-08-privacy-and-analytics.md`
- `stage-08-implementation-report.md`
- `stage-08-debug-report.md`
- `stage-08-test-results.txt`
- `stage-08-visual-review.md`
- `stage-08-codex-cloudflare-deployment.md`
- `stage-08-rollback.md`
- `stage-08-handoff.md`
- `stage-08-references.md`
- `stage08-logs/`
- `stage08-screenshots/`

## Stage 8.1 精密デバッグ

- `stage-08-precision-spec.md`
- `stage-08-precision-debug-report.md`
- `stage-08-precision-test-results.txt`
- `stage-08-precision-migration-verification.txt`
- `stage-08-precision-visual-review.md`
- `stage-08-precision-changed-files.md`
- `stage-08-precision-cloudflare-deployment.md`
- `stage-08-precision-rollback.md`
- `stage-08-precision-final-verification.txt`
- `stage08-precision-logs/`
- `stage08-precision-screenshots/`

## Stage 8 最終統合仕様

Cloudflare反映担当は最初に`final-stage08/00_INDEX.md`を読む。

- `final-stage08/01_STAGE01_TO_STAGE08_MASTER_SPEC.md`: Stage 1〜8.1の統合仕様
- `final-stage08/02_CURRENT_ARCHITECTURE.md`: 現行構成とデータフロー
- `final-stage08/03_DATA_AND_MIGRATION_SPEC.md`: DBとmigration
- `final-stage08/04_SECURITY_AUTHORIZATION_SPEC.md`: 認証。権限。security
- `final-stage08/05_API_REALTIME_UI_SPEC.md`: API。Realtime。UI
- `final-stage08/06_MODERATION_AI_TRANSLATION_FILTER_SPEC.md`: moderation。AI。翻訳。辞書
- `final-stage08/07_PDF_ANALYTICS_PRIVACY_SPEC.md`: PDF連動。匿名分析。privacy
- `final-stage08/08_CLOUDFLARE_RESOURCE_SPEC.md`: Cloudflare resource
- `final-stage08/09_CODEX_CLOUDFLARE_RUNBOOK.md`: Codex反映手順
- `final-stage08/10_STAGING_ACCEPTANCE_TEST.md`: staging受入試験
- `final-stage08/11_PRODUCTION_CUTOVER_AND_ROLLBACK.md`: production切替とrollback
- `final-stage08/13_CONFIGURATION_WORKSHEET.md`: 実値記入表
- `final-stage08/14_CODEX_COPY_PASTE_INSTRUCTION.md`: Codexへ渡す指示
- `final-stage08/17_CLOUDFLARE_PENDING_VALUES.md`: Cloudflare未設定項目

