# CPCV Stage 6.5-A 実装報告

作成日: 2026-07-14

## 基準

- 基準成果物: `CPCV_stage06_complete_source.zip`
- 基準SHA-256: `d58418bb1d5d3b908a6f550d7ec8778e1f3eb1880a09dc8f6badc8a3d4b5fa52`
- 基準バージョン: `0.6.0`
- 実装バージョン: `0.6.5-a.1`
- 本番deploy: 未実施
- Remote D1変更: 未実施

## 実装範囲

### メールアドレス

- `users.email`
- `users.email_verified_at`
- `users.email_updated_at`
- 正規化済みメールの部分UNIQUE INDEX
- 既存利用者を維持するためNULLを許容

### 自己登録

- メールアドレス
- 表示名
- 組織名
- パスワード
- Turnstile token
- 確認メール再送
- 確認token消費
- user、organization、Owner membership、quota、origin、audit、sessionの作成

確認完了まではuserとorganizationを作成しない。

### メールログイン

- 確認済みメールでログイン
- 大文字小文字を正規化
- 複数組織時は既存の組織選択契約を維持
- `EMAIL_AUTH_REQUIRED=1`で旧login IDを拒否
- 初期値は`0`

### パスワード再設定

- 公開requestは存在有無にかかわらず202
- 確認済みメールだけへ送信
- token hashだけをD1へ保存
- tokenは一回限り
- 同一メールの登録競合時はDB batch全体をrollback
- email snapshotを検査
- 成功後に全auth sessionを失効

### メール送信

- Cloudflare Email Service binding `EMAIL`
- textとHTMLの両方を作成
- 送信元は`AUTH_EMAIL_FROM`
- reply-toは`AUTH_EMAIL_REPLY_TO`
- 送信結果を`email_delivery_attempts`へ記録
- 本文とraw tokenをdelivery logへ保存しない

### Turnstile

- server側Siteverify
- signup
- signup resend
- password reset request
- 本番設定欠落時はfail-closed
- ローカル試験では明示的なtest bypassだけを使用
- CSPへ`https://challenges.cloudflare.com`のscriptとframeを追加

### Rate limit

- Cloudflare edge limiterを任意で使用
- D1 exact daily counterを必須化
- recipientは全メール用途合計で24時間5件
- IP hashは全メール用途合計で24時間20件
- raw IPを保存しない
- secret pepper付きhashを使用

### UI

追加画面:

- `/signup`
- `/forgot-password`
- `/verify-email/:token`
- `/reset-password/:token`

既存ログイン画面:

- メールアドレス入力を受付
- 互換期間はlogin IDも受付

## DB

追加migration:

```text
migrations-v2/0008_email_auth.sql
```

Stage 6の`0007_realtime.sql`は変更していない。

追加table:

- `pending_registrations`
- `organization_origins`
- `organization_quotas`
- `organization_invitations`
- `email_change_requests`
- `email_delivery_attempts`
- `auth_public_counters`

Stage 6.5-B用の招待とメール変更tableは先に追加した。APIと画面は未実装である。

## Stage 6.5-Aに含まれないもの

- 組織招待API
- 招待承認画面
- メール変更API
- アカウント画面
- 旧仮パスワード作成の停止
- 管理者向けraw reset token表示の停止
- `EMAIL_AUTH_REQUIRED=1`への本番切替
- 本番メール到達試験
- 本番deploy

これらはStage 6.5-BまたはStage 6.5-Cで扱う。
