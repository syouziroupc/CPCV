# Stage 6.5 デバッグ報告

## 発見と修正

### 招待再送の競合

同一招待を同時再送した場合にtoken。再送回数。日次quotaがずれる可能性があった。

旧token hashを条件にした更新へ変更した。email eventとauditも同じ条件に固定した。

### 登録確認の競合

同一emailを別処理が先に登録した場合に確認tokenだけが消費される可能性があった。

user。organization。membership。session。token消費を同一batchへ固定した。競合時は全体をrollbackする。

### 旧password reset試験

Stage 3-B試験が管理者へのraw token返却を前提としていた。

権限。token失効。rollback試験は維持した。期待値だけをメール送信方式へ更新した。

### Deployment verifier

Email Service変数を調べる正規表現のescapeが不足していた。

`RegExp` constructor内の空白classを二重escapeへ修正した。4個目のlimiterを含むvalid fixtureを追加した。

### 画面検査

master画面のselectが37pxだった。

`.select`へ`min-height: 40px`を追加した。その後にdesktopとmobileの10画面を再検査した。

### ローカル依存関係

最初の全体検査は作業フォルダに`node_modules`がなく停止した。

`npm ci`でlockfileどおり再構築した。ソース不良ではない。
