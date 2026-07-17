# Stage 4 精密監査 変更ファイル

## Git差分

```text
M	.github/workflows/ci.yml
M	.github/workflows/deploy-production.yml
M	.gitignore
M	README.md
M	docs/INDEX.md
M	docs/api-baseline.md
M	docs/current-system.md
M	docs/known-issues.md
M	docs/release-process.md
M	docs/stage-04-review-checklist.md
M	docs/stage-04-spec.md
M	docs/stage-04-test-spec.md
M	docs/stage-05-next-development.md
M	package-lock.json
M	package.json
D	pnpm-lock.yaml
D	pnpm-workspace.yaml
M	public/_admin_spa.html
M	public/_viewer_spa.html
M	public/admin/index.html
M	public/assets/admin.js
M	public/assets/app.css
M	public/assets/viewer.js
M	public/index.html
M	public/j/index.html
M	public/master/index.html
M	public/viewer/index.html
M	scripts/bootstrap-owner-worker.mjs
M	scripts/bootstrap-owner.mjs
M	scripts/create_manual_pdf.py
M	scripts/predeploy-check.mjs
M	scripts/safe-deploy.ps1
M	scripts/test-auth-api-v2.mjs
M	scripts/test-auth-v2.mjs
M	scripts/test-comments-v2.mjs
M	scripts/test-db-v2.mjs
M	scripts/test-private-v2.mjs
M	scripts/verify-stage02-boundaries.mjs
M	scripts/verify-stage03a-boundaries.mjs
M	scripts/verify-stage03b-boundaries.mjs
M	scripts/verify-stage03c-boundaries.mjs
M	scripts/verify-stage04-boundaries.mjs
M	src/auth/csrf.js
M	src/auth/http.js
M	src/auth/request.js
M	src/comments/cookies.js
M	src/comments/repository.js
M	src/index.js
M	src/routes/auth.js
M	src/routes/organization.js
M	src/routes/private-v2.js
M	src/routes/public-v2.js
M	wrangler.toml
```

## 新規ファイル

