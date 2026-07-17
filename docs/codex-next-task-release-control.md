# Codex task: release-control integration

## Objective

Integrate the release-control workflow change without modifying application behavior.

## Required changes

1. Replace the combined deployment workflow with:
   - `.github/workflows/ci.yml`
   - `.github/workflows/deploy-production.yml`
2. Add `docs/release-process.md`.
3. Do not change `src/**`, `public/**`, `migrations/**`, or `migrations-v2/**`.
4. Do not deploy and do not execute any remote D1 command.

## Verification

Run:

```bash
npm ci
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage02
npm run deploy:dry-run
npm audit --omit=dev
```

Inspect the workflow YAML and confirm:

- push and pull request events cannot reach a deploy job;
- production deployment requires `workflow_dispatch`;
- the deployment checks the selected ref;
- the confirmation text must be exactly `DEPLOY_PRODUCTION`;
- deployment is refused until `DB_V2.database_id` is configured;
- no remote command was executed during implementation or testing.

## Deliverables

- one focused commit;
- changed-file list;
- test results;
- a statement that no remote deployment or migration occurred.
