# Class PDF Comment Viewer v0.8.10

Cloudflare Workers、D1、Durable Objects、Queues、Workers AIを使う授業向けPDFコメントシステムです。U-22提出候補では、Windows Desktop版 `0.2.2` を `desktop-overlay-poc/` に同梱します。

v0.8.10では授業操作の一画面化に加え、AI応答形式の互換性、翻訳通知の再送、Queue処理、公開入力の安全性、tabletとmobile表示を修正しました。詳細は`docs/v0.8.10-debug-fixes.md`と`docs/v0.8.10-security-ui-audit.md`を参照してください。

PDF本体は教員端末のbrowser内だけで処理します。PDF bytes、ファイル名、page text、画像をCloudflareへ保存しません。コメント、認証、組織、授業、moderation、Realtime、辞書filter、AI、PDF page metadata、匿名集計の正本は`DB_V2`です。

## バージョン規則

Web現在版は`0.8.10`、Desktop提出候補は`0.2.2`です。軽微なWeb更新は`0.8.11`のように末尾を増やします。大きな更新では`0.9.1`へ移り、その次の系列は`0.10.1`とします。詳細は`docs/versioning-policy.md`を参照してください。

## 現在の状態

- Stage 1〜8.1: 完了
- Stage 8.2 final hardening: 実装済み
- migration: `0001`〜`0017`
- セキュリティ・UI再監査: `docs/v0.8.10-security-ui-audit.md`
- local全Stage回帰、Owner bootstrap、Wrangler dry-run、依存監査: 通過
- production用D1、Rate Limiting、Queue、origin等の非secret実値: `wrangler.toml`に設定済み
- production deploy: 手動workflow。exact commitとstaging受入証跡を必須とする
- U-22凍結ゲート: 最新masterと本番Workerの一致確認、Desktop実機確認を残す
- Windows Desktop: `desktop-overlay-poc/`、version `0.2.2`

本番に何が現在配備されているかは、sourceの状態だけから推定しません。U-22提出前にproduction Workerのversion/deploymentを取得し、凍結commitとの一致を記録します。

## Stage 8.2の主要修正

- 保持期限切れdataを一覧、CSV、Realtime、moderation、AIから除外
- 20種類の組織・context境界をD1 triggerで強制
- insertとupdateを含む永続trigger 42本をRemote検査
- 100件の証拠上限後も強制reject語を評価
- AI jobの古いworkerによる上書きを防止
- 3回目処理中断jobを回収
- PDF page更新、理解度、snapshot、auditを競合安全化
- password変更、logout、招待取消、CSRF、メール状態更新を原子的に修正
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

production反映前は`npm run verify:deployment`に加え、staging証跡、環境分離、exact commitを必ず確認します。`deploy-production.yml`は手動実行で、必要証跡が欠けた状態では進めません。

## 現行構成の確認先

実行時のproduction構成は`wrangler.toml`、現行システム要約は`docs/current-system.md`を確認します。`docs/final-stage08/`はStage 8.2導入時に作成したdeployment hardening資料であり、現在値そのものではなく手順・監査要件の履歴資料として扱います。

Stage 8.2導入時の正本資料:

```text
docs/final-stage08/00_INDEX.md
docs/final-stage08/20_CODEX_DEPLOY_INSTRUCTION_FINAL.md
docs/final-stage08/19_DEPLOYMENT_FINAL_CHECKLIST.md
```

canonical staging configと受入記録はsource外に置き、Wrangler実行時だけ`materialize-staging-config`でsource rootのignored runtime configへ完全一致copyを作ります。productionとstagingのresource共有を自動検査し、受入記録は44項目と受入試験書SHA-256へ拘束します。

完全引継ぎZIPからStage 8.2 deployment履歴を再現する場合は`source/expanded-source`を直接編集しません。`git/CPCV_stage08_2_history.bundle`から新規cloneを作ります。

## U-22提出候補

Desktopの構成、再生成方法、提出時に固定する項目は`desktop-overlay-poc/CONTEST-SOURCE-NOTES.md`を確認します。締切後に提出版を変更しないため、凍結後の修正は重大な障害またはセキュリティ対応に限定します。
