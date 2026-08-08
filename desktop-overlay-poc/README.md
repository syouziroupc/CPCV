# CPCV Desktop Overlay PoC

既存CPCVの投影画面を透明な最前面ウィンドウとして表示する第1段階の試作です。

## 保存場所

- 開発ブランチ: `agent/desktop-overlay-poc`
- 第1段階の保全ブランチ: `archive/desktop-overlay-stage1-20260803`
- ドラフトPR: `#8`

GitHub ActionsのEXE成果物には保存期限があります。Rust、HTML、JavaScript、設定、ビルド手順、CI定義はGitHubブランチに保存しています。

## 確認対象

- PowerPointやPDFビューアより上にコメントが表示される
- 背景が透明になる
- マウスとホイールが下のアプリへ届く
- キーボードフォーカスを奪わない
- 指定したディスプレイへ配置できる
- 既存CPCVの認証、授業、コメント、Realtimeを流用できる

Worker、D1、学生画面は変更しません。リモートのCPCVページにはTauri API権限を与えていません。

## 接続設計

管理画面とオーバーレイは同一のWebView2データディレクトリを明示的に使用します。ログインCookie、LocalStorage、IndexedDBを同じプロファイルで共有します。

操作画面には管理画面と投影画面の読み込み開始、完了、想定外URL、15秒タイムアウトを表示します。接続が失敗した場合は、表示されたURLを通常ブラウザでも確認してください。

## 起動

必要環境はWindows 10または11、WebView2、Node.js 22、Rust stable MSVC、Visual Studio Build Toolsです。

```powershell
cd desktop-overlay-poc
npm install
npm run dev
```

## 操作

1. stagingまたはproductionを選ぶ
2. 管理画面を開いてログインする
3. 状態欄に読み込み完了が出ることを確認する
4. 授業を作成する
5. URL末尾の`sess_...`を入力する
6. 投影先ディスプレイを選ぶ
7. PowerPointのスライドショーを開始する
8. オーバーレイを開始する

## 問題がある場合

- 接続タイムアウト: 同じURLがEdgeで開くか確認し、WebView2、DNS、プロキシ、学内ネットワークを確認する
- 未認証表示: 同じ接続先の管理画面でログインする
- 背景が黒い: WebView2を更新して再起動する
- PowerPointの後ろへ隠れる: 最前面と画面位置を再適用する
- PowerPointを操作できない: カーソル透過を有効にする
- QRが空: 読み込み後にQR表示を入れ直す

## 検証

```powershell
npm run check:ui
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run build:poc
```

第1段階ではHTTPSポーリング、自動更新、インストーラー、ショートカット、HDMI自動復旧は実装しません。

## v0.1.2 Windowsフリーズ修正

`WebviewWindowBuilder`を同期Tauriコマンドから呼ぶとWindowsでデッドロックする既知問題に対応し、管理画面とオーバーレイの生成コマンドを非同期化しました。
