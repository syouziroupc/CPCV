# Codex Cloudflare反映runbook

この文書は`20_CODEX_DEPLOY_INSTRUCTION_FINAL.md`の実行手順です。Cloudflareを変更する前に最後まで読みます。

## 1. 引継ぎ成果物を固定する

完全引継ぎZIPと同名の`.zip.sha256`を同じ場所へ置きます。companion hashがない場合は停止します。

```bash
sha256sum -c CPCV_stage08_2_final_complete_handoff.zip.sha256
unzip CPCV_stage08_2_final_complete_handoff.zip -d cpcv-handoff
cd cpcv-handoff/CPCV_stage08_2_final_complete_handoff
sha256sum -c SHA256SUMS.txt
```

Git履歴bundleから作業treeを新規作成します。`source/expanded-source`は参照用snapshotです。そこをGit作業treeとして使いません。

```bash
git bundle verify git/CPCV_stage08_2_history.bundle
git clone git/CPCV_stage08_2_history.bundle ../cpcv-stage08-work
cd ../cpcv-stage08-work
git status --porcelain
git rev-parse HEAD
npm run verify:source-manifest
```

初期HEADはouterの`git/GIT_RECORD.txt`と`RELEASE_RECORD.txt`に記載された40文字commitと一致させます。`SOURCE_GIT_RECORD.txt`はsource履歴記録です。最終package commitの確認には使いません。

## 2. production非secret値を確定してrelease commitを作る

DashboardまたはWrangler出力で`13_CONFIGURATION_WORKSHEET.md`を埋めます。値を推測しません。

`wrangler.toml`へDB_V2 real UUID。Rate Limiting namespace ID 4個。Email sender。reply-to。Turnstile site key。sender allowlist。final HTTPS originを設定します。secret 3個はGitへ書きません。

```bash
npm run manifest:source
git add wrangler.toml SOURCE_SHA256SUMS.txt
git commit -m "Configure verified production deployment resources"
npm run verify:source-manifest
git status --porcelain
git rev-parse HEAD
```

ここで得たcleanな40文字commitをrelease commitとします。以後stagingとproductionで同じcommitを使います。

GitHub Actionsを使う場合はexact commitを承認済みremote repositoryへ明示的にpushします。pushされていないbundle内commitをActionsはcheckoutできません。pushしない場合はlocalの`scripts/safe-deploy.ps1`だけを使います。

## 3. local validation

作業tree rootで実行します。

```bash
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
```

`check:stage08`の上限は120分以上にします。一件でも失敗したらCloudflareを変更しません。

## 4. staging config

`templates/WRANGLER_STAGING_TEMPLATE.toml`をsource外へコピーします。canonical完成ファイルはsource外に保持します。

```bash
cp docs/final-stage08/templates/WRANGLER_STAGING_TEMPLATE.toml /absolute/external/path/wrangler.staging.toml
```

productionと異なるWorker。legacy DB。DB_V2。Queue。Rate Limiting namespace 4個。origin。Email。Turnstileを設定します。

Wranglerはconfig file基準でentry point。assets。migration pathを解決します。canonical外部configを直接Wranglerへ渡しません。完全一致するignored runtime copyをsource rootへ作ります。

```bash
STAGING_CONFIG_SHA256=$(sha256sum /absolute/external/path/wrangler.staging.toml | cut -d' ' -f1)
node scripts/materialize-staging-config.mjs /absolute/external/path/wrangler.staging.toml \
  --expected-sha256 "$STAGING_CONFIG_SHA256"
node scripts/verify-deployment-config.mjs .cpcv-staging.wrangler.toml
node scripts/verify-environment-separation.mjs wrangler.toml .cpcv-staging.wrangler.toml
node scripts/verify-ai-readiness.mjs --config .cpcv-staging.wrangler.toml
npx wrangler deploy --dry-run --config .cpcv-staging.wrangler.toml
```

`.cpcv-staging.wrangler.toml`はGit ignoredです。canonical外部configと同じSHA-256でなければ使用しません。

## 5. staging反映

同じrelease commitを使います。全remote commandへstaging database名とruntime configを明示します。

```bash
npx wrangler d1 migrations apply <STAGING_LEGACY_DB_NAME> --remote --config .cpcv-staging.wrangler.toml
npx wrangler d1 migrations apply <STAGING_DB_V2_NAME> --remote --config .cpcv-staging.wrangler.toml
node scripts/verify-remote-d1.mjs --database <STAGING_DB_V2_NAME> --config .cpcv-staging.wrangler.toml
node scripts/configure-rate-limit-secret.mjs --config .cpcv-staging.wrangler.toml
npx wrangler deploy --config .cpcv-staging.wrangler.toml
node scripts/smoke-production.mjs --config .cpcv-staging.wrangler.toml
```

`10_STAGING_ACCEPTANCE_TEST.md`の44項目を全件実行します。完了後に受入記録templateをsource外へコピーして埋めます。

```bash
sha256sum docs/final-stage08/10_STAGING_ACCEPTANCE_TEST.md
sha256sum /absolute/external/path/wrangler.staging.toml
sha256sum /absolute/external/path/staging-acceptance-record.txt
node scripts/verify-staging-evidence.mjs /absolute/external/path/staging-acceptance-record.txt \
  --commit <EXACT_RELEASE_COMMIT> \
  --deployment <STAGING_DEPLOYMENT_ID> \
  --config-sha256 <STAGING_CONFIG_SHA256>
```

受入記録は44項目。失敗0件。現行受入試験書SHA-256と一致しなければ不合格です。

## 6. production前のread-only停止点

production変更前に次を実行して保存します。ここまではmigration。secret書込。deploy。restoreをしません。

```bash
npx wrangler whoami
npx wrangler d1 time-travel info class_comment_db_v2
npm run verify:stage82-preflight
npx wrangler d1 migrations list class_comment_db --remote
npx wrangler d1 migrations list class_comment_db_v2 --remote
node scripts/verify-remote-d1.mjs
npm run verify:email-auth-ready
npx wrangler deployments status
npx wrangler versions list
```

exact release commit。staging deployment ID。2つのstaging hash。production resource一覧。D1 bookmark。pending migration。rollback先version。実行予定commandをuserへ提示します。明示承認がない場合は停止します。

## 7. production

推奨は`scripts/safe-deploy.ps1`です。canonical staging configと受入記録はsource外に置きます。

```text
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
```

PowerShellはread-only preflightとrollback情報を記録した後に`DEPLOY_PRODUCTION`を要求します。明示入力後だけmigration。secret設定。deployを実行します。

GitHub Actionsを使う場合はexact release commitを先にremoteへpushします。workflow dispatch前にread-only結果をuserへ提示します。GitHub `production` environmentにはrequired reviewerを設定します。

## 8. rollback

```bash
npx wrangler versions list
npx wrangler rollback <EXACT_PREVIOUS_VERSION_ID>
```

Worker rollbackはWorker code/versionを戻します。D1 migration。binding。external resourceは自動で戻りません。D1 Time Travel restoreは別の破壊的操作です。影響範囲を示して明示承認を得るまで実行しません。

## 9. cleanup

```bash
rm -f .cpcv-staging.wrangler.toml
```

canonical外部configと受入記録は証跡として保持します。

## 10. 禁止

- UUID。namespace ID。secret。domainの推測
- migration `0001`〜`0017`の編集
- dirty treeでのdeploy
- staging省略
- stagingとproductionのresource共有
- 異なるcommitのproduction反映
- user承認前のproduction mutation
- user承認なしのTime Travel restore
- PDF bytes。filename。page text。画像。注釈の送信
- reviewed runbookなしのproduction data修正
