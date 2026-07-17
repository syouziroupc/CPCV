# CPCV Stage 6.5-A 画面検証

検証日: 2026-07-14

## 対象

- signup
- forgot password
- verify email
- reset password

## Viewport

- Desktop: 1440 × 1000
- Mobile: 390 × 844

## 結果

- 8画面をPNGで保存
- 横方向overflowなし
- cardの左右切れなし
- inputとbuttonの重なりなし
- mobileでbutton幅を確保
- token文字列の画面表示なし
- signup mobileは縦方向に9px長い。通常の縦scrollで閲覧できる

## 保存先

```text
docs/stage06-5a-screenshots/
```

各PNGと寸法JSONを収録する。
