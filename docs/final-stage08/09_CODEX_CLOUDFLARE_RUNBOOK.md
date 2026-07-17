# Codex向け Cloudflare反映runbook

## 0. 作業方針

このrunbookはStage 8完成codeをCloudflareへ反映するための実行順序である。
Codexは設計を変更しない。
実値を推測しない。
productionへ直接deployしない。
各phaseの結果を`deployment-records/`へ保存する。

## 1. 正本確認

完全引継ぎZIPを空folderへ展開する。

確認する。

- `00_READ_FIRST.md`
- `FINAL_STAGE08_SPECIFICATION/00_INDEX.md`
- source ZIP SHA-256
- base commit
- `package.json` version 0.8.1

作業branchを作る。
既存sourceを上書きしない。

## 2. local preflight

```bash
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run visual:stage08
npm run deploy:dry-run
npm audit
npm audit --omit=dev
```

一件でも失敗したらCloudflare操作を開始しない。

## 3. Cloudflare loginとinventory

```bash
npx wrangler whoami
npx wrangler d1 list
npx wrangler queues list
npx wrangler deployments list
```

Dashboardでも次を確認する。

- Email Service sending domain
- Turnstile widget
- Workers AI利用可能性
- Queue metrics画面
- D1 production storage version

結果を保存する。

## 4. production値の記入

`13_CONFIGURATION_WORKSHEET.md`へ実値を記入する。
次を推測しない。

- account ID
- production DB_V2 UUID
- staging DB UUID
- rate limit namespace ID
- email sender
- Turnstile site key
- origin

## 5. staging resource

productionと別resourceを使う。
既存resourceがない場合だけ作る。

```bash
npx wrangler d1 create <STAGING_DB_NAME>
npx wrangler queues create <STAGING_QUEUE_NAME>
```

作成outputのUUIDを記録する。
Codexは勝手な名前でproduction resourceを作らない。

staging用configを作る。
production configを上書きしない。
`wrangler.staging.toml`またはrepositoryで合意された`env.staging`を使う。

## 6. secret設定

stagingへ先に設定する。

```bash
npx wrangler secret put AUTH_RATE_LIMIT_PEPPER --config wrangler.staging.toml
npx wrangler secret put PUBLIC_RATE_LIMIT_PEPPER --config wrangler.staging.toml
npx wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.staging.toml
```

production secretはstaging成功後に設定する。
secret値をshell history。log。documentへ出さない。

## 7. staging migration

```bash
npx wrangler d1 migrations apply <STAGING_DB_NAME> --remote --config wrangler.staging.toml
node scripts/verify-remote-d1.mjs
```

`verify-remote-d1.mjs`が固定DB名を使う場合はstaging用の環境変数または安全な一時copyで実行する。
production DBを検査対象にしない。

## 8. staging deploy

```bash
npx wrangler deploy --config wrangler.staging.toml
```

deploy outputのversion IDとdeployment IDを記録する。

## 9. staging acceptance

`10_STAGING_ACCEPTANCE_TEST.md`を全件実施する。
Network panelでPDF bytes。filename。page textが送信されないことを確認する。
Email。AI。Queue。Realtime。辞書。理解度。CSV。snapshotを確認する。

失敗した場合はproductionへ進まない。

## 10. production D1復旧点

```bash
npx wrangler d1 info class_comment_db_v2
npx wrangler d1 time-travel info class_comment_db_v2
```

現在bookmarkを記録する。
D1 Time Travelはrestore可能な期間を持つ。
restoreはDB全体を上書きするため通常rollbackには使わない。

## 11. production config検査

`wrangler.toml`へ実値を設定した後に実行する。

```bash
npm run verify:deployment
npm run verify:ai-ready
npm run verify:email-auth-ready
npm run deploy:dry-run
```

未確認Ownerがいる場合は`EMAIL_AUTH_REQUIRED=0`を維持する。

## 12. production migration

```bash
npx wrangler d1 migrations apply class_comment_db_v2 --remote
node scripts/verify-remote-d1.mjs
```

legacy DBへ未適用migrationがある場合だけ次を実行する。

```bash
npx wrangler d1 migrations apply class_comment_db --remote
```

migration outputを保存する。

## 13. production deploy

推奨は既存safe scriptを使う。

```powershell
$env:AUTH_RATE_LIMIT_PEPPER = '<SECRET>'
$env:PUBLIC_RATE_LIMIT_PEPPER = '<SECRET>'
$env:TURNSTILE_SECRET_KEY = '<SECRET>'
npm run deploy
```

scriptは`DEPLOY_PRODUCTION`の手入力を要求する。
Codexはuserの明示承認なしに入力しない。

手動deployを使う場合:

```bash
npx wrangler deploy
```

## 14. production smoke

- login
- 授業作成
- Student join
- コメント投稿
- moderation
- Viewer Realtime
- email request
- dictionary pack
- AI queue
- PDF bind
- page change
- understanding
- snapshot
- CSV checksum
- retention query

Queue backlogとWorker errorを確認する。

## 15. 作業記録

最低限次を保存する。

- 実行日時とtimezone
- source SHA-256
- Git commit
- Wrangler version
- Cloudflare account
- resource ID一覧
- D1 bookmark
- migration output
- staging URL。version ID
- production version ID
- smoke結果
- rollback要否
