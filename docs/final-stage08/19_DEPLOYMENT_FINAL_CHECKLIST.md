# Deploy前最終checklist

## Source

- [ ] outer ZIP SHA-256一致
- [ ] source manifest一致
- [ ] exact 40-character commit確認
- [ ] clean working tree
- [ ] package version 0.8.2
- [ ] migration `0001`〜`0017`不変

## Local

- [ ] `npm ci`
- [ ] `npm run check`
- [ ] `npm run check:project`
- [ ] `npm run check:pdf-links`
- [ ] `npm run check:stage08`。実行上限120分以上
- [ ] `npm run test:owner-bootstrap`
- [ ] `npm run verify:final-docs`
- [ ] `npm run deploy:dry-run`
- [ ] `npm audit`
- [ ] `npm audit --omit=dev`

## Cloudflare config

- [ ] `npm run verify:deployment`
- [ ] production DB_V2 real UUID
- [ ] production Rate Limiting 4個。別namespace
- [ ] Email senderとreply-to
- [ ] Email sender allowlist
- [ ] Email sending domainとplan確認
- [ ] Turnstile site keyとhostname
- [ ] production secret 3個

## Staging

- [ ] external staging config作成
- [ ] `verify-deployment-config`成功
- [ ] `verify-environment-separation`成功。productionとstagingのresource共有なし
- [ ] staging secret 3個設定
- [ ] exact production候補commitをdeploy
- [ ] acceptance test全件成功
- [ ] test data cleanup完了
- [ ] deployment ID記録
- [ ] staging config SHA-256記録
- [ ] acceptance record SHA-256記録
- [ ] `verify-staging-evidence`成功
- [ ] `CPCV_STAGING_CONFIRMATION=STAGING_PASSED`

## Production

- [ ] staging commitがrelease commitと一致
- [ ] staging configと受入記録の実ファイルhash一致
- [ ] D1 bookmark保存
- [ ] `verify:stage82-preflight`成功
- [ ] migration一覧と適用output保存
- [ ] Remote D1検査成功
- [ ] rollback先version確定
- [ ] 明示承認
- [ ] deploy
- [ ] Remote D1再検査
- [ ] production smoke
- [ ] deployment statusとversion保存
- [ ] deployment recordsのSHA-256一覧生成
