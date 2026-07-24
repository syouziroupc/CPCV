# Class PDF Comment Viewer v0.8.10

Cloudflare Workers。D1。Durable Objects。Queues。Workers AIを使う授業向けPDFコメントシステムです。

v0.8.10では授業操作の一画面化に加え、AI応答形式の互換性。翻訳通知の再送。Queue同時実行数。公開入力の安全性。tabletとmobile表示を修正しました。詳細は`docs/v0.8.10-debug-fixes.md`と`docs/v0.8.10-security-ui-audit.md`を参照してください。

PDF本体は教員端末のbrowser内だけで処理します。PDF bytes。ファイル名。page text。画像をCloudflareへ保存しません。コメント。認証。組織。授業。moderation。Realtime。辞書filter。AI。PDF page metadata。匿名集計の正本は`DB_V2`です。


## バージョン規則

現在版は`0.8.10`です。軽微な更新は`0.8.11`のように末尾を増やします。大きな更新では`0.9.1`へ移り、その次の系列は`0.10.1`とします。詳細は`docs/versioning-policy.md`を参照してください。

## 現在の状態

- Stage 1〜8.1: 完了
- Stage 8.2 final hardening: 実装済み
- セキュリティ・UI再監査: `docs/v0.8.10-security-ui-audit.md`
- 公開判定: CONDITIONAL GO
- migration: `0001`〜`0017`
- local機能回帰: 通過
- Cloudflare remote反映: 未実施
- production deploy: 外部実値が未設定のため禁止

## Stage 8.2の主要修正

- 保持期限切れdataを一覧。CSV。Realtime。moderation。AIから除外
- 20種類の組織・context境界をD1 triggerで強制
- insertとupdateを含む永続trigger 42本をRemote検査
- 100件の証拠上限後も強制reject語を評価
- AI jobの古いworkerによる上書きを防止
- 3回目処理中断jobを回収
- PDF page更新。理解度。snapshot。auditを競合安全化
- password変更。logout。招待取消。CSRF。メール状態更新を原子的に修正
- Rate Limiting障害時をfail-closed化
- Realtime接続の認証を5分ごとに再検証
- 旧DBとDB_V2の終了・削除失敗時に旧投影を補償復元

## local最終検査

```bash
npm ci
npm run verify:source-manifest
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run verify:final-docs
npm run deploy:dry-run
npm audit
npm audit --omit=dev
```

`npm run verify:deployment`は外部実値を設定するまで失敗するのが正しい状態です。失敗を無視してdeployしてはいけません。

## 正本資料

最初に次を読みます。

```text
docs/final-stage08/00_INDEX.md
docs/final-stage08/20_CODEX_DEPLOY_INSTRUCTION_FINAL.md
docs/final-stage08/19_DEPLOYMENT_FINAL_CHECKLIST.md
```

段階別の旧報告書は履歴資料です。Cloudflare反映手順の正本には使いません。

## Stage 8.2 deployment gate

production反映は外部実値とstaging証跡が揃うまでfail-closedです。

```text
docs/final-stage08/templates/WRANGLER_STAGING_TEMPLATE.toml
docs/final-stage08/templates/STAGING_ACCEPTANCE_RECORD_TEMPLATE.txt
scripts/verify-environment-separation.mjs
scripts/verify-staging-evidence.mjs
scripts/safe-deploy.ps1
```

canonical staging configと受入記録はsource外に置きます。Wrangler実行時だけ`materialize-staging-config`でsource rootのignored runtime configへ完全一致copyを作ります。productionとstagingのresource共有を自動検査します。受入記録は44項目と受入試験書SHA-256へ拘束します。

完全引継ぎZIPから作業する場合は`source/expanded-source`を直接編集しません。`git/CPCV_stage08_2_history.bundle`から新規cloneを作ります。production非secret実値を設定後に`npm run manifest:source`を実行し 新しいclean release commitを作ります。
