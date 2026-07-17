# Stage 8.2 local final verification

## 判定

sourceはlocal release candidateです。既知71件は修正対応表へ一件ずつ対応付けました。production deployは外部実値とstaging証跡がないためblockedです。

## 確認済み

- package version 0.8.2
- migration 0001〜0017 fresh apply
- foreign key check 0
- integrity check ok
- Stage 8.2 persistent trigger 42本
- 元監査71件の修正対応表 71/71
- functional regression 889件。失敗0
- final hardening regression 39件。失敗0
- Stage boundary 31件。失敗0
- precision boundary 121件。失敗0
- compatibility command 7群。失敗0
- deployment verifier unit test 12件。失敗0
- Owner bootstrap 40件。失敗0
- documentation validation 41件。失敗0
- dependency audit。全依存とproduction依存とも脆弱性0
- Wrangler deploy dry-run成功
- YAML parse成功
- git diff whitespace検査成功

`check:stage08`は全段階回帰を直列実行します。この検証環境の45分上限ではStage 6.5途中で打ち切られました。打ち切り以前のsuiteは全件成功しています。残りsuiteは同じsourceで個別実行し全件成功しました。CIとproduction workflowのtimeoutは120分へ変更しました。

## config verifierの現在値

`npm run verify:deployment`は次の9件だけを理由に意図どおり停止します。

1. DB_V2 real UUID
2. AUTH_LOGIN_IP_LIMITER
3. AUTH_LOGIN_ACCOUNT_LIMITER
4. PUBLIC_COMMENT_RATE_LIMITER
5. AUTH_PUBLIC_EMAIL_LIMITER
6. AUTH_EMAIL_FROM
7. AUTH_EMAIL_REPLY_TO
8. TURNSTILE_SITE_KEY
9. EMAIL allowed_sender_addresses

## 未確認

この環境からCloudflare accountへ接続していません。次は未確認です。

- production DB_V2のreal UUID
- remote existing data preflight
- remote migration
- remote trigger存在
- active Owner
- Email Service domainとplan
- secret設定
- staging acceptance
- production deployとsmoke
- PowerShell版safe deployの実行。実行環境にpwshとWindows PowerShellがないため構文と内容の静的確認まで

未確認項目を推測で完了扱いにしません。
