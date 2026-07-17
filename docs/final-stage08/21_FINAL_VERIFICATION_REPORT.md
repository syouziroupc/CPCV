# Stage 8.2 final local verification

## 判定

sourceはCloudflare反映前のrelease candidateです。監査71件は全件修正済みです。Cloudflare remoteは変更していません。外部実値とstaging受入実績がない状態ではproductionへ進めません。

## 今回の再監査で修正した配備欠陥

- source外Wrangler configの相対path解決失敗
- Codex指示の誤った`source/docs`参照
- Git bundleをcloneせずsnapshotで作業する曖昧さ
- production非secret設定後に新release commitを作らない手順
- source manifestの生成・検査command欠落
- GitHub Actions利用時のexact commit push前提欠落
- production承認前にD1 bookmark。migration一覧。rollback versionを取得しない順序
- workflowのpre-deploy Worker状態証跡欠落
- staging受入件数を正数だけで許可する弱い検査
- staging受入試験書SHA-256との拘束欠落
- CIのsource manifest。documentation。production dependency audit欠落
- rollback exact commandとbinding非rollback注意の欠落

## 再検証結果

- source manifest: 927件一致
- JavaScript module static check: 134件
- documentation validation: 94件成功
- deployment verifier: 26件成功
- Stage 8 boundary: 31件成功
- precision boundary: 121件成功
- compatibility command: 7群成功
- functional regression: 889件成功
- Owner bootstrap: 40件成功
- Wrangler production dry-run: 成功
- materialized staging config dry-run: 成功
- GitHub workflow YAML parse: 成功
- `git diff --check`: 成功
- secret pattern scan: 0件
- `npm audit`: 脆弱性0件
- `npm audit --omit=dev`: 脆弱性0件

`npm run check:stage08`はboundary。compatibility。deployment verifier。functional suiteを直列実行します。全体commandは検証環境の60分上限に達しました。打切り前の全commandは成功しています。functional suiteは同一sourceで独立実行し889件すべて成功しました。

PowerShell runtimeは検証環境にありません。`safe-deploy.ps1`は文書検査でfunction順序。materialization。source manifest。承認前read-only処理。承認後mutation。証跡manifest。runtime cleanupを静的検査しました。実Cloudflare環境での実行は外部検証項目です。

## 配備ゲート

- canonical staging configはsource外に保持
- source rootの`.cpcv-staging.wrangler.toml`へbyte-for-byte materialize
- canonicalとruntimeのSHA-256一致を強制
- runtime configでWrangler dry-runを実行
- staging acceptanceは44件固定
- acceptance spec SHA-256を受入記録へ強制
- productionとstagingのWorker。D1。Queue。Rate Limiting namespaceを分離検査
- safe deployはread-only rollback情報を明示承認前に保存
- GitHub workflowはpre-deployとpost-deployのWorker状態を保存
- deployment outputとSHA-256一覧を保存

## production configの現在値

`npm run verify:deployment`は外部実値が未設定のため9理由で停止します。

1. DB_V2 real UUID
2. AUTH_LOGIN_IP_LIMITER
3. AUTH_LOGIN_ACCOUNT_LIMITER
4. PUBLIC_COMMENT_RATE_LIMITER
5. AUTH_PUBLIC_EMAIL_LIMITER
6. AUTH_EMAIL_FROM
7. AUTH_EMAIL_REPLY_TO
8. TURNSTILE_SITE_KEY
9. EMAIL allowed_sender_addresses

これは意図したfail-closedです。実値設定後にsource manifestを更新し 新しいrelease commitを作ります。

## 外部環境でのみ確認できる項目

- Cloudflare accountの実UUIDとnamespace ID
- remote existing data preflight
- remote migration
- remote trigger存在
- active Owner
- Email Service domainとplan
- secret設定
- staging deployと44項目受入試験
- production deployとsmoke
- Time Travel bookmark
- exact rollback Worker version
- Windows PowerShell環境での`safe-deploy.ps1`実行

外部値は推測していません。
