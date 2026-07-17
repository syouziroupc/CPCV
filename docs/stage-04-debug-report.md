# CPCV Stage 4 デバッグ報告

## 修正した問題

### 1. 旧公開投稿経路

旧handlerには`x-client-id`、IP抽出、旧Cookie処理が残っていた。Stage 4のprivacy契約と正本を曖昧にするため削除した。公開投稿は常に`handlePublicV2Api`を使用する。

### 2. 再送二重保存

事前検索だけでは競合を防げない。DBの`UNIQUE (live_session_id, idempotency_key)`とinsert後の再検索を併用した。duplicateは既存commentを返し再broadcastしない。

### 3. 投稿間隔の競合

JavaScriptで時刻を確認してからinsertする方式を避けた。participant rowの`post_claim_id`と`next_post_at`を条件付きUPDATEし、comment insertとevent insertを同一D1 batchへ含めた。

### 4. 部分保存

`comment_events` insertを意図的に失敗させた。participant、comment、eventが全てrollbackされることを確認した。

### 5. D1保存前broadcast

Durable Objectはrepositoryの保存結果を受け取ってからbroadcastする。D1失敗時はsocketへ送らない。

### 6. CSV formula injection

全cellをquoteし、先頭空白後の`=`, `+`, `-`, `@`もapostropheで無害化した。

### 7. Retention

期限切れcommentだけをbatch deleteする。関連eventはcascade deleteする。commentが残らないparticipantを同じmaintenance処理で削除する。

### 8. Stage 2試験のmigration境界

Stage 4 migration追加後もStage 2の154件が当時のschemaを検査できるよう、Stage 2試験は0001と0002だけを一時migration directoryへ複製して実行する。production migrationは変更していない。

### 9. 表示確認

StudentとViewerをdesktop、mobileで描画した。`scrollWidth`と`innerWidth`が全件一致した。説明文、入力欄、buttonの重なりはない。

## 未実施

- remote D1 migration
- scheduled trigger設定
- staging負荷試験
- production deploy

これらは最終deployment段階で実施する。
