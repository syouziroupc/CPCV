# Codex最終指示文

以下をそのままCodexへ渡します。

```text
添付のCPCV Stage 8.2完全引継ぎZIPだけを作業正本として扱ってください。

目的は検証済みrelease candidateをCloudflare stagingで受入検査することです。その後に同じexact commitをproductionへ反映します。sourceの再設計はしません。

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
- Node 22。npm。Wrangler versionを記録する

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

npm run check:stage08の実行上限は最低120分にする。一件でも失敗したらCloudflareを変更しない。失敗内容と再現commandを報告する。

Cloudflare操作前:
- 13_CONFIGURATION_WORKSHEET.mdをDashboardまたはWrangler outputで埋める
- production DB_V2のreal UUIDを設定する
- productionの4個のRate Limiting bindingへ異なるreal namespace IDを設定する
- AUTH_EMAIL_FROM。AUTH_EMAIL_REPLY_TO。TURNSTILE_SITE_KEYを設定する
- EMAIL bindingのallowed_sender_addressesをAUTH_EMAIL_FROMへ制限する
- Email Service sending domainのonboardingを確認する
- 任意受信者へ送る場合は必要なaccount planを確認する
- production secret 3個を用意する。文書またはGitへ書かない
- npm run verify:deploymentを成功させる
- npm run verify:ai-readyを成功させる

staging config:
- source/docs/final-stage08/templates/WRANGLER_STAGING_TEMPLATE.tomlをsource外へコピーする
- productionと別のWorker。legacy DB。DB_V2。Queue。Rate Limiting namespace 4個。originを設定する
- staging secret 3個は文書またはGitへ書かない
- 次を成功させる

node scripts/verify-deployment-config.mjs /absolute/path/wrangler.staging.toml
node scripts/verify-environment-separation.mjs wrangler.toml /absolute/path/wrangler.staging.toml
node scripts/verify-ai-readiness.mjs --config /absolute/path/wrangler.staging.toml
npx wrangler deploy --dry-run --config /absolute/path/wrangler.staging.toml

staging:
- exact release commitをdeployする
- staging用database名と--configを全remote commandへ明示する
- 10_STAGING_ACCEPTANCE_TEST.mdを全件実行する
- test dataを削除する
- staging deployment IDを保存する
- staging configのSHA-256を保存する
- templates/STAGING_ACCEPTANCE_RECORD_TEMPLATE.txtを埋める
- acceptance recordのSHA-256を保存する
- 次を成功させる

node scripts/verify-staging-evidence.mjs /absolute/path/staging-acceptance-record.txt --commit <EXACT_COMMIT> --deployment <STAGING_DEPLOYMENT_ID> --config-sha256 <STAGING_CONFIG_SHA256>

一件でも失敗したらproductionへ進まない。

production直前で停止する。次をuserへ提示する:
- exact release commit
- staging commit
- staging deployment ID
- staging config SHA-256
- staging acceptance record SHA-256
- production resource一覧
- deploy前DB_V2 Time Travel bookmark
- pending migration一覧
- rollback先Worker version
- 実行予定command

明示承認後だけproductionへ進む。推奨commandはPowerShellのscripts/safe-deploy.ps1とする。次の環境変数を設定する。

CPCV_STAGING_COMMIT_SHA
CPCV_STAGING_DEPLOYMENT_ID
CPCV_STAGING_CONFIG_PATH
CPCV_STAGING_CONFIG_SHA256
CPCV_STAGING_TEST_RECORD_PATH
CPCV_STAGING_TEST_RECORD_SHA256
CPCV_STAGING_CONFIRMATION=STAGING_PASSED
AUTH_RATE_LIMIT_PEPPER
PUBLIC_RATE_LIMIT_PEPPER
TURNSTILE_SECRET_KEY

safe-deployはstaging configと受入記録の実ファイルをhash照合する。内容もverify-staging-evidenceで検査する。productionとstagingのresource分離も再検査する。DEPLOY_PRODUCTIONの明示入力後だけmigrationとdeployを実行する。

production実行順の確認用command:
npx wrangler d1 time-travel info class_comment_db_v2
npm run verify:stage82-preflight
node scripts/verify-remote-d1.mjs
npx wrangler deployments status
npx wrangler versions list

GitHub production workflowを使う場合はstaging configと受入記録のbase64も入力する。workflow内で復号。hash照合。内容照合。resource分離検査を行う。

全outputをdeployment-recordsへ保存する。最後にSHA256SUMS.txtを生成する。

最終成果物:
- exact commit
- config差分
- resource inventory
- D1 bookmark
- migration output
- stagingとproductionのdeployment ID
- staging config
- staging acceptance record
- production smoke record
- rollback手順
- 全成果物SHA-256
を一つの完全引継ぎZIPへまとめる。
```
