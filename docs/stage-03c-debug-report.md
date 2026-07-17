# CPCV Stage 3-C デバッグ報告書

## 1. Stage 3-B残存問題

Stage 3-C開始前に次の到達不能・重複コードを除去した。

- `src/index.js`の重複return
- `src/routes/auth.js`の重複throw
- `scripts/test-auth-api-v2.mjs`の重複return

## 2. 跨DB不整合

### 2.1 旧DB作成失敗

問題:

DB_V2にactive sessionが残り、学生公開APIで見えない状態になる可能性があった。

修正:

- DB_V2 sessionを`deleted`へ補償更新
- postingとcommentsを停止
- ended_atとdeleted_atを設定
- projection failureを監査

### 2.2 補償audit失敗

問題:

補償UPDATEとauditを同じbatchにした場合、audit failureでUPDATEもrollbackされる。active orphanが残る可能性があった。

修正:

- 最初はUPDATEとauditを同じbatchで実行
- batch failure時は安全側UPDATEだけを再実行
- 安全側UPDATE成功後に不整合auditを再試行
- audit failureより授業停止を優先

fault injectionで確認した。

### 2.3 設定更新失敗

問題:

旧DB更新後にDB_V2更新が失敗すると設定が分離する。

修正:

- 更新前の旧DB snapshotを取得
- DB_V2 batch失敗時に旧DBを復元
- 復元失敗時は不整合監査を記録

### 2.4 終了・削除失敗

問題:

DB_V2の更新だけを先に行うと、旧学生APIが投稿可能な状態を残す可能性がある。

修正:

- 旧DBを先にendedまたはdeletedへ変更
- DB_V2失敗時も旧DBを再開しない
- 安全側停止を維持
- 不整合監査を記録

## 3. 認証移行

確認・修正した項目。

- BrowserのLocalStorageに認証tokenを残さない
- Bearer headerを送信しない
- WebSocket subprotocolにtokenを載せない
- WebSocket upgradeでOriginを完全一致検査
- requestの組織指定を拒否
- productionで旧認証へ戻せない

## 4. UIデバッグ

次の画面をdesktop 1440×1000とmobile 390×844で確認した。

- Admin login
- Master login
- Master authenticated panel
- Viewer login

確認結果。

- 横方向overflowなし
- 入力欄の切れなし
- buttonの重なりなし
- mobileでmember actionが折り返される
- one-time passwordが枠内で折り返される
- Viewer loginが画面内に収まる

証跡は`docs/stage03c-screenshots/`に保存した。

## 5. 依存脆弱性

full `npm audit`でWranglerの推移依存に5件を確認した。

- low 1
- high 4

Wranglerを4.110.0へ更新した。さらにnpmとpnpmで異なるversionが解決されないよう、pdfjs-dist、qrcode、Wranglerをexact versionへ固定し、両lockfileを同期した。更新後のfull auditは0件。

## 6. 残る制約

- 別D1間に単一transactionはない
- Durable Object操作はD1と同一transactionにできない
- そのためrollbackまたは安全側停止と監査で扱う
- remote bindingと実ネットワーク挙動はstagingで再確認が必要
