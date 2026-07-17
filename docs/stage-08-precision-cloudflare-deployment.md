# Codex向け Stage 8.1 Cloudflare反映手順

## 0. 基準

完全引継ぎZIPの`00_READ_FIRST.md`に記載されたsource SHA-256とGit commitを照合する。実値を推測しない。Cloudflareへ変更する前にlocal試験を完了する。

## 1. local確認

```bash
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run deploy:dry-run
npm audit
npm audit --omit=dev
```

失敗が一件でもあれば停止する。

## 2. Remote資源の確認

- `DB_V2`の実UUIDとdatabase name
- `DB`をmigration先に選んでいないこと
- `COMMENT_ROOM`
- `EMAIL`
- `AI`
- `AI_JOBS_QUEUE`
- Rate Limiting bindings
- Cron Trigger
- varsとsecrets

## 3. D1復旧点

```bash
npx wrangler d1 info class_comment_db_v2
npx wrangler d1 time-travel info class_comment_db_v2
```

現在bookmarkを作業記録へ保存する。

## 4. migration

```bash
npx wrangler d1 migrations apply class_comment_db_v2 --remote
node scripts/verify-remote-d1.mjs
```

必須確認:

- `0015_pdf_page_analytics.sql`
- `0016_stage08_precision_hardening.sql`
- Stage 8 tables
- Stage 8.1 hardening triggers
- foreign key異常0
- quick check `ok`
- active Ownerが存在

## 5. staging

productionとは別のWorker。DB。Queueを使う。

- Owner login
- 同じPDFを二回選択してpage状態が維持される
- 別PDF切替で旧snapshotが作られる
- PDF bytes。filename。page textがnetworkへ出ない
- コメント受付OFFでも理解度を送信できる
- page切替競合時に再回答を求める
- 2人では内訳非表示。3人で表示
- snapshot作成とCSV checksum
- snapshot DB改変試験はstaging専用dataだけで行い。破損検知後に削除する
- 認証。メール。AI。辞書。Realtimeの既存smoke

## 6. production

staging成功後のみdeployする。deploy後にRemote検査とsmokeを再実行する。

## 7. 禁止

- PDF本体をD1。R2。KVへ保存
- 0001から0016の既存migrationを編集
- production DBで手動DELETEまたはUPDATE
- Time Travel restoreを承認なしで実行
- 実値を推測
- unrelated refactor
