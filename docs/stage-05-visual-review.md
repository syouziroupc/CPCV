# Stage 5 画面確認

## 対象

- Admin moderation Desktop 1440px
- Admin moderation Mobile 390px

実配信HTML `public/_admin_spa.html`と実CSS `public/assets/app.css`を使用した。代表commentを実DOM構造へ差し込んだ。

## 結果

- state badgeを識別可能
- pending。visible。hidden。deletedの操作を確認可能
- bulk操作が明確
- mobileでpage全体の横overflowを発生させない
- moderation tableの横方向はtable wrapper内部へ限定
- comment本文がcell内で折り返される
- 危険操作は赤系表示

Chromiumは実行環境の組織ポリシーによりlocalhost。file。data URLを遮断した。このため機能E2Eは実WorkerへHTTP接続して確認した。画面は実HTMLと実CSSをWeasyPrintで描画した。Stage 4の実Chromium画像とも基礎layoutを比較した。
