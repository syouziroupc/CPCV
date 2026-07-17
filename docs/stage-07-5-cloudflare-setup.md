# Stage 7.5 Cloudflare設定手順

## 新規binding

ありません。

既存の`DB_V2`。`COMMENT_ROOM`。`AI`。`AI_JOBS_QUEUE`を維持します。

## Remote migration

stagingで先に実行します。

```bash
npx wrangler d1 migrations apply class_comment_db_v2 --remote
```

適用対象は`0011_dictionary_content_filter.sql`です。

## 初期状態

migration後も全policyと全授業filterは無効です。

本番で一括有効化しません。

Ownerがcategory policyを確認した後。授業ごとに有効化します。

## Rollback

0011は既存commentsへ列を追加します。Remote DBを手作業で逆migrationしません。

問題発生時は授業filterを無効化します。Workerを直前commitへ戻します。D1の追加tableと列は残します。
