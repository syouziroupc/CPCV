# 現行アーキテクチャ仕様

## 1. 基準

- Worker name: `class-pdf-comment-viewer-v01`
- entry: `src/index.js`
- compatibility date: `2026-06-17`
- code version: `0.8.1`
- base commit: `7d740e699ec4661cf3ec35f5bd4a86a2887422c9`
- Node.js: 22系
- Wrangler: 4.110.0

## 2. Cloudflare binding

| binding | Cloudflare resource | 役割 |
|---|---|---|
| `DB` | D1 `class_comment_db` | 旧互換投影 |
| `DB_V2` | D1 `class_comment_db_v2` | 現行正本 |
| `COMMENT_ROOM` | Durable Object `CommentRoom` | WebSocket broadcast |
| `ASSETS` | Workers Static Assets | UI配信 |
| `EMAIL` | Email Service | 確認。reset。招待。通知メール |
| `AI` | Workers AI | moderation助言。翻訳 |
| `AI_JOBS_QUEUE` | Queue `cpcv-ai-jobs` | 非同期AI job |
| Rate Limiting 4 bindings | Workers Rate Limiting | login。公開投稿。公開メール |


## 3. 実行handler

Workerは次のhandlerを持つ。

- `fetch`: HTTP。API。Static Assets。WebSocket upgrade
- `queue`: AI job consumer
- `scheduled`: retention。expired token。stale job cleanup

## 4. 主要source module

- `src/auth`: 認証。Cookie。CSRF。password。rate limit。email
- `src/routes`: API routing
- `src/comments`: コメントvalidation。repository。CSV
- `src/moderation`: 手動moderation
- `src/realtime`: Durable Object。event。ticket。edge limiter
- `src/ai`: provider。processor。privacy。repository
- `src/content-filter`: 言語判定。正規化。照合。pack
- `src/pdf-analysis`: PDF metadata。page状態。理解度。集計。CSV
- `src/db`: 旧DB投影

## 5. データフロー

### 教員

1. メールとpasswordでloginする。
2. WorkerはDB_V2でuser。membership。organizationを確認する。
3. HttpOnly Cookie sessionを発行する。
4. 教員は授業を作成する。
5. DB_V2へ授業を保存する。
6. 旧DBへ互換投影する。
7. PDFをbrowserで読み込む。
8. browserでSHA-256を計算する。
9. metadataだけをDB_V2へ保存する。
10. page変更をDB_V2へ保存する。

### Student

1. 公開codeから授業へ参加する。
2. 匿名participant token Cookieを取得する。
3. コメントを投稿する。
4. Durable Objectが検証済みrequestを受ける。
5. 辞書filterとmoderation modeを評価する。
6. D1へコメント。page link。Realtime eventを保存する。
7. Durable ObjectがViewerへbroadcastする。
8. 必要なAI jobだけQueueへ送る。

### Viewer

1. WebSocket ticketを取得する。
2. Durable Objectへ接続する。
3. sequence eventを受信する。
4. 欠落時はD1 catch-upを取得する。
5. 原文ではなく表示許可されたmessageと翻訳を表示する。

## 6. 正本とcache

- 認証。組織。授業。コメント。moderation。Realtime sequence。AI。辞書。PDF分析はDB_V2が正本である。
- Durable Object memoryは接続中cacheである。
- Static AssetsはUI配信物である。
- 旧DBは互換投影である。正本ではない。
- browser local stateは補助である。server状態より優先しない。

## 7. 障害分離

- AI障害でコメント投稿をrollbackしない。
- Email障害で既存loginを停止しない。
- Realtime通知失敗時はD1 catch-upで回復する。
- 旧DB投影失敗時は補償処理とauditを行う。
- Stage 8 migration未適用時はPDF分析だけを無効化する。既存投稿は継続する。
