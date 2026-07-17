# Stage 6 画面確認

## 条件

- Chromium headless
- 実`public/_viewer_spa.html`
- 実`public/assets/app.css`
- Desktop 1440 x 1000
- Mobile 390 x 844

## 自動確認

- document widthがviewport以下。
- body widthがviewport以下。
- Mobileのcomment panelがtoolbarへ重ならない。
- Mobileの小型QRがcomment panelへ重ならない。
- toolbarだけは内部横scrollを許容。

## 結果

Desktop、Mobileともpage-level横overflowなし。文字切れ、comment card重なり、小型QR重なりなし。

証跡:

- `stage06-screenshots/viewer-realtime-desktop.png`
- `stage06-screenshots/viewer-realtime-mobile.png`
- 同名JSONにviewportと要素矩形を保存。
