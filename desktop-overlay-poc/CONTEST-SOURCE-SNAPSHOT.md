# CPCV Desktop v0.2 Source Snapshot

アプリコンテスト提出、再現ビルド、将来の保守に備えた保全用スナップショットです。

- Archive branch: `archive/desktop-overlay-v0.2-20260803`
- Verified source commit: `6a9f74ea04b1e1d6cead3ae6643d143040a213f5`
- Development branch: `agent/desktop-overlay-v0.2`
- Draft PR: `#9`
- Application version: `0.2.0`
- Windows artifact digest: `sha256:9ecb4d07fcdf028795434bed2f56619c0d47e720b5b6846e15274399811770b6`

## 関連バックアップ

- v0.2開始前のCPCV全体: `archive/cpcv-master-pre-desktop-v0.2-20260803`
- 第1段階v0.1.2: `archive/desktop-overlay-stage1-v0.1.2-20260803`

## 保存内容

Rust/Tauriソース、HTML、CSS、JavaScript、設定、README、Windows用GitHub Actions、ソースSHA-256マニフェスト、第2段階設計書を保存しています。

検証済みコミットでは、CPCV本体の全Stage回帰、Owner bootstrap回帰、Wrangler bundle、依存関係監査、Rust unit test、`cargo check`、Windows debug EXE生成が成功しています。

この保全ブランチは通常開発では変更しません。
