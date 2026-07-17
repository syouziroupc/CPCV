# Class PDF Comment Viewer v0.8.1

Cloudflare Workers。D1。Durable Objects。Queues。Workers AIを使う授業向けPDFコメント表示システムです。

PDFは先生端末のbrowserで読み込みます。PDF本体をCloudflareへ保存しません。コメント。認証。組織。授業。moderation。Realtime。辞書。AI。PDF page metadata。匿名集計の正本は`DB_V2`です。

## 開発状態

- Stage 1～7.8: 完了
- Stage 8: ローカルPDF連動と匿名理解度分析 完了
- Stage 8.1: 精密デバッグと証拠整合性強化 完了
- Cloudflare remote反映: 未実施

## Stage 8.1で強化した点

- 同じPDFの再選択をidempotent化
- 別PDFへの切替前に旧分析snapshotを自動確定
- PDF読込競合で古い選択結果が画面を上書きしない
- コメント受付OFFでも理解度回答を許可
- PDF page切替競合時の理解度誤紐付けを拒否
- 保持期限切れのコメント。理解度。page event。snapshotをcron前でも集計対象外にする
- 全体理解度の3人抑制をdistinct participant数で判定
- snapshot取得時にSHA-256を再検証
- D1 triggerでpage分析証拠の組織境界。page範囲。作成後不変性を強制
- 旧DB互換とStage 1～8回帰を維持
- Remote D1検査をmigration 0016まで拡張

## migration

```text
migrations-v2/0015_pdf_page_analytics.sql
migrations-v2/0016_stage08_precision_hardening.sql
```

既存0001～0015は削除しません。Remoteへ未適用のmigrationだけを連番で適用します。

## local検査

```bash
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run visual:stage08
npm run deploy:dry-run
npm audit
npm audit --omit=dev
```

## Cloudflare反映

Codexは次を読む。

```text
docs/stage-08-precision-cloudflare-deployment.md
docs/stage-08-precision-rollback.md
docs/stage-08-codex-cloudflare-deployment.md
```

migrationを先にRemote `DB_V2`へ適用する。その後staging。productionの順でWorkerをdeployします。PDF本体をCloudflareへ送る変更は禁止です。

## Stage 8 final specification

Cloudflareへ反映する前に`docs/final-stage08/00_INDEX.md`を読む。
Stage 1〜8.1の統合仕様。Cloudflare resource表。Codex runbook。staging受入試験。production rollbackを収録している。