```text
.precision-final-d1/v3/d1/miniflare-D1DatabaseObject/62fbde4ed9bc54fee5adb4f489b704ee0b43d063350d5cdcad0b03e4a194ff71.sqlite
.precision-final-d1/v3/d1/miniflare-D1DatabaseObject/bf34411247d52dd443ef376e21554f19dce2e41c0bfc40c05201fbb796235d95.sqlite
.precision-final-d1/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite
docs/archive/stage01-current-system.md
docs/archive/stage01-known-issues.md
docs/cloudflare-deployment-prerequisites.md
docs/stage-04-precision-audit-report.md
docs/stage-04-precision-changed-files.md
docs/stage-04-precision-debug-report.md
docs/stage-04-precision-final-verification.txt
docs/stage-04-precision-test-results.txt
docs/stage04-precision-final-logs/00_SUMMARY.txt
docs/stage04-precision-final-logs/01_check.exit
docs/stage04-precision-final-logs/01_check.txt
docs/stage04-precision-final-logs/02_check_project.exit
docs/stage04-precision-final-logs/02_check_project.txt
docs/stage04-precision-final-logs/03_check_pdf_links.exit
docs/stage04-precision-final-logs/03_check_pdf_links.txt
docs/stage04-precision-final-logs/04_stage_compat.exit
docs/stage04-precision-final-logs/04_stage_compat.txt
docs/stage04-precision-final-logs/05_deployment_verifiers.exit
docs/stage04-precision-final-logs/05_deployment_verifiers.txt
docs/stage04-precision-final-logs/06_stage02.exit
docs/stage04-precision-final-logs/06_stage02.txt
docs/stage04-precision-final-logs/07_stage03a.exit
docs/stage04-precision-final-logs/07_stage03a.txt
docs/stage04-precision-final-logs/08_stage03b.exit
docs/stage04-precision-final-logs/08_stage03b.txt
docs/stage04-precision-final-logs/09_stage03c.exit
docs/stage04-precision-final-logs/09_stage03c.txt
docs/stage04-precision-final-logs/10_stage04.exit
docs/stage04-precision-final-logs/10_stage04.txt
docs/stage04-precision-final-logs/11_precision_boundaries.exit
docs/stage04-precision-final-logs/11_precision_boundaries.txt
docs/stage04-precision-final-logs/11_precision_boundaries_after_ui.exit
docs/stage04-precision-final-logs/11_precision_boundaries_after_ui.txt
docs/stage04-precision-final-logs/12_stage04_boundaries.exit
docs/stage04-precision-final-logs/12_stage04_boundaries.txt
docs/stage04-precision-final-logs/13_deploy_dry_run.exit
docs/stage04-precision-final-logs/13_deploy_dry_run.txt
docs/stage04-precision-final-logs/14_npm_ls.exit
docs/stage04-precision-final-logs/14_npm_ls.txt
docs/stage04-precision-final-logs/15_npm_audit.exit
docs/stage04-precision-final-logs/15_npm_audit.txt
docs/stage04-precision-final-logs/16_npm_audit_prod.exit
docs/stage04-precision-final-logs/16_npm_audit_prod.txt
docs/stage04-precision-final-logs/17_local_migration_rehearsal.txt
docs/stage04-precision-final-logs/18_dev_legacy_migration.txt
docs/stage04-precision-final-logs/19_dev_v2_migration.txt
docs/stage04-precision-final-logs/20_dev_server.pid
docs/stage04-precision-final-logs/20_dev_server.txt
docs/stage04-precision-final-logs/21_local_http_smoke.txt
docs/stage04-precision-final-logs/22_local_bootstrap.txt
docs/stage04-precision-final-logs/23_local_bootstrap_repeat.txt
docs/stage04-precision-final-logs/24_local_bootstrap_db_check.txt
docs/stage04-precision-final-logs/25_bootstrap_suite_after_fix.txt
docs/stage04-precision-final-logs/26_stage02_after_bootstrap_fix.txt
docs/stage04-precision-final-logs/27_worker_e2e.txt
docs/stage04-precision-final-logs/28_worker_e2e_after_local_pepper.txt
docs/stage04-precision-final-logs/29_scheduled_body.txt
docs/stage04-precision-final-logs/29_scheduled_headers.txt
docs/stage04-precision-final-logs/30_reusable_worker_e2e.txt
docs/stage04-precision-final-logs/31_precision_boundaries_final.txt
docs/stage04-precision-final-logs/32_check_precision_final.txt
docs/stage04-precision-final-logs/33_manual_create.txt
docs/stage04-precision-final-logs/34_manual_render.txt
docs/stage04-precision-final-logs/35_manual_contact_sheet.txt
docs/stage04-precision-final-logs/36_check.txt
docs/stage04-precision-final-logs/37_check_project.txt
docs/stage04-precision-final-logs/38_check_pdf_links.txt
docs/stage04-precision-final-logs/39_deploy_dry_run.txt
docs/stage04-precision-final-logs/40_npm_ls.txt
docs/stage04-precision-final-logs/41_npm_audit.txt
docs/stage04-precision-final-logs/42_npm_audit_prod.txt
docs/stage04-precision-final-logs/43_git_diff_check.txt
docs/stage04-precision-final-logs/44_reextract_check_precision.txt
docs/stage04-precision-final-logs/45_reextract_check.txt
docs/stage04-precision-final-logs/46_reextract_check_project.txt
docs/stage04-precision-final-logs/47_reextract_check_pdf_links.txt
docs/stage04-precision-final-logs/48_reextract_deploy_dry_run.txt
docs/stage04-precision-final-logs/49_reextract_npm_ls.txt
docs/stage04-precision-final-logs/50_reextract_npm_audit.txt
docs/stage04-precision-final-logs/51_reextract_npm_audit_prod.txt
docs/stage04-precision-final-logs/52_reextract_migrate_first.txt
docs/stage04-precision-final-logs/53_reextract_migrate_second.txt
docs/stage04-precision-final-logs/54_reextract_bootstrap.txt
docs/stage04-precision-final-logs/55_reextract_worker_e2e.txt
docs/stage04-precision-final-logs/56_reextract_scheduled.txt
docs/stage04-precision-screenshots/admin-desktop.json
docs/stage04-precision-screenshots/admin-desktop.png
docs/stage04-precision-screenshots/admin-mobile.json
docs/stage04-precision-screenshots/admin-mobile.png
docs/stage04-precision-screenshots/join-desktop.json
docs/stage04-precision-screenshots/join-desktop.png
docs/stage04-precision-screenshots/join-mobile.json
docs/stage04-precision-screenshots/join-mobile.png
docs/stage04-precision-screenshots/master-desktop.json
docs/stage04-precision-screenshots/master-desktop.png
docs/stage04-precision-screenshots/master-mobile.json
docs/stage04-precision-screenshots/master-mobile.png
docs/stage04-precision-screenshots/viewer-desktop.json
docs/stage04-precision-screenshots/viewer-desktop.png
docs/stage04-precision-screenshots/viewer-mobile.json
docs/stage04-precision-screenshots/viewer-mobile.png
migrations-v2/0004_precision_hardening.sql
migrations-v2/0005_comment_content_guards.sql
requirements-manual.txt
scripts/__pycache__/create_manual_pdf.cpython-313.pyc
scripts/configure-rate-limit-secret.mjs
scripts/print-production-origin.mjs
scripts/smoke-local-stage04.mjs
scripts/smoke-production.mjs
scripts/stage-compatibility-checks.mjs
scripts/test-bootstrap-owner-v2.mjs
scripts/test-db-v2-schema.mjs
scripts/test-deployment-verifiers.mjs
scripts/test-stage-compatibility.mjs
scripts/verify-d1-query-result.mjs
scripts/verify-deployment-config.mjs
scripts/verify-precision-boundaries.mjs
scripts/verify-remote-d1.mjs
src/auth/csrf-tokens.js
src/auth/maintenance.js
src/security-headers.js
```
