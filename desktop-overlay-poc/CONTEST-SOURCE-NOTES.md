# U-22提出向けソース記録

CPCVの提出候補は、Web版 `0.8.10` と Windows Desktop版 `0.2.2` を同一リポジトリで固定する構成です。

- 最終統合ブランチ: `release/cpcv-u22-final-20260810`
- Web版ソース: リポジトリroot、`src/`、`public/`、`migrations-v2/`、`scripts/` 等
- Desktop版ソース: `desktop-overlay-poc/`
- Desktop設計記録: `docs/desktop-overlay-stage2-plan.md`
- Desktopは現行CPCVの管理画面、認証、授業、コメント、Realtime等を利用し、Windows上の透明オーバーレイを追加する構成
- DesktopのWeb互換性は `desktop-overlay-poc/scripts/check-current-web-contract.mjs` で検査
- Windows実行ファイルはGitHub Actionsの `CPCV Desktop` workflowから再生成可能

## 再生成

```powershell
cd desktop-overlay-poc
npm ci
npm run build:release
```

生成対象は `desktop-overlay-poc/src-tauri/target/release/cpcv-desktop.exe` です。CIでは実行ファイルのSHA-256も同時に生成します。

## U-22提出時に固定するもの

1. 凍結済みソースコード一式
2. Windows Release実行ファイルとSHA-256
3. Web版の本番URLを記載したテキスト
4. 実行・検証手順
5. 応募資料と作品説明動画が参照する版番号

提出後は、審査期間中の作品改変を避けるため、凍結版に対する変更は重大な障害またはセキュリティ修正に限定します。
