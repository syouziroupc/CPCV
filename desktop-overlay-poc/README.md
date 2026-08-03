# CPCV Desktop Overlay PoC

既存CPCVの投影画面を透明な最前面ウィンドウとして表示する第1段階の試作です。

## 確認対象

- PowerPointやPDFビューアより上にコメントが表示される
- 背景が透明になる
- マウスとホイールが下のアプリへ届く
- キーボードフォーカスを奪わない
- 指定したディスプレイへ配置できる
- 既存CPCVの認証、授業、コメント、Realtimeを流用できる

Worker、D1、学生画面は変更しません。リモートのCPCVページにはTauri API権限を与えていません。

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
3. 授業を作成する
4. URL末尾の`sess_...`を入力する
5. 投影先ディスプレイを選ぶ
6. PowerPointのスライドショーを開始する
7. オーバーレイを開始する

## 問題がある場合

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
