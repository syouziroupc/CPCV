# CPCV Stage 8.2 deployment hardening履歴

> **重要:** このフォルダは Stage 8.2導入時点のhistorical snapshotです。現在のU-22凍結候補 Web `0.8.10` / Desktop `0.2.2` のruntime状態やdeployment状態の正本ではありません。現在値は `../../README.md`、`../current-system.md`、`../known-issues.md`、`../../wrangler.toml`、`../../SOURCE_GIT_RECORD.txt` を確認してください。

文書release: `stage08-final-spec-3`
当時の対象code version: `0.8.2`
対象migration: `0001`〜`0017`
当時の記録上のCloudflare remote変更: 未実施

この「未実施」は**当時のsnapshotの記録**であり、現在のproduction状態を意味しません。本フォルダのpending valuesやresource値を現行値として転記しません。

## この履歴資料内での優先順位

1. 当時のsourceとappend-only migration
2. 当時の自動試験と検査script
3. 本フォルダのStage 8.2文書
4. さらに古い段階別文書と過去log

旧文書に`0.8.1`、`0016`、Stage 8.1等と書かれていても履歴記録です。現在のreleaseをそのままdeployする指示として使用しません。

## Stage 8.2導入手順を監査するときの読む順序

1. `20_CODEX_DEPLOY_INSTRUCTION_FINAL.md`
2. `17_CLOUDFLARE_PENDING_VALUES.md`
3. `19_DEPLOYMENT_FINAL_CHECKLIST.md`
4. `18_STAGE82_FINAL_HARDENING.md`
5. `02_CURRENT_ARCHITECTURE.md`
6. `03_DATA_AND_MIGRATION_SPEC.md`
7. `04_SECURITY_AUTHORIZATION_SPEC.md`
8. `05_API_REALTIME_UI_SPEC.md`
9. `06_MODERATION_AI_TRANSLATION_FILTER_SPEC.md`
10. `07_PDF_ANALYTICS_PRIVACY_SPEC.md`
11. `08_CLOUDFLARE_RESOURCE_SPEC.md`
12. `09_CODEX_CLOUDFLARE_RUNBOOK.md`
13. `10_STAGING_ACCEPTANCE_TEST.md`
14. `11_PRODUCTION_CUTOVER_AND_ROLLBACK.md`
15. `12_OPERATIONS_MONITORING.md`
16. `13_CONFIGURATION_WORKSHEET.md`
17. `21_FINAL_VERIFICATION_REPORT.md`
18. `15_REFERENCES.md`
19. `templates/WRANGLER_STAGING_TEMPLATE.toml`
20. `templates/STAGING_ACCEPTANCE_RECORD_TEMPLATE.txt`

## 現在も有効な安全原則

- UUID、namespace ID、secret、domainを推測しない。
- `0001`〜`0017`を編集しない。
- productionとstagingのD1、Queue、Workerを共有しない。
- PDF bytes、filename、page text、画像をCloudflareへ送らない。
- dirty tree、hash不一致、試験失敗、config検査失敗で停止する。
- staging合格記録がないcommitをproductionへdeployしない。
- staging configと受入記録の実ファイルをhashと内容で検査する。
- Time Travel restoreは破壊的操作として明示承認なしに実行しない。
- `22_AUDIT_FIX_MATRIX.md` / `.csv` は元監査71件の修正対応表として保持する。
