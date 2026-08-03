# CPCV Desktop Overlay Stage 1 v0.1.1

アプリコンテスト提出や再現ビルドに備えた保全用スナップショットです。

- Archive branch: `archive/desktop-overlay-stage1-v0.1.1-20260803`
- Verified source commit: `2d12e492f12c3705901aac6c61f14cd48bc8219c`
- Development branch: `agent/desktop-overlay-poc`
- Draft PR: `#8`
- Application version: `0.1.1`

このブランチにはRust/Tauriソース、HTML、CSS、JavaScript、設定、README、GitHub Actions、SHA-256ソースマニフェストを保存しています。

v0.1.1では管理画面とオーバーレイを同一のWebView2データディレクトリへ固定し、認証Cookie、LocalStorage、IndexedDBを共有します。リモートページの読み込み開始・完了・接続失敗と15秒タイムアウトも操作画面へ表示します。

保全用ブランチのため通常開発では変更しません。
