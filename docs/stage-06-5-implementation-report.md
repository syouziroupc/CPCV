# Stage 6.5 実装報告

## 基準

- Stage 6.5-A baseline commit: `c39c4650b9818dcdad5a6f589f47aad737c3c119`
- Stage 6.5-B commit: `d61ddac858ff481293e17934975d3ff2808c139a`
- 完成version: `0.6.5`

## DB

`0009_account_lifecycle.sql`を追加した。

- `email_enrollment_requests`
- `organization_email_events`
- `email_delivery_attempts.organization_id`
- active member quota trigger
- pending invitation quota trigger
- daily invitation email quota trigger

## API

追加または変更した主要endpoint:

- `GET /api/auth/account`
- `POST /api/auth/invitations/inspect`
- `POST /api/auth/invitations/accept`
- `POST /api/auth/email-change/request`
- `POST /api/auth/email-change/confirm`
- `GET /api/org/invitations`
- `POST /api/org/invitations`
- `POST /api/org/invitations/:id/resend`
- `DELETE /api/org/invitations/:id`
- `POST /api/org/members/:id/password-reset`

管理者password resetはraw tokenを返さない。確認済みメールへ送信する。

## UI

- account画面
- invitation承認画面
- email変更確認画面
- master画面のメール招待化
- adminからaccount画面への導線

## 運用

- production verifierへEmail Service。Turnstile。4番目のlimiterを追加
- remote D1 verifierへ0008。0009。quota triggerを追加
- email必須化前のOwner移行検査を追加
- GitHub CIをStage 6.5全試験へ更新
- production workflowへTurnstile secretとcutover検査を追加

## 完了判定

local実装。自動試験。画面検査。再展開検証を完了した時点でStage 6.5を完了とする。Remote deployは完了条件に含めない。
