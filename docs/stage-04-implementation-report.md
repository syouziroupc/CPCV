# CPCV Stage 4 実装報告

## 1. 完了範囲

匿名参加者とコメントを`DB_V2`へ永続保存する機能を実装した。GitHub、Cloudflare remote、本番deployは実行していない。

## 2. Database

`migrations-v2/0003_comments.sql`を追加した。

- `participants`
- `comments`
- `comment_events`
- 授業内idempotency uniqueness
- retention index
- moderation state列
- organization、session、participant複合外部キー

生IP、User-Agent、端末指紋の列は追加していない。

## 3. Public posting

- 授業ごとのHttpOnly Cookieを発行
- tokenのSHA-256 hashだけを保存
- server生成comment ID
- NFKC正規化
- 140 Unicode code points制限
- 10秒投稿間隔
- idempotency keyによる再送重複防止
- D1保存成功後だけbroadcast
- duplicateを再broadcastしない

旧公開投稿handlerを削除し、公開APIは常に`DB_V2`を正本として使用する。

## 4. Authenticated history

- `GET /api/private/sessions/:sessionId/comments`
- `GET /api/private/sessions/:sessionId/comments/export`
- cursor pagination
- Teacher所有授業制限
- Owner、Adminの組織境界
- CSV formula injection対策

## 5. Retention

- default 30日
- `COMMENT_RETENTION_DAYS`は1〜365日
- scheduled handler
- Owner限定手動maintenance endpoint
- event cascade delete
- orphan participant削除

## 6. Client

- Student UIの永続LocalStorage client IDを撤去
- 送信中は同じidempotency keyを再利用
- Viewer CSVをserver exportへ移行
- Viewer local cacheからIP項目を撤去
- privacy noticeを実装内容に合わせた

## 7. 完了判定

- Stage 2からStage 4まで487件成功
- 失敗0件
- migration初回適用成功
- migration再実行no-op
- `foreign_key_check`成功
- `quick_check`成功
- Wrangler dry-run成功
- npm audit 0件
- desktop、mobileの横overflowなし
- ZIP再展開試験は成果物作成時に実施
