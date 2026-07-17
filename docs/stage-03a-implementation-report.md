# CPCV 第3段階A 実装報告書

## 1. 結論

第2段階ローカル完成版を基準に、第3段階Aの認証基盤を実装した。API route、管理画面、Student UI、Viewer UI、旧D1、GitHub workflow、Cloudflare remote resourceには接続していない。

第3段階Aの新規試験は120件成功。第2段階の回帰試験は154件成功した。失敗は0件である。

## 2. 実装範囲

### 2.1 D1 migration

`migrations-v2/0002_auth_security.sql`を追加した。

- `users.failed_login_count`
- `users.locked_until`
- `users.require_password_change`
- `idx_users_lock_state`

空のlocal D1へ`0001`と`0002`を適用できる。二回目のmigration applyはno-opになる。

### 2.2 Passwordとtoken

`src/auth/passwords.js`を追加した。

- 現行scheme: `pbkdf2-sha256-600000-v2`
- 旧scheme: `pbkdf2-sha256-100000-v1`
- PBKDF2 SHA-256
- 16-byte salt
- 32-byte hash
- 32-byte以上のsession、CSRF、reset token生成
- SHA-256 token hash
- 12〜128 Unicode codepointのpassword policy
- login IDと同一のpassword拒否
- 旧scheme検証とrehash判定

Bootstrap Ownerも現行schemeを使用するよう更新した。

### 2.3 Cookie

`src/auth/cookies.js`を追加した。

Production:

```text
__Host-cpcv_session
Secure
HttpOnly
SameSite=Strict
Path=/
Domainなし
```

Local loopback:

```text
cpcv_session_dev
HttpOnly
SameSite=Strict
Path=/
Secureなし
```

Local cookieは`localhost`、`127.0.0.1`、`::1`だけで使用できる。

### 2.4 OriginとCSRF

`src/auth/csrf.js`を追加した。

- unsafe methodをPOST、PUT、PATCH、DELETEとして判定
- `AUTH_ORIGIN`との完全一致
- scheme、host、port違いを拒否
- suffix攻撃と複数値を拒否
- JSON Content-Type検査
- `X-CSRF-Token`のhash照合
- session間のCSRF token流用を拒否

### 2.5 Session

`src/auth/sessions.js`を追加した。

- idle期限2時間
- absolute期限12時間
- `last_seen_at`更新間隔5分
- idle延長はabsolute期限を超えない
- raw session tokenとraw CSRF tokenを分離
- AuthContext内部情報を非列挙Symbolへ格納

### 2.6 Permission matrix

`src/auth/permissions.js`を追加した。

- Owner、Admin、Teacherのpermission matrix
- OwnerによるAdmin、Teacher管理
- AdminによるTeacher管理
- AdminによるOwner、Admin管理の拒否
- Teacherによるmember管理の拒否

最後のOwner保護は組織管理APIを実装する第3段階Bで条件付きUPDATEとして追加する。

### 2.7 Rate Limiting utility

`src/auth/rate-limit.js`を追加した。

- Cloudflare Rate Limiting bindingの`limit({ key })`形式
- 生login IDやIPをkeyへ出さないhash key
- pepper必須
- quota超過時429
- binding障害時はlimiterだけfail-open
- D1 account lockとは分離

### 2.8 Authentication middleware

`src/auth/middleware.js`を追加した。

Cookie tokenをhash化し、次を一回のJOINで検査する。

- `auth_sessions`
- `users`
- `organizations`
- `organization_members`

検査内容:

- session存在
- revoked状態
- idle期限
- absolute期限
- user active
- organization active
- membership active
- role妥当性

返却する公開AuthContextは次の6項目だけである。

```text
sessionId
organizationId
userId
role
loginId
displayName
```

## 3. 変更しなかった範囲

- `src/index.js`
- `src/routes/**`
- `src/lib/master-auth.js`
- `src/lib/password.js`
- `public/**`
- `migrations/**`
- `.github/workflows/**`
- `wrangler.toml`
- `package-lock.json`
- `pnpm-lock.yaml`

第3段階Aの認証部品は既存routeへ未接続である。

## 4. 試験結果

```text
Stage 2 DB回帰: 154 passed, 0 failed
Stage 3-A:       120 passed, 0 failed
合計:            274 passed, 0 failed
```

追加検査:

```text
npm run check                 合格
npm run check:project         合格
npm run check:pdf-links       合格
npm run deploy:dry-run        合格
npm audit --omit=dev          0 vulnerabilities
Stage 2 boundary verification 合格
Stage 3-A boundary verification 合格
```

開発依存を含む`npm audit`はlow 1件。high 4件。合計5件を報告した。対象はWranglerとその推移依存である。production依存は0件である。依存関係の自動更新はStage 3-Aへ混在させていない。

詳細は`docs/stage-03a-test-results.txt`を参照する。完成ソースを空ディレクトリへ再構成し、`npm ci`後に同じ274件と全静的検査を再実行して合格した。

## 5. 未実装

次は第3段階Bで実装する。

- login、logout、session API
- password変更API
- password reset発行と消費
- account lock更新処理
- 組織member管理API
- audit log API
- 最後のactive Owner保護
- role変更とmembership停止時のsession失効

第3段階Cまで実装しないもの:

- 授業API認可
- 新旧D1投影
- UIのCookie認証化
- LocalStorage token撤去
- legacy認証API停止

## 6. Remote環境

次は実行していない。

- Cloudflare login
- Remote D1作成
- Remote migration
- Worker deploy
- GitHub push

## 7. 総合判定

第3段階Aはローカル実装として合格である。第3段階Bの基準ソースとして使用できる。

## 参考文献

Cloudflare. (2026, June 22). *Prepared statement methods*. Cloudflare D1 Documentation. https://developers.cloudflare.com/d1/worker-api/prepared-statements/

Cloudflare. (2026). *Rate Limiting*. Cloudflare Workers Documentation. https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

MDN contributors. (2026, June 15). *Set-Cookie header*. MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie

OWASP Foundation. (n.d.). *Password Storage Cheat Sheet*. OWASP Cheat Sheet Series. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
