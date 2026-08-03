# CPCV Desktop v0.2

既存CPCVを教師用Windowsアプリとして扱い、PowerPoint、PDF、動画、ブラウザの上へコメントを透明表示するデスクトップクライアントです。

## v0.2の操作

1. `cpcv-desktop.exe`を起動する
2. CPCVへログインする
3. 授業を作成または選択する
4. 画面右下の「投影開始」または既存の「オーバーレイを開始」を押す

接続先、授業ID、投影画面URLの手入力はありません。通常起動は本番環境へ接続します。

## ウィンドウ構成

ユーザーが操作するウィンドウはCPCV管理画面の1つだけです。投影中は別の透明オーバーレイがプロジェクター側へ表示されますが、タスクバーには表示されず、マウス入力は背面のPowerPointなどへ通ります。

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

許可する操作は投影開始、停止、コメント表示切替、QR表示切替、投影先切替だけです。任意ファイル操作やOSコマンド実行は公開しません。

## 開発

```powershell
cd desktop-overlay-poc
npm install
npm run dev
```

試験環境:

```powershell
npm run dev:staging
```

検査:

```powershell
npm run check:ui
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run build:debug
```

## 保存

- v0.1.2保全: `archive/desktop-overlay-stage1-v0.1.2-20260803`
- v0.2開発: `agent/desktop-overlay-v0.2`
- v0.2開始前のCPCV全体: `archive/cpcv-master-pre-desktop-v0.2-20260803`

現行Worker、D1、認証API、学生画面のソースはv0.2では変更しません。
