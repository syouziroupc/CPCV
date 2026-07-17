# CPCV 第2段階 変更ファイル一覧

## 変更した既存ファイル

- `.gitignore`
  - local D1状態、試験用状態、bootstrap一時設定を除外
- `package.json`
  - DB_V2 migration、schema test、bootstrap、境界検査commandを追加
- `wrangler.toml`
  - `DB_V2` bindingと`migrations_dir`を追加
  - 実UUID不明のためremote `database_id`は未記載
- `docs/INDEX.md`
  - 第2段階資料への索引を追加

## 追加ファイル

- `migrations-v2/0001_initial_schema.sql`
- `scripts/bootstrap-owner.mjs`
- `scripts/bootstrap-owner-worker.mjs`
- `scripts/test-db-v2.mjs`
- `scripts/verify-stage02-boundaries.mjs`
- `docs/stage-02-spec.md`
  - 実装前検証で判明したTEXT主キーのNULL許容を訂正
- `docs/stage-02-implementation-decisions.md`
- `docs/database-schema.md`
- `docs/stage-02-changed-files.md`
- `docs/stage-02-implementation-report.md`
- `docs/stage-02-debug-report.md`
- `docs/stage-02-git-record.md`
- `docs/stage-02-test-results.txt`
- `docs/stage-02-final-manifest.sha256`

## 未変更

- `migrations/**`
- `src/**`
- `public/**`
- `.github/workflows/deploy.yml`
- `package-lock.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `README.md`

Stage 1 manifestを使い、変更を許可した`.gitignore`、`package.json`、`wrangler.toml`以外の既存ファイルをSHA-256で比較する。
