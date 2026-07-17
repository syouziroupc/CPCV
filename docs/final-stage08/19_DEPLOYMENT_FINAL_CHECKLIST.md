# Deploy前最終checklist

## HandoffとGit

- [ ] companion `.zip.sha256`が存在
- [ ] outer ZIP SHA-256一致
- [ ] outer `SHA256SUMS.txt`一致
- [ ] Git bundle verify成功
- [ ] bundleから新規clone
- [ ] 初期HEADがouter `GIT_RECORD.txt`と一致
- [ ] clean working tree
- [ ] source manifest一致
- [ ] package version 0.8.2
- [ ] migration `0001`〜`0017`不変

## Release commit

- [ ] production非secret実値を`wrangler.toml`へ設定
- [ ] secretをGitへ書いていない
- [ ] `npm run manifest:source`
- [ ] production configとmanifestをcommit
- [ ] 新しいexact 40-character release commit確認
- [ ] clean working tree
- [ ] `npm run verify:source-manifest`
- [ ] GitHub workflow利用時はexact commitを承認済みremoteへpush

## Local

- [ ] `npm ci`
- [ ] `npm run check`
- [ ] `npm run check:project`
- [ ] `npm run check:pdf-links`
- [ ] `npm run check:stage08`。実行上限120分以上
- [ ] `npm run test:owner-bootstrap`
- [ ] `npm run verify:final-docs`
- [ ] `npm run verify:deployment`
- [ ] `npm run verify:ai-ready`
- [ ] `npm run deploy:dry-run`
- [ ] `npm audit`
- [ ] `npm audit --omit=dev`

## Cloudflare config

- [ ] production DB_V2 real UUID
- [ ] production Rate Limiting 4個。別namespace
- [ ] Email senderとreply-to
- [ ] Email sender allowlist
- [ ] Email sending domainとplan確認
- [ ] Turnstile site keyとhostname
- [ ] production secret 3個

## Staging

- [ ] canonical staging configをsource外へ作成
- [ ] canonical config SHA-256記録
- [ ] `materialize-staging-config`でsource rootへ完全一致copy作成
- [ ] runtime copy SHA-256一致
- [ ] `verify-deployment-config`成功
- [ ] `verify-environment-separation`成功。productionとstagingのresource共有なし
- [ ] staging dry-run成功
- [ ] staging secret 3個設定
- [ ] exact production候補commitをdeploy
- [ ] acceptance test 44件成功
- [ ] acceptance spec SHA-256記録
- [ ] test data cleanup完了
- [ ] deployment ID記録
- [ ] acceptance record SHA-256記録
- [ ] `verify-staging-evidence`成功
- [ ] `CPCV_STAGING_CONFIRMATION=STAGING_PASSED`
- [ ] runtime staging config削除

## Production read-only gate

- [ ] staging commitがrelease commitと一致
- [ ] staging configと受入記録の実ファイルhash一致
- [ ] D1 bookmark保存
- [ ] `verify:stage82-preflight`成功
- [ ] pending migration一覧保存
- [ ] Remote D1検査成功
- [ ] deployment status保存
- [ ] rollback先exact Worker version ID確定
- [ ] 実行予定commandを提示
- [ ] 明示承認

## Production mutationと事後検査

- [ ] migration適用output保存
- [ ] Remote D1再検査
- [ ] secret設定
- [ ] deploy
- [ ] Remote D1再検査
- [ ] production smoke
- [ ] deployment statusとversion保存
- [ ] deployment recordsのSHA-256一覧生成
- [ ] rollback command `npx wrangler rollback <VERSION_ID>`確認
