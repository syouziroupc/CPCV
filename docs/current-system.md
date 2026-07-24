# CPCV 現行システム基準

更新基準: Stage 8.2。package version `0.8.10`。

v0.8.10は操作性とAI安定化のデバッグreleaseである。授業操作は一画面へ統合した。組織辞書とAI上限はアカウント設定で管理する。AI Queueはbatch投入と並行処理を使用する。投影画面はcomment IDで重複表示を防ぐ。

## 構成

| 項目 | 現在値 |
|---|---|
| Worker | `class-pdf-comment-viewer-v01` |
| entry | `src/index.js` |
| Node.js | 22系 |
| legacy D1 | `DB` / `class_comment_db` |
| application source of truth | `DB_V2` / `class_comment_db_v2` |
| Durable Object | `COMMENT_ROOM` / `CommentRoom` |
| email | `EMAIL` / Cloudflare Email Service |
| AI | `AI` / Workers AI |
| Queue | `AI_JOBS_QUEUE` / `cpcv-ai-jobs` |
| assets | `ASSETS` / `public/` |
| migration | `migrations-v2/0001`〜`0017` |
| scheduled recovery | 5分ごと |
| daily retention | UTC 03:17 |

## データ境界

`DB_V2`が正本です。legacy `DB`は互換投影先です。授業終了と削除でV2側が失敗した場合はlegacy投影を復元します。復元できない場合は`SESSION_PROJECTION_INCONSISTENT`で停止します。

Stage 8.2 migration `0017_final_integrity_hardening.sql`は組織・session・comment・AI jobのcontextをtriggerで強制します。永続triggerは42本です。既存不整合が一件でもある場合はmigrationを中止します。

## 認証

- HttpOnly Cookie
- productionでSecureとSameSite=Strict
- unsafe requestでOrigin完全一致。JSON。CSRF
- PBKDF2-HMAC-SHA-256。600000 iterations
- login IPとaccountのRate Limiting
- limiter障害時は503でfail closed
- password変更は組織context取得後に一括確定
- session GETはcontext確認後にCSRF tokenを発行

## コメントとRealtime

- participant tokenはhash保存
- idempotency keyはparticipant単位
- 期限切れcommentはcron前でも読取対象外
- Realtime sequenceの正本はD1
- 期限切れeventはcatch-upとsnapshotから除外
- WebSocket ticketは一回だけ原子的に消費
- 接続中認証は5分ごとに再検証

## filterとAI

- filterは全termを評価する
- response evidenceだけ100件に制限する
- active term上限2000件をD1 triggerで強制する
- mutationとauditは同じD1 batch
- AI resultはjob claim identityが一致する場合だけ確定する
- stale workerはresult。translation。Realtimeを更新できない
- 期限切れcomment本文をWorkers AIへ送らない
- Queue失敗jobは5分ごとに回収する

## PDF分析

browserから送る値はSHA-256。補助fingerprint。page count。file size。現在pageです。PDF bytes。filename。page textは送信しません。

page更新は実際の更新件数とevent IDで勝者を確定します。理解度はactive sessionと表示中pageが一致する場合だけ保存します。切断後の推定滞在時間は加算しません。snapshotとauditは同じbatchで確定します。

## deploy状態

sourceとlocal検査はrelease candidateです。productionは未設定外部値のためblockedです。未設定一覧は`docs/final-stage08/17_CLOUDFLARE_PENDING_VALUES.md`を正本とします。
