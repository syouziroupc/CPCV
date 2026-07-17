# Codex指示: 第3段階 認証・組織権限実装

## 絶対条件

設計判断を追加しない。`docs/stage-03-spec.md`と`docs/stage-03-contract-addendum.md`の内容を実装する。衝突時は補遺を優先する。矛盾、D1非対応構文、現行コードとの衝突を見つけた場合は実装を止め、該当箇所、再現方法、最小修正案だけを報告する。

## 事前条件

- 第2段階完成sourceを使用
- `stage-02-database`がcommit済み
- remote作業未完了の場合はlocalのみで実装
- 本番deploy禁止
- Stage 3はA。B。Cへ分割する。各作業branchと指示は `docs/codex-stage-03-a.md`。`docs/codex-stage-03-b.md`。`docs/codex-stage-03-c.md` に従う。

## 最初のコマンド

```bash
git status --short
git branch --show-current
git rev-parse HEAD
npm ci
npm run check:stage02
```

失敗したらStage 3へ進まない。

## 変更対象

### 新規候補

```text
migrations-v2/0002_auth_security.sql
src/auth/cookies.js
src/auth/csrf.js
src/auth/middleware.js
src/auth/passwords.js
src/auth/permissions.js
src/auth/rate-limit.js
src/auth/sessions.js
src/routes/auth.js
src/routes/organization.js
src/routes/private-v2.js
src/db/live-session-projection.js
scripts/test-auth-v2.mjs
scripts/verify-stage03-boundaries.mjs
docs/stage-03-implementation-report.md
docs/stage-03-debug-report.md
docs/stage-03-test-results.txt
```

### 変更可

```text
src/index.js
public/assets/admin.js
public/assets/master.js
public/admin/index.html
public/master/index.html
package.json
wrangler.toml
.gitignore
docs/INDEX.md
```

### 変更禁止

```text
migrations/**
public/assets/join.js
public/assets/viewer.js
public/j/**
public/viewer/**
srcのDurable Object comment protocol
PDF.js
lock files。依存追加がない限り変更禁止
.github/workflows/**
```

## 実装単位

### Unit 1: DB migration

- `0002_auth_security.sql`
- users lock列
- index
- migration試験追加

完了後にDB試験だけ実行する。

### Unit 2: 純粋utility

- Cookie serialize/parse
- token generate/hash
- password hash/verify
- constant-time compare
- Origin検査
- CSRF検査
- permission matrix

外部I/Oなしのunit testを先に作る。

### Unit 3: Auth middleware

- Cookieからsession取得
- DB_V2 JOIN検証
- idle/absolute expiry
- session revocation
- AuthContext
- no-store response helper

### Unit 4: Login/logout/session

- rate limiter mock対応
- account lock
- multi-organization selection
- Set-Cookie
- CSRF raw token返却
- generic errors

### Unit 5: Password

- change
- reset issue
- reset consume
- session全失効
- multi-organization reset拒否

### Unit 6: Organization role API

- member list/create/update/remove
- last Owner protection
- Admin制限
- audit log

### Unit 7: Session authorization/projection

- DB_V2 authorization
- old DB projection
- compensation
- audit
- login以外のrequest organizationIdは400で拒否

### Unit 8: UI token removal

- LocalStorage token削除
- Cookie credentials
- in-memory CSRF
- login organization selection
- UI全面変更なし

### Unit 9: Legacy endpoint flag

- V2有効時にlegacy authを410
- public studentとWebSocketは維持

### Unit 10: 全試験

`docs/stage-03-test-spec.md`を全件実装する。

## テストコマンド

最低限:

```bash
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage02
npm run db:v2:migrate:local
npm run test:auth-v2
npm run check:stage03
npm run deploy:dry-run
npm ls --all
npm audit --omit=dev
```

script名をpackage.jsonへ追加する。

## 禁止事項

- 本番deploy
- remote D1への勝手なmigration
- 架空database ID
- 架空Rate Limit namespace ID
- Master tokenを新版へ持ち込む
- Cookie tokenをresponse JSONへ返す
- tokenをLocalStorageへ保存
- client organizationIdを権限根拠にする
- Student/Viewerをリファクタリング
- WebSocket token方式変更
- 複数段階の同時実装

## commit

```bash
git diff --check
git status --short
git diff --stat
git add <Stage 3対象だけ>
git commit -m "stage-03: add organization-scoped cookie authentication"
```

## 最終報告

- 変更ファイル
- migration SQL
- API一覧
- Cookie属性
- CSRF方式
- rate limit設定。namespace IDは伏せる必要なし。ただし架空値禁止
- role試験結果
- cross-organization試験結果
- projection整合試験結果
- 未解決事項
- commit ID
- SHA-256
