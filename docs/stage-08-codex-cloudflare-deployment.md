# Codex実行指示: Stage 8をCloudflareへ反映

## 0. 絶対条件

この作業はStage 8.1完成後の別作業である。
Stage 8.1の設計変更を行わない。
実値を推測しない。
productionへ直接入らずstagingを先に使う。

基準commitとZIP SHA-256は完全引継ぎZIPの`00_READ_FIRST.md`で確認する。

## 1. 読む順序

1. `00_READ_FIRST.md`
2. `docs/stage-08-precision-cloudflare-deployment.md`
3. `docs/stage-08-handoff.md`
4. `docs/stage-08-spec.md`
5. `docs/stage-08-db-spec.md`
6. `docs/stage-08-api-contract.md`
7. `docs/stage-08-precision-rollback.md`
8. `docs/cloudflare-deployment-prerequisites.md`

## 2. local再検証

```bash
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run visual:stage08
npm run deploy:dry-run
npm audit
npm audit --omit=dev
```

一件でも失敗したらCloudflare操作を開始しない。

## 3. Cloudflare resource確認

- `DB`の実binding
- `DB_V2`の実UUID
- `COMMENT_ROOM`
- `ASSETS`
- `EMAIL`
- `AI`
- `AI_JOBS_QUEUE`
- 4個のRate Limiting binding
- Cron Trigger
- Turnstile
- Email Service domain
- 必須varsとsecrets

```bash
npm run verify:deployment
npm run verify:ai-ready
```

既存Ownerに未確認emailがある場合は`EMAIL_AUTH_REQUIRED=0`を維持する。

## 4. D1復旧点

Remote databaseがTime Travel対応か確認する。

```bash
npx wrangler d1 info class_comment_db_v2
npx wrangler d1 time-travel info class_comment_db_v2
```

表示された現在bookmarkを作業記録へ保存する。
D1 Time Travelは常時有効だがrestoreは破壊的操作である。通常のrollbackではrestoreしない。

## 5. migration先行

```bash
npx wrangler d1 migrations apply class_comment_db_v2 --remote
```

未適用migrationだけを適用する。Cloudflareはmigration apply時にもbackupを取得する。

適用後。

```bash
node scripts/verify-remote-d1.mjs
```

次を確認する。

- `0015_pdf_page_analytics.sql`と`0016_stage08_precision_hardening.sql`が`d1_migrations`に記録
- 必須tableが全て存在
- moderation。Realtime。quota triggerが存在
- `PRAGMA foreign_key_check`が0件
- `PRAGMA quick_check`が`ok`
- active Ownerが一人以上

## 6. staging deploy

staging用Worker。staging用DB_V2。staging用Queueを使用する。
production resourceをstagingから共有しない。

```bash
npx wrangler deploy --env staging
```

実際の環境名が異なる場合はrepositoryに定義された名前だけを使う。勝手に作らない。

## 7. staging smoke

1. Owner login
2. test授業作成
3. PDF選択
4. browser networkでPDF bytesが送信されないことを確認
5. page 1からpage 3へ移動
6. Student三人でunderstanding回答
7. コメント投稿
8. コメントがpage 3へ紐付くことを確認
9. 二人だけのpageで内訳が抑制されることを確認
10. snapshot作成
11. CSVにparticipant ID。nickname。comment textがないことを確認
12. checksum headerを確認
13. AI。辞書。メール。Realtimeの既存smoke

## 8. production deploy

stagingが全件成功した場合だけ実施する。

```bash
npx wrangler deploy
```

deploy直後に`node scripts/verify-remote-d1.mjs`とproduction smokeを再実行する。

## 9. 作業記録

次を残す。

- 実行日時とtimezone
- deploy前bookmark
- migration出力
- Worker version/deployment ID
- Remote D1検査結果
- staging smoke
- production smoke
- rollback要否
- Git commit

## 10. 禁止

- PDF本体をR2。D1。KVへ保存
- migration 0001から0016の編集
- production DBで手動DELETE
- Time Travel restoreを確認なしで実行
- Stage 8.1と無関係な機能修正
- 実値の推測
