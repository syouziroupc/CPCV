# Stage 6 正式仕様: Realtime安定化

## 1. 目的

D1をRealtime eventの正本とし、WebSocket切断・重複・順序逆転・Durable Object休止から復元できる投影経路を実装する。

## 2. 前提

- 認証正本はStage 3のHttpOnly Cookie session。
- コメント正本はStage 4の`comments`。
- 表示可否はStage 5のmoderation state。
- pending・hidden・deletedはViewerへ表示しない。
- AI・翻訳・PDF分析はStage 6の対象外。

## 3. Realtime接続

1. ViewerがCookie認証とCSRFで`POST /api/private/sessions/:id/live-ticket`を呼ぶ。
2. serverは60秒有効の暗号学的random ticketを発行する。
3. DBへ保存するのはSHA-256 hashだけ。
4. ticketは一回だけ消費できる。
5. 消費時にもauth session、利用者、組織、membership、role、授業状態を再検証する。
6. WebSocket接続後もevent配信ごとにauth sessionとmembershipを再検証する。
7. 失効済み接続はclose code 4001で閉じる。

Raw ticketはWebSocket URL queryへ短時間だけ含まれる。HTTPSを必須とし、60秒・一回限りとする。application logへURLやticketを出力しない。

## 4. Sequenceとevent

- Sequenceは授業単位で1から単調増加する。
- D1の`realtime_events`が順序の正本。
- event typeは`message:new`、`message:remove`、`message:restore`、`message:clear`、`settings:update`、`room:closed`。
- event保存後にだけDurable Objectへ配信を依頼する。
- 即時配信失敗時もDB stateは戻さない。再接続catch-upで復元する。
- event保存期間は24時間。授業の最大有効時間6時間より長くする。

## 5. Catch-upとsnapshot

- Clientは最後に適用したsequenceだけをLocalStorageへ保存する。
- ticket、session token、CSRF tokenはLocalStorageへ保存しない。
- 差分が500件以内で保持中ならsequence順にcatch-upする。
- 差分が500件超、eventが削除済み、client sequenceが未来値ならsnapshotへ切り替える。
- snapshot上限は現在表示可能な500件。
- `message:clear`以前のcommentはsnapshotで復活させない。
- 同じsequence以下のeventは破棄する。
- sequence gapを検出した場合はsocketを閉じて再同期する。

## 6. Durable Object

- Cloudflare WebSocket Hibernation APIを使用する。
- socket情報はWebSocket attachmentへ保存する。
- memory上のsocket集合や順序を正本にしない。
- client frameは256 bytes上限。超過時は1009で閉じる。
- ACKは最後に送信済みsequence以下だけ受理する。
- 多数socketのauth再検証は80 auth sessions単位へ分割する。

## 7. 再接続

- 指数backoffとjitterを使う。
- 上限30秒。
- room終了、auth失効、明示logoutでは再接続を停止する。
- 一時切断では新しいticketを取得して再接続する。

## 8. 公開投稿のedge防御

- participant tokenによる10秒制限を維持する。
- Cloudflare Rate Limitingで公開コードと一時的client IPからHMAC keyを作る。
- 生IP、User-Agent、端末指紋はD1へ保存しない。
- productionではbindingと32文字以上のpepperを必須にする。
- 目標値は30 requests / 60 seconds。

## 9. DB

Migrationは`migrations-v2/0007_realtime.sql`。

追加table:

- `realtime_session_state`
- `realtime_events`
- `realtime_connection_tickets`

旧migrationは変更しない。

## 10. UI

- Viewerの既存PDF操作を維持する。
- 接続ticketはbrowser memoryにも保持し続けない。
- Mobileではcomment panelとtoolbarを重ねない。
- 小型QRはMobile上部へ配置する。
- toolbar内の横scrollは許容する。page全体の横overflowは禁止する。

## 11. 完了条件

- 一回限りticket。
- ticket消費時と配信時の認証再検証。
- gapless sequence。
- duplicate排除。
- catch-upとsnapshot。
- clear watermark。
- Hibernation attachment。
- bounded reconnect。
- edge rate limit。
- Stage 1〜5 regression 0 failure。
- 実Worker smoke成功。
- ZIP再展開後の再試験成功。
