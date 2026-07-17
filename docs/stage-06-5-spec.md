# CPCV Stage 6.5 正式仕様

## 目的

Stage 6の認証。組織境界。コメント。moderation。Realtime契約を維持したまま、メール中心のアカウント運用を完成させる。

## 対象

- 自己登録とメール確認
- メールログイン
- メールpassword reset
- 組織招待と承認
- メール登録と変更
- 組織quota
- 旧仮password運用の停止
- raw reset token露出の停止
- Turnstile
- Email Service
- cleanup
- deployment cutover検査

## 維持する契約

- HttpOnly Cookie
- Origin完全一致
- CSRF
- sessionは一組織へ固定
- roleはmembershipに保存
- 最後のOwner保護
- Studentは匿名参加者
- コメントschemaとmoderation stateを変更しない
- Stage 6 sequenceをRealtime順序の正本とする
- PDFをserverへ保存しない

## Token

| 用途 | 期限 |
|---|---:|
| 登録確認 | 24時間 |
| password reset | 30分 |
| 組織招待 | 7日 |
| メール変更・登録 | 30分 |

全tokenは暗号学的乱数で生成する。D1にはSHA-256 hashだけを保存する。使用済み。期限切れ。失効済みtokenを拒否する。

## メール

- sender。reply-to。subject。templateはserver設定で固定
- 利用者値はescapeする
- textとHTMLを送る
- raw tokenはmail送信時のmemoryとlinkだけに存在
- 送信失敗はdelivery attemptへ記録
- 再送時は旧tokenを失効して新tokenを発行

## Account enumeration

登録要求。再送。reset要求は対象accountの有無にかかわらず202を返す。入力形式不正。Turnstile不正。rate limitは区別してよい。

## Cutover

`EMAIL_AUTH_REQUIRED=0`で既存Ownerへメールを登録する。全active Ownerが確認済みになった後だけ`1`へ変更する。切替前に`npm run verify:email-auth-ready`を通す。
