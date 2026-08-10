# CPCV Desktop v0.2.2 — CPCV 0.8.10対応版

CPCVを教師用Windowsアプリとして扱い、PowerPoint、PDF、動画、ブラウザの上へコメントだけを透明表示するデスクトップクライアントです。

## CPCV 0.8.10対応

2026-08-10時点のCPCV Web版 0.8.10へ追従しています。

- 現行の`/admin`と`/admin/{sessionId}`をそのまま管理ウィンドウとして使用
- 現行の`/viewer/{sessionId}`を透明オーバーレイとして使用
- 現行の`/api/auth/session`と`/api/private/sessions`で認証状態と進行中授業を確認
- Web版と同じ15秒APIタイムアウトを使用
- 認証確認はWeb版と同じく一時失敗時に1回再試行
- HTTPエラー、`ok: false`、JSON不正、タイムアウト、未ログインを区別
- 現行のコメント表示状態をCPCV本体から取得し、Desktop側に独立した状態を持たない
- `stack3`、`stack5`、`stack7`、`scroll`の現行投影表示を透明オーバーレイへ維持
- 現行のQRオーバーレイをPowerPoint等の上へ表示可能
- 現行の狭幅管理UIでDesktop操作バーが授業設定の保存領域を覆わないよう下部余白を確保
- 現行の管理画面・投影画面・APIルートをCIで契約検査し、互換性が崩れた場合はWindowsビルドを失敗させる

互換性検査は`master`の最新CPCVを別checkoutし、Desktop側が依存するDOM ID、APIパス、Workerルート、production originを検証します。

## v0.2.2で維持する機能

- 起動時にproductionとstagingの認証状態・進行中授業一覧を自動確認
- 現在の接続先に授業がなければ、もう一方を自動確認
- 進行中授業が見つかった接続先へ自動切替
- 選択された接続先を端末へ保存し、次回起動時に優先
- 未ログイン、空一覧、一覧API取得失敗を区別して表示
- 利用者にproduction／stagingの選択を要求しない
- 非メインディスプレイを優先して自動投影
- 最前面、枠なし、マウス透過の透明オーバーレイ
- 管理画面終了時にオーバーレイも破棄してアプリ全体を終了

## 操作

1. `cpcv-desktop.exe`を起動する
2. CPCVへログインする
3. 進行中の授業を選択するか、新しい授業を作成する
4. 画面右下の「投影開始」または既存の「オーバーレイを開始」を押す

接続先、授業ID、投影画面URLの手入力はありません。

## コメント表示

Desktop右下の「コメント ON/OFF」は、CPCV管理画面の「コメントを表示／隠す」と同じ設定を操作します。別々の状態は持ちません。CPCV側の設定変更後、透明オーバーレイへ同じ状態が反映されます。

## ウィンドウ構成

ユーザーが操作するウィンドウはCPCV管理画面の1つだけです。投影中は別の透明オーバーレイがプロジェクター側へ表示されますが、タスクバーには表示されず、マウス入力は背面のPowerPointなどへ通ります。

管理画面を閉じると、透明オーバーレイも破棄してアプリ全体を終了します。

## 投影先

ディスプレイが複数ある場合は、メインではない画面を優先して自動選択します。「投影先」ボタンを押すと利用可能な画面を順番に切り替えます。

## 開発用の接続固定

通常利用では接続先を自動選択します。開発者が明示的に固定する場合のみ次を使用します。

```powershell
cpcv-desktop.exe --production
cpcv-desktop.exe --staging
```

`--staging`で固定した場合だけ、管理画面右下に「試験環境」と表示します。

## セキュリティ

CPCVのリモート管理画面にはTauri API権限を与えません。管理画面へ注入する操作バーは、`desktop.cpcv.local`宛ての疑似ナビゲーションを発生させ、Rust側がその遷移を遮断して限定操作へ変換します。

許可する操作は投影開始、停止、コメント表示状態同期、QR表示切替、投影先切替、既知のCPCV接続先間の自動確認だけです。任意ファイル操作やOSコマンド実行は公開しません。

## 開発

```powershell
cd desktop-overlay-poc
npm ci
npm run dev
```

通常検査:

```powershell
npm run check:ui
npm audit --audit-level=high
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run build:release
```

CPCV 0.8.10との互換性検査は、リポジトリrootの隣に最新`master`を`current-master`としてcheckoutした状態で実行します。

```powershell
npm run check:compat
```

GitHub Actionsではこのcheckoutと互換性検査を自動実行します。

## Windowsコード署名

CIへ次のRepository Secretsを設定すると、Release EXEをAuthenticode署名してから成果物へ保存します。

- `CPCV_WINDOWS_CERTIFICATE_BASE64`: PFX証明書をBase64化した値
- `CPCV_WINDOWS_CERTIFICATE_PASSWORD`: PFXパスワード

証明書が未設定の場合もRelease EXEとSHA-256チェックサムは生成されますが、Windows SmartScreenの評価はコード署名証明書なしでは完全には解消できません。

## 保存

- v0.1.2保全: `archive/desktop-overlay-stage1-v0.1.2-20260803`
- v0.2保全: `archive/desktop-overlay-v0.2-20260803`
- v0.2.1保全: `archive/desktop-overlay-v0.2.1-20260803`
- v0.2.2保全: `archive/desktop-overlay-v0.2.2-20260803`
- CPCV 0.8.10対応作業: `agent/desktop-v0.3-v0810`
- v0.2開始前のCPCV全体: `archive/cpcv-master-pre-desktop-v0.2-20260803`

Worker、D1データ、学生投稿画面、本番デプロイ設定はこのDesktop対応作業では変更しません。
