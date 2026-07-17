# CPCV Stage 3-B 変更ファイル一覧

基準は`CPCV_stage03A_implemented_source.zip`。

## 追加した実装ファイル

- `src/auth/account-lock.js`
- `src/auth/audit.js`
- `src/auth/http.js`
- `src/auth/request.js`
- `src/routes/auth.js`
- `src/routes/organization.js`

## 追加した試験ファイル

- `scripts/test-auth-api-v2.mjs`
- `scripts/verify-stage03b-boundaries.mjs`

## 追加した文書

- `docs/stage-03b-implementation-report.md`
- `docs/stage-03b-debug-report.md`
- `docs/stage-03b-test-results.txt`
- `docs/stage-03b-changed-files.md`
- `docs/stage-03b-next-development.md`
- `docs/stage-03b-source-manifest.sha256`

## 変更したファイル

- `README.md`
- `docs/INDEX.md`
- `docs/stage-03-spec.md`
- `package.json`
- `package-lock.json`
- `src/auth/errors.js`
- `src/index.js`

## 変更していない重要範囲

- `public/**`
- `migrations/**`
- `src/routes/master.js`
- 既存授業route
- 旧DB投影
- `.github/workflows/**`
- `wrangler.toml`

## 削除したファイル

なし。
