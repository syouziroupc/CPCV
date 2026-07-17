# Stage 3-C 画面確認

## 確認条件

- Desktop: 1440×1000
- Mobile: 390×844
- CSSを含む完成HTMLをChromiumで描画
- Master認証後画面には代表的なメンバー、授業、監査ログを投入

## 結果

- 横overflowなし
- 見出しと操作buttonの重なりなし
- mobileのmember操作は複数行へ安全に折り返す
- reset token・仮password表示は枠内で折り返す
- login入力欄はmobile幅に収まる
- Viewer loginは縦横とも画面内に収まる

## 証跡

`docs/stage03c-screenshots/`を参照する。

- `admin_desktop.png`
- `admin_mobile.png`
- `master_desktop.png`
- `master_mobile.png`
- `master_panel_desktop.png`
- `master_panel_mobile.png`
- `viewer_desktop.png`
- `viewer_mobile.png`
