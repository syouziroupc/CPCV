# CPCV 第3段階A 変更ファイル一覧

## 追加

- `migrations-v2/0002_auth_security.sql`
- `src/auth/cookies.js`
- `src/auth/csrf.js`
- `src/auth/errors.js`
- `src/auth/middleware.js`
- `src/auth/passwords.js`
- `src/auth/permissions.js`
- `src/auth/rate-limit.js`
- `src/auth/sessions.js`
- `scripts/test-auth-v2.mjs`
- `scripts/verify-stage03a-boundaries.mjs`
- `docs/stage-03a-implementation-report.md`
- `docs/stage-03a-debug-report.md`
- `docs/stage-03a-changed-files.md`
- `docs/stage-03a-test-results.txt`
- `docs/stage-03a-final-manifest.sha256`

## 変更

- `.gitignore`
  - Stage 3-A local test状態を除外
- `package.json`
  - Stage 3-A試験commandを追加
- `scripts/bootstrap-owner.mjs`
  - 現行password utilityと12〜128文字policyを使用
- `scripts/bootstrap-owner-worker.mjs`
  - 600,000回schemeと`0002`適用済みschemaを要求
- `scripts/test-db-v2.mjs`
  - `0002`後の列、17 INDEX、schema fingerprintへ更新
- `scripts/verify-stage02-boundaries.mjs`
  - `src/auth/**`だけの隔離されたDB_V2参照を許可
- `docs/database-schema.md`
  - Stage 3-A schemaと認証基盤を追記
- `docs/stage-03-contract-addendum.md`
  - Rate Limiting binding呼出しを`limit({ key })`へ固定
- `docs/INDEX.md`
  - Stage 3-A成果物を追加

## 未変更

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
- `pnpm-workspace.yaml`
- `README.md`
