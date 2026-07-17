# Stage 6 デバッグ報告

## 実装中に発見した問題と修正

1. D1 trigger付きINSERTで`meta.changes=0`になる場合があり、初回投稿をduplicateと誤判定した。
   - 生成comment IDの実在確認を正本へ変更した。
2. `message:clear`後にevent retentionが進むと古いvisible commentがsnapshotで復活し得た。
   - `last_clear_sequence`を保存し、snapshot queryへ適用した。
3. 削除済みからhiddenへ戻す安全側復元でもViewer eventを要求して500になった。
   - visibleを出入りする遷移だけRealtime event必須にした。
4. Cookie sessionを失効しても接続済みsocketが残り得た。
   - ticketへauth session IDを結び付け、event配信時に再認可する。
5. 発行済みticketがauth停止後も消費できた。
   - 消費UPDATEへauth、user、organization、membership、role、授業状態の条件を追加した。
6. 多数socketを一度のSQL INへ入れると変数上限へ依存した。
   - 80 auth sessions単位に分割した。
7. Local devで公開投稿pepperが不足した。
   - `npm run dev`へ非本番用pepperを追加した。
8. Mobileでcomment panel、toolbar、小型QRが重なった。
   - comment panelをtoolbar上へ移し、QRを上部へ配置した。
9. Visual fixtureが実CSSと異なる寸法を上書きしていた。
   - Chromiumで実HTML・実CSSを描画し、overflowと交差を自動検査する方式へ変更した。
10. WebSocket reconnectが固定間隔だった。
   - jitter付き指数backoff、上限30秒へ変更した。
11. 旧Bearer subprotocolがRealtime transportに残る危険があった。
   - Cookie認証から発行する一回限りticket bridgeへ置換した。
12. participant Cookie破棄で10秒制限を回避できた。
   - application DBへIPを保存せず、Cloudflare edge HMAC keyによる短時間limiterを追加した。
