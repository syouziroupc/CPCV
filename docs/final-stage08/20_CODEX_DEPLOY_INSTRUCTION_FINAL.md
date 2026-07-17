# Codex最終指示文

以下をそのままCodexへ渡します。

```text
添付のCPCV Stage 8.2完全引継ぎZIPと同名の`.zip.sha256`だけを初期正本として扱ってください。

目的は引継ぎ成果物を検証することです。production非secret実値を設定した新しいrelease commitを作ります。そのexact commitをCloudflare stagingで受入検査します。明示承認後だけ同じcommitをproductionへ反映します。sourceの再設計はしません。

最初に次を読んでください。
1. 00_READ_FIRST.md
2. FINAL_STAGE08_SPECIFICATION/00_INDEX.md
3. FINAL_STAGE08_SPECIFICATION/17_CLOUDFLARE_PENDING_VALUES.md
4. FINAL_STAGE08_SPECIFICATION/19_DEPLOYMENT_FINAL_CHECKLIST.md
5. FINAL_STAGE08_SPECIFICATION/09_CODEX_CLOUDFLARE_RUNBOOK.md
6. source/expanded-source/docs/final-stage08/20_CODEX_DEPLOY_INSTRUCTION_FINAL.md

絶対禁止:
- UUID。namespace ID。secret。domain。resource名を推測しない
- companion `.zip.sha256`がない状態で開始しない
- dirty treeで作業しない
- outer ZIP。outer manifest。source manifestのhash不一致を無視しない
- local試験。documentation検査。config検査の失敗を無視しない
- migrations-v2/0001から0017を編集しない
- source/expanded-sourceをGit作業treeとして使わない
- productionとstagingのWorker。D1。Queue。Rate Limiting namespaceを共有しない
- external staging configを直接Wranglerへ渡さない
- stagingを省略してproductionへdeployしない
- stagingで検証したcommitと異なるcommitをproductionへdeployしない
- PDF bytes。filename。page text。画像。注釈をCloudflareへ送る変更をしない
- user承認前にmigration。secret書込。deploy。rollback。D1 restoreを実行しない
- reviewed runbookなしでproduction dataを直接修正しない
- unrelated refactor。機能追加。design変更を行わない

引継ぎ検証:
- companion `.zip.sha256`でouter ZIPを検証する
- ZIPを展開する
- 展開rootでSHA256SUMS.txtを全件検証する
- git/CPCV_stage08_2_history.bundleをverifyする
- bundleから新しい作業cloneを作る
- clone rootへcdする
- 初期HEADをouterのgit/GIT_RECORD.txtとRELEASE_RECORD.txtへ照合する
- git status --porcelainが空であることを確認する
- npm run verify:source-manifestを実行する
- Node 22。npm。Wrangler versionを記録する

production configとrelease commit:
- 13_CONFIGURATION_WORKSHEET.mdをDashboardまたはWrangler outputで埋める
- production DB_V2のreal UUIDを設定する
- productionの4個のRate Limiting bindingへ異なるreal namespace IDを設定する
- AUTH_EMAIL_FROM。AUTH_EMAIL_REPLY_TO。TURNSTILE_SITE_KEYを設定する
- EMAIL bindingのallowed_sender_addressesをAUTH_EMAIL_FROMへ制限する
- final HTTPS originを確認する
- Email Service sending domainのonboardingを確認する
- production secret 3個はGitへ書かない
- npm run manifest:sourceを実行する
- wrangler.tomlとSOURCE_SHA256SUMS.txtをcommitする
- 新しいclean exact 40-character release commitを記録する
- GitHub Actionsを使う場合だけ承認済みremoteへexact commitをpushする

localで作業clone rootから次を全て実行する:
npm ci
npm run verify:source-manifest
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run verify:final-docs
npm run verify:deployment
npm run verify:ai-ready
npm run deploy:dry-run
npm audit
npm audit --omit=dev

npm run check:stage08の実行上限は最低120分にする。一件でも失敗したらCloudflareを変更しない。失敗内容と再現commandを報告する。

staging config:
- docs/final-stage08/templates/WRANGLER_STAGING_TEMPLATE.tomlをsource外へコピーする
- canonical完成configはsource外に保持する
- productionと別のWorker。legacy DB。DB_V2。Queue。Rate Limiting namespace 4個。origin。Email。Turnstileを設定する
- canonical configのSHA-256を保存する
- scripts/materialize-staging-config.mjsでsource rootの.cpcv-staging.wrangler.tomlへ完全一致copyを作る
- staging secret 3個は文書またはGitへ書かない
- 次を成功させる

node scripts/verify-deployment-config.mjs .cpcv-staging.wrangler.toml
node scripts/verify-environment-separation.mjs wrangler.toml .cpcv-staging.wrangler.toml
node scripts/verify-ai-readiness.mjs --config .cpcv-staging.wrangler.toml
npx wrangler deploy --dry-run --config .cpcv-staging.wrangler.toml

staging:
- exact release commitをdeployする
- staging用database名と--config .cpcv-staging.wrangler.tomlを全remote commandへ明示する
- 10_STAGING_ACCEPTANCE_TEST.mdの44項目を全件実行する
- test dataを削除する
- staging deployment IDを保存する
- staging configのSHA-256を保存する
- 10_STAGING_ACCEPTANCE_TEST.mdのSHA-256を保存する
- templates/STAGING_ACCEPTANCE_RECORD_TEMPLATE.txtをsource外へコピーして埋める
- acceptance recordのSHA-256を保存する
- 次を成功させる

node scripts/verify-staging-evidence.mjs /absolute/path/staging-acceptance-record.txt --commit <EXACT_RELEASE_COMMIT> --deployment <STAGING_DEPLOYMENT_ID> --config-sha256 <STAGING_CONFIG_SHA256>

一件でも失敗したらproductionへ進まない。

production mutation前で停止する。次のread-only commandを実行して保存する:
npx wrangler whoami
npx wrangler d1 time-travel info class_comment_db_v2
npm run verify:stage82-preflight
npx wrangler d1 migrations list class_comment_db --remote
npx wrangler d1 migrations list class_comment_db_v2 --remote
node scripts/verify-remote-d1.mjs
npm run verify:email-auth-ready
npx wrangler deployments status
npx wrangler versions list

次をuserへ提示する:
- exact release commit
- staging commit
- staging deployment ID
- staging config SHA-256
- staging acceptance spec SHA-256
- staging acceptance record SHA-256
- production resource一覧
- deploy前DB_V2 Time Travel bookmark
- pending migration一覧
- rollback先exact Worker version ID
- 実行予定command

明示承認後だけproductionへ進む。推奨commandはPowerShellのscripts/safe-deploy.ps1とする。必要な環境変数:
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

safe-deployはcanonical staging configをsource rootへ一時materializeする。hash。内容。resource分離を検査する。D1 bookmark。migration一覧。Remote DB状態。rollback先versionを承認前に記録する。DEPLOY_PRODUCTIONの明示入力後だけmigration。secret書込。deployを実行する。

GitHub production workflowを使う場合:
- exact release commitが承認済みremoteに存在することを確認する
- production environmentへrequired reviewerを設定する
- workflow dispatch前にread-only preflight結果をuserへ提示する
- staging configと受入記録のbase64を入力する
- workflow内で復号。hash照合。内容照合。resource分離。staging dry-runを行う

rollback command:
npx wrangler versions list
npx wrangler rollback <EXACT_PREVIOUS_VERSION_ID>

Worker rollbackはD1 schema。binding。external resourceを自動で戻さない。D1 Time Travel restoreは別承認とする。

全outputをdeployment-recordsへ保存する。最後にSHA256SUMS.txtを生成する。runtime staging configは削除する。canonical外部configと受入記録は証跡として保持する。

最終成果物はexact commit。config差分。resource inventory。D1 bookmark。migration output。stagingとproductionのdeployment ID。staging config。staging acceptance record。production smoke record。rollback手順。全成果物SHA-256を含む一つの完全引継ぎZIPとする。
```
