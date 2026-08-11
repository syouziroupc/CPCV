# CPCV 現行システム基準

更新基準: Stage 8.2。Web package version `0.8.10`。Windows Desktop提出候補 `0.2.2`。

v0.8.10は操作性、Realtime、filter、AI処理、翻訳、公開入力、mobile表示を含む現行release系列です。授業操作は一画面へ統合し、組織辞書とAI上限はアカウント設定で管理します。Desktopは現行Web UI/APIを利用し、投影用の透明オーバーレイを追加します。

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
| legacy AI Queue | `AI_JOBS_QUEUE` / `cpcv-ai-jobs` |
| translation Queue | `AI_TRANSLATION_QUEUE` / `cpcv-ai-translation-jobs` |
| moderation Queue | `AI_MODERATION_QUEUE` / `cpcv-ai-moderation-jobs` |
| assets | `ASSETS` / `public/` |
| migration | `migrations-v2/0001`〜`0017` |
| scheduled recovery | 5分ごと |
| daily retention | UTC 03:17 |
| Desktop | `desktop-overlay-poc/` / `0.2.2` |

productionのbinding、Queue、Rate Limiting、origin、model、timeout等の現在値は`wrangler.toml`を正本とします。

## データ境界

`DB_V2`が正本です。legacy `DB`は互換投影先です。授業終了と削除でV2側が失敗した場合はlegacy投影を復元します。復元できない場合は`SESSION_PROJECTION_INCONSISTENT`で停止します。

Stage 8.2 migration `0017_final_integrity_hardening.sql`は組織・session・comment・AI jobのcontextをtriggerで強制します。永続triggerは42本です。既存不整合が一件でもある場合はmigrationを中止します。

## 認証

- HttpOnly Cookie
- productionでSecureとSameSite=Strict
- unsafe requestでOrigin完全一致、JSON、CSRF
- PBKDF2-HMAC-SHA-256。現行schemeは100,000 iterations。既存の600,000-iteration v2 hashは検証互換のみ残し、次回認証時の再hash対象
- login IPとaccountのRate Limiting
- limiter障害時はfail closed
- password変更は組織context取得後に一括確定
- session GETはcontext確認後にCSRF tokenを発行

## コメントとRealtime

- participant tokenはhash保存
- idempotency keyはparticipant単位
- 期限切れcommentはcron前でも読取対象外
- Realtime sequenceの正本はD1
- 期限切れeventはcatch-upとsnapshotから除外
- WebSocket ticketは一回だけ原子的に消費
- 接続中認証は定期的に再検証
- Durable Object経由の配信失敗はbounded retryとdelivery-only retryで処理

## filterとAI

- filterは全active termを評価する
- response evidenceだけ100件に制限する
- active term上限2000件をD1 triggerで強制する
- mutationとauditは同じD1 batch
- AI resultはjob claim identityが一致する場合だけ確定する
- stale workerはresult、translation、Realtimeを更新できない
- 期限切れcomment本文をproviderへ送らない
- translationとmoderationは独立Queueで処理し、legacy Queueは旧messageのdrain用に残す
- 失敗jobはscheduled recoveryで回収する

## PDF分析

browserから送る値はSHA-256、補助fingerprint、page count、file size、現在pageです。PDF bytes、filename、page textは送信しません。

page更新は実際の更新件数とevent IDで勝者を確定します。理解度はactive sessionと表示中pageが一致する場合だけ保存します。切断後の推定滞在時間は加算しません。snapshotとauditは同じbatchで確定します。

## Desktop

Windows Desktop `0.2.2`はWeb版 `0.8.10` の`/admin`、`/viewer/{sessionId}`、認証・授業APIを利用します。コメント表示状態はWeb側を正本とし、Desktop独自の授業状態を持ちません。投影ウィンドウは枠なし、最前面、非focus、cursor透過で、非メインdisplayを優先します。

WebとのDOM/API/Worker契約は`desktop-overlay-poc/scripts/check-current-web-contract.mjs`でCI検査します。

## deploy状態

source上のproduction設定には具体的なresource値が入っており、Wrangler dry-runと全Stage回帰はCIで検証します。production deploymentは`.github/workflows/deploy-production.yml`から手動実行し、exact commit、staging commit、staging deployment ID、受入記録SHA-256等を必須とします。

U-22凍結時は、最新sourceと本番Workerが同一であることをdeployment/version情報で別途確認して記録します。確認できていない状態を「配備済み」と推定しません。
