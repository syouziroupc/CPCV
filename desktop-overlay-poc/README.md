# CPCV Desktop v0.2.1

既存CPCVを教師用Windowsアプリとして扱い、PowerPoint、PDF、動画、ブラウザの上へコメントを透明表示するデスクトップクライアントです。

## v0.2.2で修正する問題

第1段階で利用していた接続環境とv0.2.1の既定接続先が異なる場合、別環境に保存された進行中授業を取得できません。v0.2.2では、進行中授業が存在する接続先をアプリが自動確認し、利用者に環境選択を要求しない方式へ変更します。修正ソースは専用ブランチで検証してから固定保存します。現在、この修正を適用しています。

## v0.2.1の修正

- デスクトップのコメント表示ボタンをCPCV本体のコメント設定へ統合
- CPCV側のON/OFF状態を透明オーバーレイへ同期
- 管理画面を閉じた際に透明オーバーレイとプロセスを確実に終了
- RustfmtとClippyの警告を解消
- JavaScript初期化処理を保守可能な別ファイルへ分離
- `Cargo.lock`と`package-lock.json`を保存し、CIで固定依存関係を使用
- Release EXEでは黒いコンソール画面を表示しない
- Windowsコード署名用スクリプトとCI連携を追加
- Release EXEのSHA-256チェックサムを生成

## 操作

1. `cpcv-desktop.exe`を起動する
2. CPCVへログインする
3. 授業を作成または選択する
4. 画面右下の「投影開始」または既存の「オーバーレイを開始」を押す

接続先、授業ID、投影画面URLの手入力はありません。通常起動は本番環境へ接続します。

## コメント表示

デスクトップ右下の「コメント ON/OFF」はCPCV管理画面の「コメントを表示/隠す」と同じ設定を操作します。別々の状態は持ちません。CPCV側の設定変更が完了した後に、透明オーバーレイへ同じ状態が反映されます。

## ウィンドウ構成

ユーザーが操作するウィンドウはCPCV管理画面の1つだけです。投影中は別の透明オーバーレイがプロジェクター側へ表示されますが、タスクバーには表示されず、マウス入力は背面のPowerPointなどへ通ります。

管理画面を閉じると、透明オーバーレイも破棄してアプリ全体を終了します。

## 投影先

ディスプレイが複数ある場合は、メインではない画面を優先して自動選択します。「投影先」ボタンを押すと利用可能な画面を順番に切り替えます。

## 接続環境

通常利用では本番環境へ自動接続します。試験環境は開発確認専用です。

```powershell
cpcv-desktop.exe --staging
```

試験環境で起動した場合だけ管理画面右下に「試験環境」と表示します。

## セキュリティ

CPCVのリモート管理画面にはTauri API権限を与えません。管理画面へ注入する操作バーは、`desktop.cpcv.local`宛ての疑似ナビゲーションを発生させ、Rust側がその遷移を遮断して限定操作へ変換します。

許可する操作は投影開始、停止、コメント表示状態同期、QR表示切替、投影先切替だけです。任意ファイル操作やOSコマンド実行は公開しません。

## 開発

```powershell
cd desktop-overlay-poc
npm ci
npm run dev
```

試験環境:

```powershell
npm run dev:staging
```

検査:

```powershell
npm run check:ui
npm audit --audit-level=high
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run build:release
```

## Windowsコード署名

CIへ次のRepository Secretsを設定すると、Release EXEをAuthenticode署名してから成果物へ保存します。

- `CPCV_WINDOWS_CERTIFICATE_BASE64`: PFX証明書をBase64化した値
- `CPCV_WINDOWS_CERTIFICATE_PASSWORD`: PFXパスワード

証明書が未設定の場合もRelease EXEとSHA-256チェックサムは生成されますが、Windows SmartScreenの評価はコード署名証明書なしでは完全には解消できません。

## 保存

- v0.1.2保全: `archive/desktop-overlay-stage1-v0.1.2-20260803`
- v0.2保全: `archive/desktop-overlay-v0.2-20260803`
- v0.2.1修正: `agent/desktop-overlay-v0.2.1-fixes`
- v0.2開始前のCPCV全体: `archive/cpcv-master-pre-desktop-v0.2-20260803`

現行Worker、D1、認証API、学生画面は変更しません。
