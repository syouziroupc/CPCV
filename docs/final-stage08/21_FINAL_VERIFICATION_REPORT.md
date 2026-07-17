# Stage 8.2 final local verification

## 判定

sourceはCloudflare反映前の完成release candidateです。監査71件は全件修正済みです。配備手順。Codex指示。staging証跡検査。production証跡保存も整合しています。

Cloudflare remoteは変更していません。外部実値とstaging受入実績がない状態でproductionへ進むことはできません。これは未修正ではなく意図したfail-closedです。

## 確認済み

- package version `0.8.2`
- migration `0001`〜`0017` fresh apply
- foreign key check 0件
- integrity check `ok`
- Stage 8.2 persistent trigger 42本
- 元監査71件の修正対応表 71/71
- 機能回帰 889件。失敗0
- Owner bootstrap 40件。失敗0
- Stage 8 boundary 31件。失敗0
- precision boundary 121件。失敗0
- compatibility command 7群。失敗0
- deployment verifier 22件。失敗0
- documentation validation 53件。失敗0
- JavaScript module static check 131件
- GitHub workflow YAML parse成功
- git diff whitespace検査成功
- Wrangler deploy dry-run成功
- `npm audit`脆弱性0件
- `npm audit --omit=dev`脆弱性0件

`npm run check:stage08`は全suiteを直列実行します。検証環境の実行上限によりStage 6.5 account lifecycle途中で打ち切られました。打ち切り前のsuiteは全件成功しました。残りsuiteは同じsourceで個別実行し全件成功しました。CIとproduction workflowの上限は120分です。

## 配備ゲートの最終強化

- staging configをsource外に保持する
- staging configのSHA-256を検査する
- staging acceptance recordのSHA-256を検査する
- staging acceptance recordの必須内容を検査する
- productionとstagingのWorker。D1。Queue。Rate Limiting namespaceを分離検査する
- staging用Queue名をAI readinessが正しく検査する
- remote検査へ`--database`と`--config`を明示できる
- production workflowがstaging証跡を実ファイルとして復号し検査する
- PowerShell safe deployが証跡実ファイルを検査する
- deployment outputを保存する
- deployment recordsのSHA-256一覧を生成する
- PowerShell helper関数を初回呼出し前に定義する

## production configの現在値

`npm run verify:deployment`は次の9件だけを理由に停止します。

1. DB_V2 real UUID
2. AUTH_LOGIN_IP_LIMITER
3. AUTH_LOGIN_ACCOUNT_LIMITER
4. PUBLIC_COMMENT_RATE_LIMITER
5. AUTH_PUBLIC_EMAIL_LIMITER
6. AUTH_EMAIL_FROM
7. AUTH_EMAIL_REPLY_TO
8. TURNSTILE_SITE_KEY
9. EMAIL allowed_sender_addresses

## 外部環境でのみ確認できる項目

- Cloudflare accountの実UUIDとnamespace ID
- remote existing data preflight
- remote migration
- remote trigger存在
- active Owner
- Email Service domainとplan
- secret設定
- staging deployと受入試験
- production deployとsmoke
- Time Travel bookmark
- PowerShell実環境でのsafe-deploy実行

外部値は推測していません。実値が揃うまで配備検査は失敗します。
