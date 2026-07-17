# Deploy前最終checklist

## Source

- [ ] outer ZIP SHA-256一致
- [ ] source manifest一致
- [ ] exact 40-character commit確認
- [ ] clean working tree
- [ ] package version 0.8.2
- [ ] migration 0001〜0017不変

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
- [ ] DB_V2 real UUID
- [ ] Rate Limiting 4個。別namespace
- [ ] Email senderとreply-to
- [ ] Email sender allowlist
- [ ] Email sending domainとplan確認
- [ ] Turnstile site keyとhostname
- [ ] secret 3個
- [ ] productionとstagingの完全分離

## Staging

- [ ] exact production候補commitをdeploy
- [ ] acceptance test全件成功
- [ ] deployment ID記録
- [ ] acceptance record SHA-256記録
- [ ] `CPCV_STAGING_CONFIRMATION=STAGING_PASSED`
- [ ] test data cleanup

## Production

- [ ] staging commitがrelease commitと一致
- [ ] D1 bookmark保存
- [ ] `verify:stage82-preflight`成功
- [ ] migration output保存
- [ ] Remote D1検査成功
- [ ] 明示承認
- [ ] deploy
- [ ] Remote D1再検査
- [ ] production smoke
- [ ] deployment status。version。rollback先記録
