# Stage 6 実装報告

## 実装概要

WebSocket transportをD1 sequence正本とする再接続可能なRealtime構成へ変更した。

- `0007_realtime.sql`
- one-time connection ticket
- sequence付きevent
- catch-upとsnapshot
- clear watermark
- Hibernation Durable Object
- socket attachment
- event配信時の認証再検証
- bounded exponential reconnect
- 公開投稿edge rate limit
- scheduled realtime retention
- Stage 6 E2E smoke

## 変更境界

変更した主領域:

- `src/realtime/**`
- `src/routes/private-v2.js`
- `src/routes/public-v2.js`
- `src/index.js`
- `public/assets/viewer.js`
- Viewer用CSS・cache version
- deployment verifierとworkflow
- Stage 6 test・docs

変更していない契約:

- Stage 3 role matrix。
- Stage 4 comment IDとidempotency。
- Stage 5 moderation state machine。
- PDFをserverへ送信しない方針。
- 生IPを永続保存しない方針。

## 外部反映

GitHub push、Remote D1、Cloudflare deployは未実施。
