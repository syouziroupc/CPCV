# Codex Cloudflare反映runbook

この文書は`20_CODEX_DEPLOY_INSTRUCTION_FINAL.md`の実行手順です。

## 1. source固定

- outer ZIPのSHA-256を確認する。
- `SOURCE_SHA256SUMS.txt`を確認する。
- `SOURCE_GIT_RECORD.txt`の40文字commitを確認する。
- `git status --porcelain`が空であることを確認する。
- sourceを変更した場合は全検査をやり直す。
- 新commitと新manifestを作る。

## 2. local validation

```bash
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
```

`check:stage08`の上限は120分以上にします。一件でも失敗したらCloudflareを変更しません。

## 3. 外部実値

`13_CONFIGURATION_WORKSHEET.md`をDashboardまたはWrangler出力で埋めます。secret値は書きません。

productionに必要です。

- DB_V2 UUID
- 4個の異なるRate Limiting namespace ID
- Email sending domain
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_REPLY_TO`
- `allowed_sender_addresses`
- Turnstile site key
- secret 3個

stagingには別のWorker。D1 2個。Queue。Rate Limiting namespace 4個。originが必要です。

## 4. staging config

`templates/WRANGLER_STAGING_TEMPLATE.toml`をsource外へコピーします。実値を設定します。

```bash
node scripts/verify-deployment-config.mjs /absolute/path/wrangler.staging.toml
node scripts/verify-environment-separation.mjs wrangler.toml /absolute/path/wrangler.staging.toml
node scripts/verify-ai-readiness.mjs --config /absolute/path/wrangler.staging.toml
npx wrangler deploy --dry-run --config /absolute/path/wrangler.staging.toml
```

productionと一つでもresourceを共有した場合は停止します。

## 5. staging反映

同じrelease commitを使います。

```bash
npx wrangler d1 migrations apply <STAGING_LEGACY_DB_NAME> --remote --config /absolute/path/wrangler.staging.toml
npx wrangler d1 migrations apply <STAGING_DB_V2_NAME> --remote --config /absolute/path/wrangler.staging.toml
node scripts/verify-remote-d1.mjs --database <STAGING_DB_V2_NAME> --config /absolute/path/wrangler.staging.toml
node scripts/configure-rate-limit-secret.mjs --config /absolute/path/wrangler.staging.toml
npx wrangler deploy --config /absolute/path/wrangler.staging.toml
node scripts/smoke-production.mjs --config /absolute/path/wrangler.staging.toml
```

`10_STAGING_ACCEPTANCE_TEST.md`を全件実行します。完了後に`templates/STAGING_ACCEPTANCE_RECORD_TEMPLATE.txt`を埋めます。

```bash
sha256sum /absolute/path/wrangler.staging.toml
sha256sum /absolute/path/staging-acceptance-record.txt
node scripts/verify-staging-evidence.mjs /absolute/path/staging-acceptance-record.txt \
  --commit <EXACT_COMMIT> \
  --deployment <STAGING_DEPLOYMENT_ID> \
  --config-sha256 <STAGING_CONFIG_SHA256>
```

## 6. production前停止

次を提示します。

- exact release commit
- staging deployment ID
- staging config SHA-256
- staging acceptance record SHA-256
- production resource一覧
- deploy前D1 bookmark
- pending migration一覧
- rollback先Worker version
- 実行予定command

明示承認がない場合は停止します。

## 7. production

推奨は`scripts/safe-deploy.ps1`です。staging configと受入記録はsource外に置きます。

必要な環境変数です。

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

PowerShellは明示入力`DEPLOY_PRODUCTION`の前に全検査を行います。実行後は`deployment-records`へ証跡とSHA-256一覧を保存します。

GitHub Actionsを使う場合はstaging configと受入記録のbase64も入力します。workflowは復号。hash照合。内容照合。resource分離検査を実行します。

## 8. 禁止

- UUID。namespace ID。secret。domainの推測
- migration `0001`〜`0017`の編集
- dirty treeでのdeploy
- staging省略
- stagingとproductionのresource共有
- 異なるcommitのproduction反映
- user承認なしのproduction deploy
- user承認なしのTime Travel restore
- PDF bytes。filename。page text。画像。注釈の送信
- reviewed runbookなしのproduction data修正
