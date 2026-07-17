# Stage 8 rollback

## 基本方針

migration 0015はappend-onlyで残す。
旧Stage 7.8 Workerは新tableを参照しないため。通常のrollbackはWorkerだけをStage 7.8へ戻す。

## Worker rollback

1. 新規PDF binding操作を停止
2. Stage 8 deployment IDを記録
3. Cloudflareの既存deployment rollbackまたはStage 7.8 exact commitをdeploy
4. コメント。認証。Realtime。AI。辞書filterをsmoke
5. D1 tableは削除しない

Stage 8 tableに残ったmetadataと匿名集計は旧Workerから使用されない。

## D1 restore

次の場合だけ検討する。

- migrationが既存tableを破損
- 既存コメントや認証dataが不整合
- Worker rollbackだけで回復しない

Time Travel restoreはdatabase全体を上書きする。
作業中に発生した正当な新規dataも失う。
実行前に利用者承認。影響範囲。restore先bookmarkを確定する。

```bash
npx wrangler d1 time-travel restore class_comment_db_v2 --bookmark=<RECORDED_BOOKMARK>
```

restore後に返されるprevious bookmarkも記録する。undoに必要になる。

## Stage 8機能だけ停止

Worker rollbackをせず一時停止する場合は教員がPDFを新規bindingしない。
既存bindingを解除するAPIはStage 8にない。完全停止にはStage 7.8 Worker rollbackを使う。
