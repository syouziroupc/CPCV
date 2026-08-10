# U-22提出向けソース記録

CPCVの提出候補は、Web版 `0.8.10` と Windows Desktop版 `0.2.2` を同一リポジトリで固定する構成です。

- 最終統合ブランチ: `release/cpcv-u22-final-20260810`
- Web版ソース: リポジトリroot、`src/`、`public/`、`migrations-v2/`、`scripts/` 等
- Desktop版ソース: `desktop-overlay-poc/`
- Desktop設計記録: `docs/desktop-overlay-stage2-plan.md`
- 凍結判定: `docs/U22_FREEZE_READINESS.md`
- Codex最終acceptance: `docs/U22_CODEX_FINAL_ACCEPTANCE.md`、model `5.4 mini`
- Desktopは現行CPCVの管理画面、認証、授業、コメント、Realtime等を利用し、Windows上の透明オーバーレイを追加する構成
- DesktopのWeb互換性は `desktop-overlay-poc/scripts/check-current-web-contract.mjs` で**同一checkout内のWeb source**に対して検査する
- Windows実行ファイルはGitHub Actionsの `CPCV Desktop` workflowから再生成可能

## 凍結したbuild条件

- Windows Server 2025世代
- Node.js 22
- npm `10.9.8`
- Rust `1.97.1`
- Tauri CLI `2.11.4`
- npm dependencies: `package-lock.json`
- Rust dependencies: `src-tauri/Cargo.lock`

Rust compilerは `rust-toolchain.toml` でも固定します。CI artifactには `CPCV_BUILD_ENVIRONMENT.txt` を同梱し、実際に使ったOS、Node、npm、rustc、source Git SHA、EXE SHA-256を記録します。

## 再生成

Windows環境で実行します。

```powershell
cd desktop-overlay-poc
npm install --global npm@10.9.8
npm ci
npm run check:ui
npm run check:compat
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run build:release
Get-FileHash src-tauri/target/release/cpcv-desktop.exe -Algorithm SHA256
```

生成対象は `desktop-overlay-poc/src-tauri/target/release/cpcv-desktop.exe` です。CIでは実行ファイルのSHA-256とbuild environment recordを同時に生成します。

## U-22提出時に固定するもの

1. exact freeze commit SHA
2. 凍結済みsource ZIPとSHA-256
3. Windows Release EXEとSHA-256
4. Web版production URL
5. production Worker deployment/version ID
6. 実行・login・demo手順
7. sample PDFとSHA-256
8. 応募資料と作品説明動画が参照するWeb/Desktop版番号

binary artifact hashはsourceへ自己参照的に埋め込みません。最終CI artifact、PR/release record、提出一覧でexact freeze commitと対応付けます。

提出後は、審査期間中の作品改変を避けるため、凍結版に対する変更は重大な障害またはsecurity修正に限定します。修正が必要な場合は元のfrozen revisionを保持したまま新revisionとして全gateを再実行します。
