# Codex最終指示文

以下をそのままCodexへ渡します。

```text
添付のCPCV Stage 8.2完全引継ぎZIPだけを作業正本として扱ってください。

目的はsourceを再設計することではありません。検証済みrelease candidateをCloudflare stagingで受入検査し。同じexact commitを明示承認後にproductionへ反映することです。

最初に次を読んでください。
1. 00_READ_FIRST.md
2. source/docs/final-stage08/00_INDEX.md
3. source/docs/final-stage08/17_CLOUDFLARE_PENDING_VALUES.md
4. source/docs/final-stage08/19_DEPLOYMENT_FINAL_CHECKLIST.md
5. source/docs/final-stage08/09_CODEX_CLOUDFLARE_RUNBOOK.md

絶対禁止:
- UUID。namespace ID。secret。domain。resource名を推測しない
- dirty treeで作業しない
- outer ZIPまたはsource manifestのhash不一致を無視しない
- local試験。documentation検査。config検査の失敗を無視しない
- migrations-v2/0001から0017を編集しない
- productionとstagingのWorker。D1。Queue。Rate Limiting namespaceを共有しない
- stagingを省略してproductionへdeployしない
- stagingで検証したcommitと異なるcommitをproductionへdeployしない
- PDF bytes。filename。page text。画像。注釈をCloudflareへ送る変更をしない
- user承認なしでDEPLOY_PRODUCTIONを入力しない
- user承認なしでD1 Time Travel restoreを実行しない
- reviewed runbookなしでproduction dataを直接修正しない
- unrelated refactor。機能追加。design変更を行わない

作業開始時:
- outer SHA-256を検証する
- source manifestを検証する
- exact 40-character Git commitを記録する
- git status --porcelainが空であることを確認する
- Node 22とWrangler versionを記録する

localで次を全て実行する:
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run verify:final-docs
npm run deploy:dry-run
npm audit
npm audit --omit=dev

`npm run check:stage08`は全段階回帰を含む。実行上限は最低120分にする。45分程度で打ち切らない。

一件でも失敗したらCloudflareを変更しない。失敗内容と再現commandを報告する。

Cloudflare操作前:
- 13_CONFIGURATION_WORKSHEET.mdをDashboardまたはWrangler outputで埋める
- DB_V2のreal UUIDを設定する
- 4個のRate Limiting bindingへ異なるreal namespace IDを設定する
- AUTH_EMAIL_FROM。AUTH_EMAIL_REPLY_TO。TURNSTILE_SITE_KEYを設定する
- EMAIL bindingのallowed_sender_addressesをAUTH_EMAIL_FROMへ制限する
- Email Service sending domainのonboardingを確認する
- 任意受信者へ送る場合は必要なaccount planを確認する
- secret 3個を用意する。文書またはGitへ書かない
- npm run verify:deploymentを成功させる
- npm run verify:ai-readyを成功させる

staging:
- productionと別のWorker。legacy DB。DB_V2。Queue。Rate Limiting namespaceを使う
- exact release commitをdeployする
- 10_STAGING_ACCEPTANCE_TEST.mdを全件実行する
- staging deployment IDを保存する
- acceptance recordを保存する
- acceptance recordのSHA-256を保存する
- local safe-deployを使う場合はCPCV_STAGING_CONFIRMATION=STAGING_PASSEDを設定する
- 一件でも失敗したらproductionへ進まない

production直前で停止し。次をuserへ提示する:
- exact release commit
- staging commit
- staging deployment ID
- staging acceptance record SHA-256
- production resource一覧
- deploy前DB_V2 Time Travel bookmark
- pending migration一覧
- rollback先Worker deployment
- 実行予定command

明示承認後だけ実行する:
npx wrangler d1 time-travel info class_comment_db_v2
npm run verify:stage82-preflight
npx wrangler d1 migrations apply class_comment_db --remote
npx wrangler d1 migrations apply class_comment_db_v2 --remote
node scripts/verify-remote-d1.mjs
npm run verify:email-auth-ready
node scripts/configure-rate-limit-secret.mjs
npx wrangler deploy
node scripts/verify-remote-d1.mjs
node scripts/smoke-production.mjs
npx wrangler deployments status
npx wrangler versions list

legacy DB migrationはpendingがある場合だけ適用する。全outputをdeployment-recordsへ保存する。

最終成果物:
- exact commit
- config差分
- resource inventory
- D1 bookmark
- migration output
- stagingとproductionのdeployment ID
- staging acceptance record
- production smoke record
- rollback手順
- 全成果物SHA-256
を一つの完全引継ぎZIPへまとめる。
```
