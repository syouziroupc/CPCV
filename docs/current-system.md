# CPCV 現行システム基準

更新基準: Stage 8.1 v0.8.1

## 1. 構成

| 項目 | 現在値 |
|---|---|
| Worker | `class-pdf-comment-viewer-v01` |
| entry | `src/index.js` |
| package version | `0.8.1` |
| Node.js | 22系 |
| 旧互換D1 | `DB` / `class_comment_db` |
| 新版正本D1 | `DB_V2` / `class_comment_db_v2` |
| Durable Object | `COMMENT_ROOM` / `CommentRoom` |
| メール送信 | `EMAIL` / Cloudflare Email Service |
| AI実行 | `AI` / Workers AI |
| AI非同期処理 | `AI_JOBS_QUEUE` / Cloudflare Queues |
| 認証 | 確認済みメール + password + HttpOnly Cookie + CSRF + Origin完全一致 |
| コメント正本 | `DB_V2.comments` |
| Realtime順序正本 | `DB_V2.realtime_events` |
| 辞書filter正本 | `content_filter_terms`ほか |
| PDF | 先生端末内だけで処理 |
| PDF分析正本 | `pdf_documents`。`session_pdf_bindings`。`pdf_page_events`。`comment_page_links`。`understanding_signals`。`analytics_snapshots` |

## 2. 変更禁止の基礎契約

- sessionは一つのorganizationへ固定
- request bodyのorganization IDを権限根拠にしない
- Studentは匿名参加者
- raw認証tokenをD1へ保存しない
- PDF bytes。filename。page text。画像をserverへ送らない
- AIは手動moderation stateを自動変更しない
- 翻訳は原文と別保存
- Realtime順序正本はD1

## 3. PDF分析

serverへ保存するPDF情報はSHA-256。任意fingerprint。page数。file sizeだけです。

- PDF bindingは組織と授業へ固定
- 同一PDF再選択は状態を初期化しない
- 別PDFへ切替える前に旧分析snapshotを自動作成
- コメントはserverの現在pageへ紐付け
- 理解度は`understood`。`unsure`。`confused`
- page切替競合時は理解度を保存しない
- コメント受付OFFでも授業中なら理解度を送信可能
- distinct participantが3人未満なら理解度内訳を非表示
- snapshotはJSONとSHA-256 checksumを保存
- snapshot読出し時にもchecksumを再計算
- コメント。理解度。page event。snapshotは保持期限後に即座に集計対象外

## 4. DB_V2 migration

1. `0001_initial_schema.sql`
2. `0002_auth_security.sql`
3. `0003_comments.sql`
4. `0004_precision_hardening.sql`
5. `0005_comment_content_guards.sql`
6. `0006_manual_moderation.sql`
7. `0007_realtime.sql`
8. `0008_email_auth.sql`
9. `0009_account_lifecycle.sql`
10. `0010_ai_moderation_translation.sql`
11. `0011_dictionary_content_filter.sql`
12. `0012_multilingual_filter_usability.sql`
13. `0013_bilingual_filter_translation_safety.sql`
14. `0014_filter_pack_expansion.sql`
15. `0015_pdf_page_analytics.sql`
16. `0016_stage08_precision_hardening.sql`

`0016`はpage範囲。組織境界。document整合性。証拠行の作成後不変性をD1 triggerで強制します。既存migrationを編集しません。

## 5. Cleanupと論理期限

scheduled cleanupは期限切れの理解度。snapshot。page event。終了済みbinding。孤立PDF metadataを削除します。

cronの遅延中もquery側が現在時刻と`expires_at`を比較します。期限切れdataを集計。CSV。snapshot取得へ戻しません。

## 6. 検査

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

Remote確認は`node scripts/verify-remote-d1.mjs`を使用します。migration 0016とStage 8.1 triggerを確認します。

## 7. Deployment状態

GitHub push。Remote D1 migration。staging deploy。production deployは未実施です。

Codexは`docs/stage-08-precision-cloudflare-deployment.md`に従います。Remote D1のTime Travel bookmarkを先に記録し。migration。Remote検査。staging smoke。productionの順で実施します。
