# Stage 6.5 画面確認

## Viewport

- Desktop: 1440 × 1000
- Mobile: 390 × 844

## 対象

- account
- invitation新規user
- invitation既存user
- email変更確認
- master組織管理

各画面をdesktopとmobileで確認した。合計10画面。

## 自動判定

- page-level横overflowなし
- card。info box。member itemがviewport外へ出ない
- visible input。select。buttonが39px未満にならない
- hidden sectionを誤判定しない

## 手動確認

- 文字切れなし
- 招待先。role。期限が判別可能
- raw token表示なし
- master mobileは一列へ折り返す
- accountの複数組織表示は改行を保持

証跡は`docs/stage06-5-screenshots/`に保存した。
