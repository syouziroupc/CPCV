# Codex Cloudflare反映runbook

このrunbookは`20_CODEX_DEPLOY_INSTRUCTION_FINAL.md`の実行手順です。

## 1. source固定

- outer handoffのSHA-256を検証する。
- source manifestを検証する。
- exact 40-character Git commitを確認する。
- `git status --porcelain`が空であることを確認する。
- sourceを修正した場合は検査をやり直し。新commitと新manifestを作る。

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

一件でも失敗したらCloudflare操作をしません。

## 3. external resource inventory

`13_CONFIGURATION_WORKSHEET.md`を実値で埋めます。DashboardまたはWrangler出力だけを使用します。

必須です。

- productionとstagingの別Worker
- productionとstagingの別DB_V2
- productionとstagingの別Queue
- production DB_V2 UUID
- 4個の異なるRate Limiting namespace ID
- Email Service sending domain
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_REPLY_TO`
- `allowed_sender_addresses`
- Turnstile site keyとsecret
- rate-limit pepper 2個
- productionとstaging origin

任意の受信者へ送る場合はEmail Serviceの利用条件とaccount planをDashboardで確認します。

## 4. production config gate

実値反映後に実行します。

```bash
npm run verify:deployment
npm run verify:ai-ready
npm run deploy:dry-run
```

失敗を無視しません。

## 5. staging

production resourceを共有しません。同じrelease commitをstagingへdeployします。`10_STAGING_ACCEPTANCE_TEST.md`を全件実行します。

保存します。

- staging commit
- staging deploymentまたはversion ID
- acceptance record
- acceptance record SHA-256
- resource inventory
- test data cleanup記録

## 6. production前停止

次を提示して明示承認を得ます。

- exact release commit
- staging deployment ID
- staging acceptance record SHA-256
- production resource一覧
- deploy前D1 bookmark
- pending migration一覧
- rollback先Worker deployment
- 実行予定command

## 7. D1

```bash
npx wrangler d1 info class_comment_db_v2
npx wrangler d1 time-travel info class_comment_db_v2
npm run verify:stage82-preflight
npx wrangler d1 migrations apply class_comment_db --remote
npx wrangler d1 migrations apply class_comment_db_v2 --remote
node scripts/verify-remote-d1.mjs
```

legacy migrationはpendingがある場合だけ適用します。outputを保存します。

## 8. secretとdeploy

```bash
node scripts/configure-rate-limit-secret.mjs
npx wrangler deploy
node scripts/verify-remote-d1.mjs
node scripts/smoke-production.mjs
npx wrangler deployments status
npx wrangler versions list
```

## 9. 禁止

- design変更
- unrelated refactor
- external IDの推測
- `0001`〜`0017`の編集
- productionへ直接deploy
- stagingとproductionのresource共有
- user承認なしの`DEPLOY_PRODUCTION`
- user承認なしのTime Travel restore
- PDF本体またはpage textの送信
- reviewed runbookなしのproduction data repair
