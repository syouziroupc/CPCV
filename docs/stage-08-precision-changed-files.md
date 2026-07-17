# Stage 8.1 変更ファイル

## tracked差分

```text
M	README.md
M	docs/INDEX.md
M	docs/current-system.md
M	docs/stage-08-codex-cloudflare-deployment.md
M	docs/stage-08-db-spec.md
M	package-lock.json
M	package.json
M	public/_admin_spa.html
M	public/_j_spa.html
M	public/_viewer_spa.html
M	public/admin/index.html
M	public/assets/admin.js
M	public/assets/join.js
M	public/assets/viewer.js
M	public/j/index.html
M	public/viewer/index.html
M	scripts/test-bootstrap-owner-v2.mjs
M	scripts/test-pdf-analysis-v2.mjs
M	scripts/test-stage08-all.mjs
M	scripts/verify-precision-boundaries.mjs
M	scripts/verify-remote-d1.mjs
M	scripts/verify-stage06-5-boundaries.mjs
M	scripts/verify-stage06-5a-boundaries.mjs
M	scripts/verify-stage07-8-boundaries.mjs
M	scripts/verify-stage07-boundaries.mjs
M	scripts/verify-stage08-boundaries.mjs
M	src/index.js
M	src/pdf-analysis/repository.js
M	src/pdf-analysis/validation.js
M	src/routes/pdf-analysis.js
M	src/routes/public-v2.js
```

## 新規ファイル

```text
docs/stage-08-precision-cloudflare-deployment.md
docs/stage-08-precision-debug-report.md
docs/stage-08-precision-migration-verification.txt
docs/stage-08-precision-rollback.md
docs/stage-08-precision-spec.md
docs/stage-08-precision-test-results.txt
docs/stage-08-precision-visual-review.md
docs/stage08-precision-logs/final-functional/audit-filter-packs.exit
docs/stage08-precision-logs/final-functional/test-account-lifecycle-v2.exit
docs/stage08-precision-logs/final-functional/test-ai-v2.exit
docs/stage08-precision-logs/final-functional/test-auth-api-v2.exit
docs/stage08-precision-logs/final-functional/test-auth-v2.exit
docs/stage08-precision-logs/final-functional/test-bilingual-filter-v2.exit
docs/stage08-precision-logs/final-functional/test-comments-v2.exit
docs/stage08-precision-logs/final-functional/test-content-filter-v2.exit
docs/stage08-precision-logs/final-functional/test-db-v2.exit
docs/stage08-precision-logs/final-functional/test-email-auth-v2.exit
docs/stage08-precision-logs/final-functional/test-filter-pack-upgrade-v2.exit
docs/stage08-precision-logs/final-functional/test-moderation-v2.exit
docs/stage08-precision-logs/final-functional/test-pdf-analysis-v2.exit
docs/stage08-precision-logs/final-functional/test-private-v2.exit
docs/stage08-precision-logs/final-functional/test-realtime-v2.exit
docs/stage08-precision-logs/final-verification/deploy-dry-run.txt
docs/stage08-precision-logs/final-verification/deployment-verifiers.txt
docs/stage08-precision-logs/final-verification/npm-audit-production.txt
docs/stage08-precision-logs/final-verification/npm-audit.txt
docs/stage08-precision-logs/final-verification/pdf-links.txt
docs/stage08-precision-logs/final-verification/precision-boundaries.txt
docs/stage08-precision-logs/final-verification/project-check.txt
docs/stage08-precision-logs/final-verification/stage-compatibility.txt
docs/stage08-precision-logs/final-verification/stage08-boundaries.txt
docs/stage08-precision-logs/final-verification/static-check.txt
docs/stage08-precision-logs/migrations/foreign-key.json
docs/stage08-precision-logs/migrations/fresh-apply.txt
docs/stage08-precision-logs/migrations/history.json
docs/stage08-precision-logs/migrations/quick-check.json
docs/stage08-precision-logs/migrations/reapply.txt
docs/stage08-precision-logs/migrations/triggers.json
docs/stage08-precision-logs/tests/owner-bootstrap.txt
migrations-v2/0016_stage08_precision_hardening.sql
```

## 検証証跡

`docs/stage08-precision-logs/`へ各機能試験の全文ログ。migration結果。境界検査。dry-run。auditを収録した。
