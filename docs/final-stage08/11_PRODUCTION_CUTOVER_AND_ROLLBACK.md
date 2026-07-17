# Production切替とrollback

## 1. 切替条件

- local検査成功
- staging受入試験成功
- production config検査成功
- active Owner存在
- Email sender。Turnstile。Queue。AI確認
- D1 bookmark記録
- user承認

## 2. 切替順序

```text
production bookmark記録
→ DB_V2 migration
→ Remote D1検証
→ Worker deploy
→ production smoke
→ metrics監視
```

migration先行を原則とする。
WorkerにはStage 8 tableなしの互換処理があるが正式手順では使わない。

## 3. Worker rollback

通常rollbackはWorkerだけを直前versionへ戻す。
Stage 8 tableとtriggerは残す。
旧WorkerはStage 8 tableを参照しない。

```bash
npx wrangler deployments list
npx wrangler rollback <VERSION_ID>
```

rollbackは指定versionを100% activeにする。
rollback後に認証。投稿。moderation。Realtime。メール。AI。辞書をsmokeする。

## 4. D1 rollback

D1 Time Travelは次の場合だけ使う。

- Worker rollbackで解消しないDB破損
- migration後の重大な整合性破壊
- userが失われるdataを承認した

```bash
npx wrangler d1 time-travel restore class_comment_db_v2 --bookmark=<RECORDED_BOOKMARK>
```

restoreはDB全体を上書きする。
bookmark以後の正当なdataも失う。
実行前に影響範囲を記録する。

## 5. 機能flag rollback

- email強制を止める: `EMAIL_AUTH_REQUIRED=0`
- organization AIを無効化
- session AIを無効化
- session dictionary filterを無効化
- PDF bindingを新規作成しない

flag rollbackは既存dataを削除しない。

## 6. rollback禁止

- production DBでtableやtriggerを手動DROP
- 適用済みmigrationの編集
- production dataの手動DELETE
- 未記録bookmarkへのrestore
- source commit不明のdeploy

## 7. incident記録

- 発生時刻
- symptom
- affected organization/session
- Worker version
- D1 bookmark
- Queue backlog
- error log
- rollback操作
- data loss有無
- 再発防止
